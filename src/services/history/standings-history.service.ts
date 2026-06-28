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
    const db = getClient();
    await db.batch([
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
      `CREATE TABLE IF NOT EXISTS es_position_history (
        snapshot_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        pseudo TEXT NOT NULL,
        global_rank INTEGER NOT NULL,
        escm_rank INTEGER NOT NULL,
        PRIMARY KEY(snapshot_id, player_id),
        FOREIGN KEY(snapshot_id) REFERENCES standings_snapshots(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_snapshots_contest_captured
        ON standings_snapshots(contest_id, captured_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_es_positions_player_snapshot
        ON es_position_history(player_id, snapshot_id)`,
    ], "write");

    // Add points column if missing (migration for existing deployments)
    const colInfo = await db.execute("PRAGMA table_info(es_position_history)");
    const hasPoints = colInfo.rows.some((r) => String(r["name"]) === "points");
    if (!hasPoints) {
      await db.execute("ALTER TABLE es_position_history ADD COLUMN points INTEGER NOT NULL DEFAULT 0");
      console.log("[history] colonne 'points' ajoutée à es_position_history");
    }

    const legacyTable = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'player_standings_history'"
    );
    if (legacyTable.rows.length > 0) {
      await db.batch([
        `INSERT OR IGNORE INTO es_position_history
          (snapshot_id, player_id, pseudo, global_rank, escm_rank)
          SELECT snapshot_id, player_id, pseudo, rank,
            ROW_NUMBER() OVER (
              PARTITION BY snapshot_id
              ORDER BY rank ASC, player_id ASC
            )
          FROM player_standings_history
          WHERE department_code = 'ES'`,
        `UPDATE standings_snapshots
          SET player_count = (
            SELECT COUNT(*) FROM es_position_history p
            WHERE p.snapshot_id = standings_snapshots.id
          )
          WHERE EXISTS (
            SELECT 1 FROM es_position_history p
            WHERE p.snapshot_id = standings_snapshots.id
          )`,
        "DROP TABLE player_standings_history",
      ], "write");
      console.log("[history] ancien historique migré vers les positions e-SCM");
    }
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
  const db = getClient();
  const contest = await getContestInfo().catch(() => null);
  const contestId = contest?.contestId ?? process.env["MPP_CHALLENGE_ID"] ?? "default";
  const contestTitle = contest?.title ?? process.env["MPP_LEAGUE_TITLE"] ?? "MPP";
  const intervalMinutes = getSnapshotIntervalMinutes();
  const capturedAt = now.toISOString();
  const capturedSlot = snapshotBucket(now, intervalMinutes);
  const snapshotId = `${contestId}:${capturedSlot}`;

  const existing = await db.execute({
    sql: `SELECT s.captured_at, s.player_count, s.contest_title
      FROM standings_snapshots s
      WHERE s.id = ?
        AND EXISTS (SELECT 1 FROM es_position_history p WHERE p.snapshot_id = s.id)
      LIMIT 1`,
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

  const esPlayers = (await getMppClassement())
    .filter((player) => player.departmentCode === "ES")
    .sort((a, b) => a.rank - b.rank);

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO standings_snapshots
        (id, contest_id, contest_title, captured_at, captured_hour, player_count)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          contest_title = excluded.contest_title,
          captured_at = excluded.captured_at,
          player_count = excluded.player_count`,
      args: [snapshotId, contestId, contestTitle, capturedAt, capturedSlot, esPlayers.length],
    },
    { sql: "DELETE FROM es_position_history WHERE snapshot_id = ?", args: [snapshotId] },
    ...esPlayers.map((player, index): InStatement => ({
      sql: `INSERT INTO es_position_history
        (snapshot_id, player_id, pseudo, global_rank, escm_rank, points)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [snapshotId, player.id, player.pseudo, player.rank, index + 1, player.points],
    })),
  ];
  await db.batch(statements, "write");

  return {
    snapshotId,
    capturedAt,
    playerCount: esPlayers.length,
    contestTitle,
    intervalMinutes,
    skipped: false,
  };
}

export interface PositionPoint {
  capturedAt: string;
  globalRank: number;
  escmRank: number;
  points: number;
}

export interface PlayerPositionSeries {
  playerId: string;
  pseudo: string;
  currentGlobalRank: number;
  currentEscmRank: number;
  currentPoints: number;
  goodResults: number;
  exactScores: number;
  playedPredictions: number;
  lastSnapshotGlobalRank: number;
  lastSnapshotEscmRank: number;
  lastSnapshotPoints: number;
  globalRankChange: number;
  escmRankChange: number;
  pointsChange: number;
  liveDataAvailable: boolean;
  positions: PositionPoint[];
}

