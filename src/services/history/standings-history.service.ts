import { createClient, type Client, type InStatement } from "@libsql/client";
import { getContestInfo, getMppClassement, useMock } from "../mpp/mpp.service.js";

let client: Client | undefined;
let schemaReady: Promise<void> | undefined;

function getClient(): Client {
  if (client) return client;
  const url = process.env["TURSO_DATABASE_URL"];
  const authToken = process.env["TURSO_AUTH_TOKEN"];
  if (!url || !authToken) throw new Error("TURSO_DATABASE_URL et TURSO_AUTH_TOKEN sont requis.");
  client = createClient({ url, authToken });
  return client;
}

export async function ensureHistorySchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getClient().batch([
      `CREATE TABLE IF NOT EXISTS standings_snapshots (
        id TEXT PRIMARY KEY,
        contest_id TEXT NOT NULL,
        contest_title TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        captured_hour TEXT NOT NULL,
        player_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(contest_id, captured_hour)
      )`,
      `CREATE TABLE IF NOT EXISTS player_standings_history (
        snapshot_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        pseudo TEXT NOT NULL,
        department_code TEXT NOT NULL,
        department_name TEXT NOT NULL,
        rank INTEGER NOT NULL,
        points INTEGER NOT NULL,
        exact_scores INTEGER,
        good_results INTEGER,
        played_predictions INTEGER,
        avatar_url TEXT,
        PRIMARY KEY(snapshot_id, player_id),
        FOREIGN KEY(snapshot_id) REFERENCES standings_snapshots(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_snapshots_contest_captured
        ON standings_snapshots(contest_id, captured_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_history_player_snapshot
        ON player_standings_history(player_id, snapshot_id)`,
    ], "write");
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export function getSnapshotIntervalMinutes(): number {
  const configured = Number(process.env["STANDINGS_SNAPSHOT_INTERVAL_MINUTES"] ?? "60");
  if (!Number.isFinite(configured)) return 60;
  return Math.min(Math.max(Math.trunc(configured), 1), 10_080);
}

function snapshotBucket(date: Date, intervalMinutes: number): string {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs).toISOString();
}

export interface CaptureResult {
  snapshotId: string;
  capturedAt: string;
  playerCount: number;
  contestTitle: string;
  intervalMinutes: number;
  skipped: boolean;
}

export async function captureStandingsSnapshot(now = new Date()): Promise<CaptureResult> {
  if (useMock() && process.env["ALLOW_MOCK_SNAPSHOTS"] !== "true") {
    throw new Error("Capture refusée : le classement utilise les données de démonstration.");
  }

  await ensureHistorySchema();
  const contest = await getContestInfo().catch(() => null);
  const contestId = contest?.contestId ?? process.env["MPP_CHALLENGE_ID"] ?? "default";
  const contestTitle = contest?.title ?? process.env["MPP_LEAGUE_TITLE"] ?? "MPP";
  const intervalMinutes = getSnapshotIntervalMinutes();
  const capturedAt = now.toISOString();
  // captured_hour est conservé pour compatibilité avec le schéma existant.
  // Sa valeur représente désormais le début du créneau configurable.
  const capturedHour = snapshotBucket(now, intervalMinutes);
  const snapshotId = `${contestId}:${capturedHour}`;
  const existing = await getClient().execute({
    sql: `SELECT captured_at, player_count, contest_title
      FROM standings_snapshots WHERE id = ? LIMIT 1`,
    args: [snapshotId],
  });
  const existingRow = existing.rows[0];
  if (existingRow) {
    return {
      snapshotId,
      capturedAt: String(existingRow["captured_at"]),
      playerCount: numberValue(existingRow["player_count"]),
      contestTitle: String(existingRow["contest_title"]),
      intervalMinutes,
      skipped: true,
    };
  }

  const players = await getMppClassement();

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO standings_snapshots
        (id, contest_id, contest_title, captured_at, captured_hour, player_count)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          contest_title = excluded.contest_title,
          captured_at = excluded.captured_at,
          player_count = excluded.player_count`,
      args: [snapshotId, contestId, contestTitle, capturedAt, capturedHour, players.length],
    },
    { sql: "DELETE FROM player_standings_history WHERE snapshot_id = ?", args: [snapshotId] },
    ...players.map((player): InStatement => ({
      sql: `INSERT INTO player_standings_history (
        snapshot_id, player_id, pseudo, department_code, department_name,
        rank, points, exact_scores, good_results, played_predictions, avatar_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshotId, player.id, player.pseudo, player.departmentCode, player.departmentName,
        player.rank, player.points, player.exactScores ?? null, player.goodResults ?? null,
        player.playedPredictions ?? null, player.avatarUrl ?? null,
      ],
    })),
  ];

  await getClient().batch(statements, "write");
  return {
    snapshotId,
    capturedAt,
    playerCount: players.length,
    contestTitle,
    intervalMinutes,
    skipped: false,
  };
}

export interface HistoryPoint {
  capturedAt: string;
  rank: number;
  departmentRank: number;
  points: number;
}

export interface PlayerHistorySeries {
  playerId: string;
  pseudo: string;
  departmentCode: string;
  departmentName: string;
  currentRank: number;
  currentDepartmentRank: number;
  currentPoints: number;
  rankChange: number;
  departmentRankChange: number;
  pointsChange: number;
  points: HistoryPoint[];
}

