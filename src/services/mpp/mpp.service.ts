import type {
  MppPlayer,
  MppRawStandingEntry,
  MppRawUser,
  MppUserContestsResponse,
  MppContestCard,
  DepartmentStats,
  DepartmentPointDistribution,
  DepartmentCode,
} from "../../types/mpp.types.js";
import { getDepartmentFromPseudo } from "../../utils/departments.js";
import { requestMpp, hasToken } from "./mpp-api.client.js";

// ---------------------------------------------------------------------------
// Cache mémoire (TTL via MPP_CACHE_TTL en secondes, défaut 5 min)
// ---------------------------------------------------------------------------
interface CacheEntry<T> { data: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { cache.delete(key); return undefined; }
  return e.data as T;
}
function cacheSet<T>(key: string, data: T): void {
  const ttl = parseInt(process.env["MPP_CACHE_TTL"] ?? "300", 10) * 1000;
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}
export function invalidateCache(): void { cache.clear(); }

// ---------------------------------------------------------------------------
// Mock — actif quand MPP_ACCESS_TOKEN absent OU MPP_USE_MOCK=true
// ---------------------------------------------------------------------------
const MOCK_PLAYERS: MppPlayer[] = [
  { id: "1",  pseudo: "MT_Nabil",    rank: 1,  points: 1250, departmentCode: "MT", departmentName: "MyTower",  exactScores: 12, goodResults: 35, playedPredictions: 50 },
  { id: "2",  pseudo: "MT_Alice",    rank: 2,  points: 1100, departmentCode: "MT", departmentName: "MyTower",  exactScores: 10, goodResults: 30, playedPredictions: 48 },
  { id: "3",  pseudo: "MT_Karim",    rank: 4,  points: 920,  departmentCode: "MT", departmentName: "MyTower",  exactScores: 9,  goodResults: 27, playedPredictions: 46 },
  { id: "4",  pseudo: "ES-Julie",    rank: 3,  points: 980,  departmentCode: "ES", departmentName: "e-SCM",    exactScores: 8,  goodResults: 28, playedPredictions: 45 },
  { id: "5",  pseudo: "ES-Marc",     rank: 6,  points: 870,  departmentCode: "ES", departmentName: "e-SCM",    exactScores: 7,  goodResults: 25, playedPredictions: 42 },
  { id: "6",  pseudo: "ES-Camille",  rank: 8,  points: 710,  departmentCode: "ES", departmentName: "e-SCM",    exactScores: 5,  goodResults: 20, playedPredictions: 39 },
  { id: "7",  pseudo: "TD Mehdi",    rank: 5,  points: 890,  departmentCode: "TD", departmentName: "TDi",      exactScores: 6,  goodResults: 22, playedPredictions: 40 },
  { id: "8",  pseudo: "TD_Sara",     rank: 7,  points: 760,  departmentCode: "TD", departmentName: "TDi",      exactScores: 5,  goodResults: 18, playedPredictions: 38 },
  { id: "9",  pseudo: "TD Léa",      rank: 9,  points: 640,  departmentCode: "TD", departmentName: "TDi",      exactScores: 4,  goodResults: 16, playedPredictions: 35 },
  { id: "10", pseudo: "WD_Player1",   rank: 10, points: 580, departmentCode: "WD", departmentName: "Winddle", exactScores: 4, goodResults: 16, playedPredictions: 32 },
  { id: "11", pseudo: "RandomPlayer", rank: 11, points: 500, departmentCode: "UNKNOWN", departmentName: "Inconnu", exactScores: 3, goodResults: 15, playedPredictions: 30 },
];

export function useMock(): boolean {
  return !hasToken() || process.env["MPP_USE_MOCK"] === "true";
}

// ---------------------------------------------------------------------------
// GET /user — profil utilisateur connecté (pour debug)
// ---------------------------------------------------------------------------
export async function getMppUser(): Promise<MppRawUser> {
  const cached = cacheGet<MppRawUser>("user");
  if (cached) return cached;
  const user = await requestMpp<MppRawUser>("/user");
  cacheSet("user", user);
  return user;
}