export interface HistoryDashboardData {
  contestTitle: string;
  intervalMinutes: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  snapshotCount: number;
  playerCount: number;
  series: PlayerPositionSeries[];
  liveDataAvailable: boolean;
}

function numberValue(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export function parseHistoryPeriod(period: string | undefined, fallbackDays = 7): { label: string; milliseconds: number } {
  const fallback = `${Math.min(Math.max(Math.trunc(fallbackDays) || 7, 1), 90)}d`;
  const raw = (period ?? fallback).trim().toLowerCase();
  const match = /^(\d+)(h|d)$/.exec(raw);
  if (!match) return parseHistoryPeriod(fallback, 7);

  const amount = Number(match[1]);
  const unit = match[2];
  const maxHours = 24 * 90;
  const requestedHours = unit === "h" ? amount : amount * 24;
  const hours = Math.min(Math.max(Math.trunc(requestedHours) || fallbackDays * 24, 1), maxHours);
  return {
    label: hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`,
    milliseconds: hours * 3_600_000,
  };
}

export async function getHistoryDashboard(
  daysOrPeriod: number | string = 7,
  playerIds: string[] = []
): Promise<HistoryDashboardData> {
  await ensureHistorySchema();
  const db = getClient();
  const period = typeof daysOrPeriod === "string"
    ? parseHistoryPeriod(daysOrPeriod)
    : parseHistoryPeriod(undefined, daysOrPeriod);
  const since = new Date(Date.now() - period.milliseconds).toISOString();
  const summary = await db.execute({
    sql: `SELECT COUNT(DISTINCT s.id) AS snapshot_count,
      MIN(s.captured_at) AS first_captured_at,
      MAX(s.captured_at) AS last_captured_at,
      MAX(s.player_count) AS player_count,
      COALESCE(MAX(s.contest_title), 'MPP') AS contest_title
      FROM standings_snapshots s
      JOIN es_position_history p ON p.snapshot_id = s.id
      WHERE s.captured_at >= ?`,
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
      series: [],
      liveDataAvailable: false,
    };
  }

  let selectedIds = playerIds.filter(Boolean).slice(0, 20);
  if (selectedIds.length === 0) {
    const latest = await db.execute(`SELECT p.player_id
      FROM es_position_history p
      JOIN standings_snapshots s ON s.id = p.snapshot_id
      WHERE s.id = (
        SELECT s2.id FROM standings_snapshots s2
        JOIN es_position_history p2 ON p2.snapshot_id = s2.id
        ORDER BY s2.captured_at DESC LIMIT 1
      )
      ORDER BY p.escm_rank ASC`);
    selectedIds = latest.rows.map((row) => String(row["player_id"]));
  }

  const placeholders = selectedIds.map(() => "?").join(",");
  const history = selectedIds.length === 0 ? { rows: [] } : await db.execute({
    sql: `SELECT p.player_id, p.pseudo, p.global_rank, p.escm_rank, p.points, s.captured_at
      FROM es_position_history p
      JOIN standings_snapshots s ON s.id = p.snapshot_id
      WHERE s.captured_at >= ? AND p.player_id IN (${placeholders})
      ORDER BY s.captured_at ASC, p.escm_rank ASC`,
    args: [since, ...selectedIds],
  });

  const grouped = new Map<string, PlayerPositionSeries>();
  for (const row of history.rows) {
    const playerId = String(row["player_id"]);
    const point: PositionPoint = {
      capturedAt: String(row["captured_at"]),
      globalRank: numberValue(row["global_rank"]),
      escmRank: numberValue(row["escm_rank"]),
      points: numberValue(row["points"]),
    };
    const current = grouped.get(playerId);
    if (current) {
      current.positions.push(point);
      current.lastSnapshotGlobalRank = point.globalRank;
      current.lastSnapshotEscmRank = point.escmRank;
      current.lastSnapshotPoints = point.points;
      current.currentGlobalRank = point.globalRank;
      current.currentEscmRank = point.escmRank;
      current.currentPoints = point.points;
    } else {
      grouped.set(playerId, {
        playerId,
        pseudo: String(row["pseudo"]),
        currentGlobalRank: point.globalRank,
        currentEscmRank: point.escmRank,
        currentPoints: point.points,
        goodResults: 0,
        exactScores: 0,
        playedPredictions: 0,
        lastSnapshotGlobalRank: point.globalRank,
        lastSnapshotEscmRank: point.escmRank,
        lastSnapshotPoints: point.points,
        globalRankChange: 0,
        escmRankChange: 0,
        pointsChange: 0,
        liveDataAvailable: false,
        positions: [point],
      });
    }
  }

  // Fetch live standings to compute diff: last snapshot → current live rank/points
  const liveGlobalMap = new Map<string, number>();
  const liveEscmMap   = new Map<string, number>();
  const livePointsMap = new Map<string, number>();
  const liveGoodMap   = new Map<string, number>();
  const liveExactMap  = new Map<string, number>();
  const livePlayedMap = new Map<string, number>();
  let liveDataAvailable = false;
  try {
    const live = await getMppClassement();
    const esLive = live.filter((p) => p.departmentCode === "ES").sort((a, b) => a.rank - b.rank);
    esLive.forEach((p, i) => {
      liveGlobalMap.set(p.id, p.rank);
      liveEscmMap.set(p.id, i + 1);
      livePointsMap.set(p.id, p.points);
      liveGoodMap.set(p.id, p.goodResults ?? 0);
      liveExactMap.set(p.id, p.exactScores ?? 0);
      livePlayedMap.set(p.id, p.playedPredictions ?? 0);
    });
    liveDataAvailable = esLive.length > 0;
  } catch {
    // silently fall back to snapshot-based diffs
  }

  const series = [...grouped.values()];
  for (const s of series) {
    const last = s.positions[s.positions.length - 1]!;
    if (liveDataAvailable) {
      const liveG = liveGlobalMap.get(s.playerId);
      const liveE = liveEscmMap.get(s.playerId);
      const liveP = livePointsMap.get(s.playerId);
      if (liveG !== undefined && liveE !== undefined) {
        // positive rank change = improved (lower rank number is better)
        s.globalRankChange = last.globalRank - liveG;
        s.escmRankChange   = last.escmRank   - liveE;
        s.currentGlobalRank = liveG;
        s.currentEscmRank   = liveE;
        s.liveDataAvailable = true;
      }
      if (liveP !== undefined) {
        s.currentPoints  = liveP;
      }
      s.goodResults        = liveGoodMap.get(s.playerId)   ?? 0;
      s.exactScores        = liveExactMap.get(s.playerId)  ?? 0;
      s.playedPredictions  = livePlayedMap.get(s.playerId) ?? 0;
    } else {
      // fall back: diff over the selected period (first snapshot → last snapshot)
      const first = s.positions[0]!;
      s.globalRankChange = first.globalRank - last.globalRank;
      s.escmRankChange   = first.escmRank   - last.escmRank;
    }
    const first = s.positions[0]!;
    s.pointsChange = last.points - first.points;
  }

  return {
    contestTitle: String(summary.rows[0]?.["contest_title"] ?? "MPP"),
    intervalMinutes: getSnapshotIntervalMinutes(),
    firstCapturedAt: String(summary.rows[0]?.["first_captured_at"] ?? "") || null,
    lastCapturedAt: String(summary.rows[0]?.["last_captured_at"] ?? "") || null,
    snapshotCount,
    playerCount: numberValue(summary.rows[0]?.["player_count"]),
    series: series.sort((a, b) => a.currentEscmRank - b.currentEscmRank),
    liveDataAvailable,
  };
}

export interface PlayerMovement {
  playerId: string;
  pseudo: string;
  previousGlobalRank: number | null;
  currentGlobalRank: number | null;
  previousDepartmentRank: number | null;
  currentDepartmentRank: number | null;
  previousPoints: number | null;
  currentPoints: number | null;
  rankDelta: number;
  pointsDelta: number;
}

export interface MovementsData {
  contestTitle: string;
  previousCapturedAt: string | null;
  currentCapturedAt: string | null;
  windowHours: number;
  playerCount: number;
  movements: PlayerMovement[];
}

interface MovementSnapshotRef {
  id: string;
  capturedAt: string;
  contestTitle: string;
}

export async function getStandingsMovements(windowHours = 24): Promise<MovementsData> {
  await ensureHistorySchema();
  const db = getClient();
  const safeWindowHours = Math.min(Math.max(Math.trunc(windowHours) || 24, 1), 24 * 30);

  const latestResult = await db.execute(`SELECT id, captured_at, contest_title
    FROM standings_snapshots
    WHERE EXISTS (SELECT 1 FROM es_position_history p WHERE p.snapshot_id = standings_snapshots.id)
    ORDER BY captured_at DESC
    LIMIT 1`);
  const latestRow = latestResult.rows[0];
  if (!latestRow) {
    return {
      contestTitle: "MPP",
      previousCapturedAt: null,
      currentCapturedAt: null,
      windowHours: safeWindowHours,
      playerCount: 0,
      movements: [],
    };
  }

  const current: MovementSnapshotRef = {
    id: String(latestRow["id"]),
    capturedAt: String(latestRow["captured_at"]),
    contestTitle: String(latestRow["contest_title"] ?? "MPP"),
  };
  const targetPreviousAt = new Date(new Date(current.capturedAt).getTime() - safeWindowHours * 3_600_000).toISOString();

  const previousResult = await db.execute({
    sql: `SELECT id, captured_at, contest_title
      FROM standings_snapshots
      WHERE captured_at <= ?
        AND id <> ?
        AND EXISTS (SELECT 1 FROM es_position_history p WHERE p.snapshot_id = standings_snapshots.id)
      ORDER BY captured_at DESC
      LIMIT 1`,
    args: [targetPreviousAt, current.id],
  });
  let previousRow = previousResult.rows[0];
  if (!previousRow) {
    const fallback = await db.execute({
      sql: `SELECT id, captured_at, contest_title
        FROM standings_snapshots
        WHERE captured_at < ?
          AND id <> ?
          AND EXISTS (SELECT 1 FROM es_position_history p WHERE p.snapshot_id = standings_snapshots.id)
        ORDER BY captured_at DESC
        LIMIT 1`,
      args: [current.capturedAt, current.id],
    });
    previousRow = fallback.rows[0];
  }

  if (!previousRow) {
    return {
      contestTitle: current.contestTitle,
      previousCapturedAt: null,
      currentCapturedAt: current.capturedAt,
      windowHours: safeWindowHours,
      playerCount: 0,
      movements: [],
    };
  }

  const previous: MovementSnapshotRef = {
    id: String(previousRow["id"]),
    capturedAt: String(previousRow["captured_at"]),
    contestTitle: String(previousRow["contest_title"] ?? current.contestTitle),
  };

  const positions = await db.execute({
    sql: `SELECT snapshot_id, player_id, pseudo, global_rank, escm_rank, points
      FROM es_position_history
      WHERE snapshot_id IN (?, ?)`,
    args: [previous.id, current.id],
  });

  const movementByPlayer = new Map<string, PlayerMovement>();
  for (const row of positions.rows) {
    const playerId = String(row["player_id"]);
    const entry = movementByPlayer.get(playerId) ?? {
      playerId,
      pseudo: String(row["pseudo"]),
      previousGlobalRank: null,
      currentGlobalRank: null,
      previousDepartmentRank: null,
      currentDepartmentRank: null,
      previousPoints: null,
      currentPoints: null,
      rankDelta: 0,
      pointsDelta: 0,
    };
    entry.pseudo = String(row["pseudo"]);
    if (String(row["snapshot_id"]) === previous.id) {
      entry.previousGlobalRank = numberValue(row["global_rank"]);
      entry.previousDepartmentRank = numberValue(row["escm_rank"]);
      entry.previousPoints = numberValue(row["points"]);
    } else {
      entry.currentGlobalRank = numberValue(row["global_rank"]);
      entry.currentDepartmentRank = numberValue(row["escm_rank"]);
      entry.currentPoints = numberValue(row["points"]);
    }
    movementByPlayer.set(playerId, entry);
  }

  const movements = [...movementByPlayer.values()].map((entry) => ({
    ...entry,
    rankDelta: entry.previousDepartmentRank !== null && entry.currentDepartmentRank !== null
      ? entry.previousDepartmentRank - entry.currentDepartmentRank
      : 0,
    pointsDelta: entry.previousPoints !== null && entry.currentPoints !== null
      ? entry.currentPoints - entry.previousPoints
      : 0,
  }));

  return {
    contestTitle: current.contestTitle || previous.contestTitle,
    previousCapturedAt: previous.capturedAt,
    currentCapturedAt: current.capturedAt,
    windowHours: safeWindowHours,
    playerCount: movements.length,
    movements: movements.sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr")),
  };
}
