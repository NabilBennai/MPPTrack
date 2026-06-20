import type {
  MppPlayer,
  MppRawPlayer,
  MppRawUser,
  DepartmentStats,
  DepartmentCode,
} from "../../types/mpp.types.js";
import { getDepartmentFromPseudo } from "../../utils/departments.js";
import { requestMpp, probeMpp, hasToken, MppApiError } from "./mpp-api.client.js";

// ---------------------------------------------------------------------------
// Cache mémoire simple (TTL configurable via MPP_CACHE_TTL, défaut 5 min)
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T): void {
  const ttlSec = parseInt(process.env["MPP_CACHE_TTL"] ?? "300", 10);
  cache.set(key, { data, expiresAt: Date.now() + ttlSec * 1000 });
}

export function invalidateCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Mock — utilisé quand MPP_ACCESS_TOKEN est absent ou MPP_USE_MOCK=true
// ---------------------------------------------------------------------------
const MOCK_PLAYERS: MppRawPlayer[] = [
  { id: "1",  pseudo: "MT_Nabil",    rank: 1,  points: 1250, exactScores: 12, goodResults: 35, playedPredictions: 50 },
  { id: "2",  pseudo: "MT_Alice",    rank: 2,  points: 1100, exactScores: 10, goodResults: 30, playedPredictions: 48 },
  { id: "3",  pseudo: "MT_Karim",    rank: 4,  points: 920,  exactScores: 9,  goodResults: 27, playedPredictions: 46 },
  { id: "4",  pseudo: "ES-Julie",    rank: 3,  points: 980,  exactScores: 8,  goodResults: 28, playedPredictions: 45 },
  { id: "5",  pseudo: "ES-Marc",     rank: 6,  points: 870,  exactScores: 7,  goodResults: 25, playedPredictions: 42 },
  { id: "6",  pseudo: "ES-Camille",  rank: 8,  points: 710,  exactScores: 5,  goodResults: 20, playedPredictions: 39 },
  { id: "7",  pseudo: "TD Mehdi",    rank: 5,  points: 890,  exactScores: 6,  goodResults: 22, playedPredictions: 40 },
  { id: "8",  pseudo: "TD_Sara",     rank: 7,  points: 760,  exactScores: 5,  goodResults: 18, playedPredictions: 38 },
  { id: "9",  pseudo: "TD Léa",      rank: 9,  points: 640,  exactScores: 4,  goodResults: 16, playedPredictions: 35 },
  { id: "10", pseudo: "RandomPlayer", rank: 10, points: 500, exactScores: 3,  goodResults: 15, playedPredictions: 30 },
];

function useMock(): boolean {
  return !hasToken() || process.env["MPP_USE_MOCK"] === "true";
}

// ---------------------------------------------------------------------------
// Récupération de l'utilisateur connecté
// ---------------------------------------------------------------------------
export async function getMppUser(): Promise<MppRawUser> {
  const cached = cacheGet<MppRawUser>("user");
  if (cached) return cached;

  const user = await requestMpp<MppRawUser>("/user");
  cacheSet("user", user);
  return user;
}

// ---------------------------------------------------------------------------
// Extraction des joueurs bruts depuis la réponse API
// MPP peut envelopper le tableau dans différentes clés — on cherche en profondeur.
// ---------------------------------------------------------------------------
function extractPlayersArray(raw: unknown): MppRawPlayer[] {
  if (Array.isArray(raw)) return raw as MppRawPlayer[];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Cherche la première valeur qui est un tableau non vide
    for (const key of ["ranking", "rankings", "leaderboard", "players", "members", "users", "data", "results"]) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
        return obj[key] as MppRawPlayer[];
      }
    }
    // Fallback : premier tableau trouvé dans les valeurs
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) {
        return value as MppRawPlayer[];
      }
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Appel réseau : récupère le classement brut depuis l'API MPP
// L'endpoint exact est construit depuis les variables d'environnement.
// ---------------------------------------------------------------------------
async function fetchMppRawClassement(): Promise<MppRawPlayer[]> {
  if (useMock()) return MOCK_PLAYERS;

  // Endpoint configuré manuellement (après découverte via /mpp/debug)
  const rankingPath = process.env["MPP_RANKING_PATH"];
  if (rankingPath) {
    const data = await requestMpp<unknown>(rankingPath);
    return extractPlayersArray(data);
  }

  // Découverte automatique depuis /user + patterns connus
  const user = await getMppUser();
  const leagueId = process.env["MPP_LEAGUE_ID"] ?? extractLeagueId(user);

  if (!leagueId) {
    console.warn("[MPP] Aucun league ID trouvé. Visitez /mpp/debug/user puis configurez MPP_LEAGUE_ID dans .env");
    return MOCK_PLAYERS;
  }

  const candidates = [
    `/private-leagues/${leagueId}/ranking`,
    `/private-leagues/${leagueId}/rankings`,
    `/groups/${leagueId}/ranking`,
    `/groups/${leagueId}/rankings`,
    `/user-groups/${leagueId}/ranking`,
    `/competitions/current/private-leagues/${leagueId}/ranking`,
  ];

  for (const path of candidates) {
    const data = await probeMpp<unknown>(path);
    if (data !== null) {
      const players = extractPlayersArray(data);
      if (players.length > 0) {
        console.log(`[MPP] Endpoint classement trouvé : ${path}`);
        return players;
      }
    }
  }

  console.warn("[MPP] Aucun endpoint de classement valide. Visitez /mpp/debug/probe pour diagnostiquer.");
  return MOCK_PLAYERS;
}