// ---------------------------------------------------------------------------
// GET /user-contests — liste des ligues/défis de l'utilisateur
// ---------------------------------------------------------------------------
async function getUserContests(): Promise<MppUserContestsResponse> {
  const cached = cacheGet<MppUserContestsResponse>("contests");
  if (cached) return cached;
  const data = await requestMpp<MppUserContestsResponse>("/user-contests");
  cacheSet("contests", data);
  return data;
}

// Résolution du challengeId cible :
// 1. MPP_CHALLENGE_ID (hardcodé dans .env) → priorité absolue
// 2. MPP_LEAGUE_TITLE → cherche par titre (insensible à la casse)
// 3. Premier contest non-pinned dans contestsCards
async function resolveContestId(): Promise<string | undefined> {
  const hardcoded = process.env["MPP_CHALLENGE_ID"];
  if (hardcoded) return hardcoded;

  const data = await getUserContests();
  const all: MppContestCard[] = [
    ...(data.contestsCards ?? []),
    ...(data.pinnedChallengesCards ?? []),
  ];

  const titleFilter = process.env["MPP_LEAGUE_TITLE"]?.toLowerCase();
  if (titleFilter) {
    const match = all.find((c) => c.title.toLowerCase().includes(titleFilter));
    if (match) return match.contestId;
  }

  // Priorité aux contests personnels (non-supervisés, non-pinnés)
  const personal = (data.contestsCards ?? []).find((c) => !c.isSupervised);
  if (personal) return personal.contestId;

  return all[0]?.contestId;
}

// ---------------------------------------------------------------------------
// GET /challenge-standings/users-standings?challengeId={id}&offset={n}&limit={n}
// ---------------------------------------------------------------------------
function extractStandings(raw: unknown): MppRawStandingEntry[] {
  if (Array.isArray(raw)) return raw as MppRawStandingEntry[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["usersStandings", "standings", "ranking", "rankings", "users", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as MppRawStandingEntry[];
    }
    // Premier tableau trouvé
    for (const val of Object.values(obj)) {
      if (Array.isArray(val) && val.length > 0) return val as MppRawStandingEntry[];
    }
  }
  return [];
}

function getConfiguredStandingsLimit(totalUsers?: number): number {
  const minimumExpectedLeagueSize = 300;
  const configured = Number.parseInt(process.env["MPP_STANDINGS_LIMIT"] ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(configured, totalUsers ?? 0, minimumExpectedLeagueSize);
  }

  // Some MPP endpoints cap a single response. Keep the global fetch bounded,
  // but do not trust totalUsers as a hard stop because contest cards can lag.
  return Math.max(totalUsers ?? 0, 1000, minimumExpectedLeagueSize);
}

function getStandingsPageSize(): number {
  const configured = Number.parseInt(process.env["MPP_STANDINGS_PAGE_SIZE"] ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) return configured;

  return 20;
}

function getStandingEntryKey(entry: MppRawStandingEntry): string | undefined {
  const user = (typeof entry["user"] === "object" && entry["user"] !== null ? entry["user"] : {}) as Record<string, unknown>;
  const id = user["id"] ?? entry.userId ?? entry.id;
  if (id !== undefined && id !== null) return `id:${String(id)}`;

  const username = user["username"] ?? user["pseudo"] ?? user["firstName"] ?? entry.username ?? entry.pseudo ?? entry.firstName;
  const ranking = (typeof entry["ranking"] === "object" && entry["ranking"] !== null ? entry["ranking"] : {}) as Record<string, unknown>;
  const rank = ranking["rank"] ?? entry.rank ?? entry.ranking;

  if (username !== undefined && username !== null && rank !== undefined && rank !== null) {
    return `rank-user:${String(rank)}:${String(username)}`;
  }

  return undefined;
}