export interface HistoryDashboardData {
  contestTitle: string;
  intervalMinutes: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  snapshotCount: number;
  playerCount: number;
  filteredPlayerCount: number;
  departmentFilter: string | null;
  departments: Array<{
    code: string;
    name: string;
    playerCount: number;
  }>;
  series: PlayerHistorySeries[];
}

function numberValue(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export async function getHistoryDashboard(
  days = 7,
  playerIds: string[] = [],
  department?: string,
): Promise<HistoryDashboardData> {
  await ensureHistorySchema();
  const db = getClient();
  const safeDays = Math.min(Math.max(Math.trunc(days) || 7, 1), 90);
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
  const normalizedDepartment = department?.trim().toUpperCase() || null;
  const summary = await db.execute({
    sql: `SELECT COUNT(*) AS snapshot_count, MIN(captured_at) AS first_captured_at,
      MAX(captured_at) AS last_captured_at, MAX(player_count) AS player_count,
      COALESCE(MAX(contest_title), 'MPP') AS contest_title
      FROM standings_snapshots WHERE captured_at >= ?`,
    args: [since],
  });
  const snapshotCount = numberValue(summary.rows[0]?.["snapshot_count"]);
  if (snapshotCount === 0) {
    return {
      contestTitle: "MPP",
      intervalMinutes: getSnapshotIntervalMinutes(),
      firstCapturedAt: null,
      lastCapturedAt: null,
      snapshotCount: 0,
      playerCount: 0,
      filteredPlayerCount: 0,
      departmentFilter: normalizedDepartment,
      departments: [],
      series: [],
    };
  }

  const latestSnapshotId = String((await db.execute(
    "SELECT id FROM standings_snapshots ORDER BY captured_at DESC LIMIT 1"
  )).rows[0]?.["id"] ?? "");
  const departmentRows = await db.execute({
    sql: `SELECT department_code, MAX(department_name) AS department_name, COUNT(*) AS player_count
      FROM player_standings_history
      WHERE snapshot_id = ?
      GROUP BY department_code
      ORDER BY department_code`,
    args: [latestSnapshotId],
  });
  const departments = departmentRows.rows.map((row) => ({
    code: String(row["department_code"]),
    name: String(row["department_name"]),
    playerCount: numberValue(row["player_count"]),
  }));

  let selectedIds = playerIds.filter(Boolean).slice(0, 12);
  if (selectedIds.length === 0) {
    const top = await db.execute({
      sql: `SELECT h.player_id
        FROM player_standings_history h
        WHERE h.snapshot_id = ?
          AND (? IS NULL OR h.department_code = ?)
        ORDER BY h.rank ASC`,
      args: [latestSnapshotId, normalizedDepartment, normalizedDepartment],
    });
    selectedIds = top.rows.map((row) => String(row["player_id"]));
  }

  const placeholders = selectedIds.map(() => "?").join(",");
  const history = selectedIds.length === 0 ? { rows: [] } : await db.execute({
    sql: `WITH ranked_history AS (
        SELECT h.player_id, h.pseudo, h.department_code, h.department_name,
          h.rank, h.points, h.snapshot_id,
          ROW_NUMBER() OVER (
            PARTITION BY h.snapshot_id, h.department_code
            ORDER BY h.rank ASC, h.points DESC, h.player_id ASC
          ) AS department_rank
        FROM player_standings_history h
      )
      SELECT h.player_id, h.pseudo, h.department_code, h.department_name,
        h.rank, h.department_rank, h.points, s.captured_at
      FROM ranked_history h
      JOIN standings_snapshots s ON s.id = h.snapshot_id
      WHERE s.captured_at >= ? AND h.player_id IN (${placeholders})
      ORDER BY s.captured_at ASC, h.rank ASC`,
    args: [since, ...selectedIds],
  });

  const grouped = new Map<string, PlayerHistorySeries>();
  for (const row of history.rows) {
    const playerId = String(row["player_id"]);
    const point: HistoryPoint = {
      capturedAt: String(row["captured_at"]),
      rank: numberValue(row["rank"]),
      departmentRank: numberValue(row["department_rank"]),
      points: numberValue(row["points"]),
    };
    const current = grouped.get(playerId);
    if (current) {
      current.points.push(point);
      current.currentRank = point.rank;
      current.currentDepartmentRank = point.departmentRank;
      current.currentPoints = point.points;
      current.rankChange = current.points[0]!.rank - point.rank;
      current.departmentRankChange = current.points[0]!.departmentRank - point.departmentRank;
      current.pointsChange = point.points - current.points[0]!.points;
    } else {
      grouped.set(playerId, {
        playerId,
        pseudo: String(row["pseudo"]),
        departmentCode: String(row["department_code"]),
        departmentName: String(row["department_name"]),
        currentRank: point.rank,
        currentDepartmentRank: point.departmentRank,
        currentPoints: point.points,
        rankChange: 0,
        departmentRankChange: 0,
        pointsChange: 0,
        points: [point],
      });
    }
  }

  return {
    contestTitle: String(summary.rows[0]?.["contest_title"] ?? "MPP"),
    intervalMinutes: getSnapshotIntervalMinutes(),
    firstCapturedAt: String(summary.rows[0]?.["first_captured_at"] ?? "") || null,
    lastCapturedAt: String(summary.rows[0]?.["last_captured_at"] ?? "") || null,
    snapshotCount,
    playerCount: numberValue(summary.rows[0]?.["player_count"]),
    filteredPlayerCount: grouped.size,
    departmentFilter: normalizedDepartment,
    departments,
    series: [...grouped.values()].sort((a, b) => a.currentRank - b.currentRank),
  };
}