// Tente d'extraire un league/group ID depuis le profil utilisateur
function extractLeagueId(user: MppRawUser): string | undefined {
  for (const key of ["privateLeagues", "groups", "leagues", "userGroups"]) {
    const list = user[key];
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0] as Record<string, unknown>;
      const id = first["id"] ?? first["_id"] ?? first["leagueId"] ?? first["groupId"];
      if (typeof id === "string" || typeof id === "number") return String(id);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Normalisation brut → modèle interne
// ---------------------------------------------------------------------------
function normalizePlayer(raw: MppRawPlayer, index: number): MppPlayer {
  const pseudo = String(raw.pseudo ?? raw.username ?? `Joueur${index + 1}`);
  const { code, name } = getDepartmentFromPseudo(pseudo);
  return {
    id:                String(raw.id ?? index + 1),
    pseudo,
    rank:              Number(raw.rank ?? index + 1),
    points:            Number(raw.points ?? 0),
    departmentCode:    code,
    departmentName:    name,
    exactScores:       raw.exactScores !== undefined ? Number(raw.exactScores) : undefined,
    goodResults:       raw.goodResults !== undefined ? Number(raw.goodResults) : undefined,
    playedPredictions: raw.playedPredictions !== undefined ? Number(raw.playedPredictions) : undefined,
  };
}

// ---------------------------------------------------------------------------
// API publique du service
// ---------------------------------------------------------------------------
export async function getMppClassement(): Promise<MppPlayer[]> {
  const cached = cacheGet<MppPlayer[]>("classement");
  if (cached) return cached;

  const raw = await fetchMppRawClassement();
  const players = raw
    .map((p, i) => normalizePlayer(p, i))
    .sort((a, b) => a.rank - b.rank || b.points - a.points);

  cacheSet("classement", players);
  return players;
}

export function filterByDepartment(players: MppPlayer[], departmentCode?: string): MppPlayer[] {
  if (!departmentCode) return players;
  const code = departmentCode.toUpperCase();
  return players.filter((p) => p.departmentCode === code);
}

export function computeDepartmentStats(players: MppPlayer[]): DepartmentStats[] {
  const groups = new Map<DepartmentCode, MppPlayer[]>();

  for (const player of players) {
    const existing = groups.get(player.departmentCode);
    if (existing) { existing.push(player); }
    else { groups.set(player.departmentCode, [player]); }
  }

  return Array.from(groups.entries())
    .map(([code, members]) => {
      const totalPoints    = members.reduce((sum, p) => sum + p.points, 0);
      const bestPlayer     = [...members].sort((a, b) => b.points - a.points)[0];
      const departmentName = members[0]?.departmentName ?? "Inconnu";
      return {
        departmentCode: code,
        departmentName,
        playerCount:    members.length,
        totalPoints,
        averagePoints:  Math.round(totalPoints / members.length),
        bestPlayer,
      } satisfies DepartmentStats;
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

// ---------------------------------------------------------------------------
// Debug : tente plusieurs endpoints et retourne un rapport
// ---------------------------------------------------------------------------
export interface ProbeResult {
  path: string;
  status: "ok" | "empty" | "error";
  playerCount?: number;
  hint?: string;
}

export async function probeRankingEndpoints(leagueId: string): Promise<ProbeResult[]> {
  const candidates = [
    `/private-leagues/${leagueId}/ranking`,
    `/private-leagues/${leagueId}/rankings`,
    `/groups/${leagueId}/ranking`,
    `/groups/${leagueId}/rankings`,
    `/user-groups/${leagueId}/ranking`,
    `/competitions/current/private-leagues/${leagueId}/ranking`,
  ];

  const results: ProbeResult[] = [];

  for (const path of candidates) {
    try {
      const data = await requestMpp<unknown>(path);
      const players = extractPlayersArray(data);
      if (players.length > 0) {
        results.push({ path, status: "ok", playerCount: players.length, hint: "✅ Endpoint valide" });
      } else {
        results.push({ path, status: "empty", hint: "Réponse vide — mauvais league ID ?" });
      }
    } catch (err) {
      const detail = err instanceof MppApiError ? `HTTP ${err.status}` : "Erreur réseau";
      results.push({ path, status: "error", hint: detail });
    }
  }

  return results;
}