async function getContestTotalUsers(contestId: string): Promise<number | undefined> {
  try {
    const data = await getUserContests();
    const all: MppContestCard[] = [
      ...(data.contestsCards ?? []),
      ...(data.pinnedChallengesCards ?? []),
    ];
    const card = all.find((c) => c.contestId === contestId);
    return card?.totalUsers;
  } catch {
    return undefined;
  }
}

async function fetchRawStandings(contestId: string, totalUsers?: number): Promise<MppRawStandingEntry[]> {
  const maxEntries = getConfiguredStandingsLimit(totalUsers);
  const pageSize = getStandingsPageSize();
  const entries: MppRawStandingEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (entries.length < maxEntries) {
    const limit = Math.min(pageSize, maxEntries - entries.length);
    const path = `/challenge-standings/users-standings?challengeId=${encodeURIComponent(contestId)}&offset=${offset}&limit=${limit}`;
    const raw = await requestMpp<unknown>(path);
    const page = extractStandings(raw);

    if (page.length === 0) break;

    let added = 0;
    for (const entry of page) {
      const key = getStandingEntryKey(entry);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push(entry);
      added += 1;
      if (entries.length >= maxEntries) break;
    }

    if (added === 0) break;

    offset += page.length;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Normalisation brut → modèle interne
// ---------------------------------------------------------------------------
function normalizeEntry(entry: MppRawStandingEntry, index: number): MppPlayer {
  // L'API retourne { user: {...}, ranking: {...} } — on aplatit d'abord
  const user    = (typeof entry["user"]    === "object" && entry["user"]    !== null ? entry["user"]    : {}) as Record<string, unknown>;
  const ranking = (typeof entry["ranking"] === "object" && entry["ranking"] !== null ? entry["ranking"] : {}) as Record<string, unknown>;

  const pseudo = String(
    user["username"] ?? user["pseudo"] ?? user["firstName"] ??
    entry.username   ?? entry.pseudo   ?? entry.firstName   ?? `Joueur${index + 1}`
  );
  const { code, name } = getDepartmentFromPseudo(pseudo);

  return {
    id:     String(user["id"] ?? entry.userId ?? entry.id ?? index + 1),
    pseudo,
    rank:   Number(ranking["rank"] ?? entry.rank ?? entry.ranking ?? index + 1),
    points: Number(ranking["points"] ?? entry.points ?? entry.totalPoints ?? 0),
    departmentCode: code,
    departmentName: name,
    exactScores:       toOptionalNumber(ranking["exactForecasts"] ?? entry.exactScores ?? entry.exactResults),
    goodResults:       toOptionalNumber(ranking["goodForecasts"]  ?? entry.goodResults ?? entry.correctResults),
    playedPredictions: toOptionalNumber(ranking["calculatedForecasts"] ?? entry.playedPredictions ?? entry.totalForecasts),
    avatarUrl: typeof user["avatarUrl"] === "string" ? user["avatarUrl"] : (typeof entry.avatarUrl === "string" ? entry.avatarUrl : undefined),
  };
}

function toOptionalNumber(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

// ---------------------------------------------------------------------------
// API publique du service
// ---------------------------------------------------------------------------
export async function getMppClassement(): Promise<MppPlayer[]> {
  if (useMock()) return MOCK_PLAYERS;

  const cached = cacheGet<MppPlayer[]>("classement");
  if (cached) return cached;

  const contestId = await resolveContestId();
  if (!contestId) {
    console.warn("[MPP] Aucun contest ID résolvable. Fallback mock.");
    return MOCK_PLAYERS;
  }

  const totalUsers = await getContestTotalUsers(contestId);
  const entries = await fetchRawStandings(contestId, totalUsers);
  if (entries.length === 0) {
    console.warn(`[MPP] Classement vide pour ${contestId}. Fallback mock.`);
    return MOCK_PLAYERS;
  }

  const players = entries
    .map((e, i) => normalizeEntry(e, i))
    .sort((a, b) => a.rank - b.rank || b.points - a.points);

  cacheSet("classement", players);
  return players;
}

export function filterByDepartment(players: MppPlayer[], departmentCode?: string): MppPlayer[] {
  if (!departmentCode) return players;
  return players.filter((p) => p.departmentCode === departmentCode.toUpperCase());
}

export function computeDepartmentStats(players: MppPlayer[]): DepartmentStats[] {
  const groups = new Map<DepartmentCode, MppPlayer[]>();
  for (const p of players) {
    const g = groups.get(p.departmentCode) ?? [];
    g.push(p);
    groups.set(p.departmentCode, g);
  }
  return Array.from(groups.entries())
    .map(([code, members]) => {
      const total = members.reduce((s, p) => s + p.points, 0);
      const best  = [...members].sort((a, b) => b.points - a.points)[0];
      return {
        departmentCode: code,
        departmentName: members[0]?.departmentName ?? "Inconnu",
        playerCount:   members.length,
        totalPoints:   total,
        averagePoints: Math.round(total / members.length),
        bestPlayer:    best,
      } satisfies DepartmentStats;
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * weight;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDepartmentPointDistributions(players: MppPlayer[]): DepartmentPointDistribution[] {
  const groups = new Map<DepartmentCode, MppPlayer[]>();
  for (const player of players) {
    const group = groups.get(player.departmentCode) ?? [];
    group.push(player);
    groups.set(player.departmentCode, group);
  }

  return Array.from(groups.entries())
    .map(([code, members]) => {
      const points = members.map((player) => player.points).sort((a, b) => a - b);
      const totalPoints = points.reduce((sum, value) => sum + value, 0);
      const mean = totalPoints / Math.max(points.length, 1);
      const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(points.length, 1);

      return {
        departmentCode: code,
        departmentName: members[0]?.departmentName ?? "Inconnu",
        playerCount: points.length,
        min: points[0] ?? 0,
        q1: roundMetric(percentile(points, 0.25)),
        median: roundMetric(percentile(points, 0.5)),
        q3: roundMetric(percentile(points, 0.75)),
        max: points[points.length - 1] ?? 0,
        mean: roundMetric(mean),
        standardDeviation: roundMetric(Math.sqrt(variance)),
        totalPoints,
        points,
      } satisfies DepartmentPointDistribution;
    })
    .sort((a, b) => b.median - a.median || b.mean - a.mean);
}

// ---------------------------------------------------------------------------
// Debug : info sur le contest résolu
// ---------------------------------------------------------------------------
export interface ContestInfo {
  contestId: string;
  title: string;
  totalUsers: number;
  userRanking: number;
  userTotalPoints: number;
  isLive?: boolean;
}

export async function getContestInfo(): Promise<ContestInfo | null> {
  try {
    const data   = await getUserContests();
    const all    = [...(data.contestsCards ?? []), ...(data.pinnedChallengesCards ?? [])];
    const target = await resolveContestId();
    const card   = all.find((c) => c.contestId === target);
    if (!card) return null;
    return {
      contestId:       card.contestId,
      title:           card.title,
      totalUsers:      card.totalUsers,
      userRanking:     card.userRanking,
      userTotalPoints: card.userTotalPoints,
      isLive:          card.isLive,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Debug : probe (gardé pour compatibilité, simplifié)
// ---------------------------------------------------------------------------
export interface ProbeResult {
  path: string;
  status: "ok" | "empty" | "error";
  playerCount?: number;
  hint?: string;
}

export async function probeRankingEndpoints(challengeId: string): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const limit = getStandingsPageSize();
  const path = `/challenge-standings/users-standings?challengeId=${encodeURIComponent(challengeId)}&offset=0&limit=${limit}`;
  try {
    const data = await requestMpp<unknown>(path);
    const entries = extractStandings(data);
    if (entries.length > 0) {
      results.push({ path, status: "ok", playerCount: entries.length, hint: "✅ Endpoint valide" });
    } else {
      results.push({ path, status: "empty", hint: "Réponse vide — challengeId invalide ?" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ path, status: "error", hint: msg });
  }
  return results;
}
