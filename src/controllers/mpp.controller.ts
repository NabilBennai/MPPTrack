import type { Request, Response } from "express";
import path from "path";
import {
  getMppClassement,
  getMppUser,
  filterByDepartment,
  computeDepartmentStats,
  probeRankingEndpoints,
  invalidateCache,
  getContestInfo,
  useMock,
} from "../services/mpp/mpp.service.js";
import { hasToken } from "../services/mpp/mpp-api.client.js";
import {
  renderClassement,
  renderStats,
  renderPlayerExpandRow,
  renderPlayerCloseRow,
  renderError,
  renderDebugUser,
  renderDebugProbe,
} from "../views/mpp/templates.js";
import {
  captureStandingsSnapshot,
  getHistoryDashboard,
  getStandingsMovements,
  getDuelHistory,
} from "../services/history/standings-history.service.js";

function isDev(): boolean {
  return process.env["NODE_ENV"] !== "production";
}

function formatDate(): string {
  return new Date().toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------
export async function mppIndexHandler(_req: Request, res: Response): Promise<void> {
  res.sendFile(path.join(process.cwd(), "src", "views", "mpp", "index.html"));
}

export async function mppHistoryPageHandler(_req: Request, res: Response): Promise<void> {
  res.sendFile(path.join(process.cwd(), "src", "views", "mpp", "history.html"));
}

export async function mppDuelPageHandler(_req: Request, res: Response): Promise<void> {
  res.sendFile(path.join(process.cwd(), "src", "views", "mpp", "duel.html"));
}

export async function mppDuelDataHandler(req: Request, res: Response): Promise<void> {
  try {
    const playerA = typeof req.query["playerA"] === "string" ? req.query["playerA"] : "";
    const playerB = typeof req.query["playerB"] === "string" ? req.query["playerB"] : "";
    const period = typeof req.query["period"] === "string" ? req.query["period"] : "30d";
    const players = await getMppClassement();
    const playerAId = resolvePlayerId(playerA, players);
    const playerBId = resolvePlayerId(playerB, players);
    res.json(await getDuelHistory(playerAId, playerBId, period));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Duel indisponible.";
    res.status(400).json({ error: message });
  }
}

export async function mppDuelPlayersHandler(_req: Request, res: Response): Promise<void> {
  try {
    const players = (await getMppClassement())
      .filter((player) => player.departmentCode === "ES")
      .sort((a, b) => a.rank - b.rank)
      .map((player, index) => ({
        id: player.id,
        pseudo: player.pseudo,
        label: `${player.pseudo} · #${index + 1} e-SCM · #${player.rank} global`,
        globalRank: player.rank,
        departmentRank: index + 1,
      }));
    res.json({ players });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Joueurs indisponibles.";
    res.status(500).json({ error: message });
  }
}

function resolvePlayerId(value: string, players: Awaited<ReturnType<typeof getMppClassement>>): string {
  const normalizedValue = normalizePlayerSelectorValue(value);
  if (!normalizedValue) return "";

  const exactMatch = players.find((player) =>
    player.id === value || normalizePlayerSelectorValue(player.pseudo) === normalizedValue
  );
  if (!exactMatch) {
    throw new Error(`Joueur introuvable : ${value}`);
  }
  return exactMatch.id;
}

function normalizePlayerSelectorValue(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function mppHistoryDataHandler(req: Request, res: Response): Promise<void> {
  try {
    const period = typeof req.query["period"] === "string" ? req.query["period"] : undefined;
    const days = typeof req.query["days"] === "string" ? Number(req.query["days"]) : 7;
    const players = typeof req.query["players"] === "string"
      ? req.query["players"].split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    res.json(await getHistoryDashboard(period ?? days, players));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historique indisponible.";
    res.status(500).json({ error: message });
  }
}

export async function mppFormRankingHandler(req: Request, res: Response): Promise<void> {
  try {
    const period = typeof req.query["period"] === "string" ? req.query["period"] : "24h";
    const dashboard = await getHistoryDashboard(period);
    res.json({
      contestTitle: dashboard.contestTitle,
      firstCapturedAt: dashboard.firstCapturedAt,
      lastCapturedAt: dashboard.lastCapturedAt,
      snapshotCount: dashboard.snapshotCount,
      playerCount: dashboard.playerCount,
      period,
      ranking: dashboard.series
        .filter((player) => player.positions.length >= 2)
        .sort((a, b) => b.pointsChange - a.pointsChange || a.currentEscmRank - b.currentEscmRank)
        .map((player, index) => ({
          rank: index + 1,
          playerId: player.playerId,
          pseudo: player.pseudo,
          currentEscmRank: player.currentEscmRank,
          currentGlobalRank: player.currentGlobalRank,
          currentPoints: player.currentPoints,
          pointsChange: player.pointsChange,
          firstSnapshotPoints: player.positions[0]?.points ?? 0,
          lastSnapshotPoints: player.positions[player.positions.length - 1]?.points ?? 0,
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forme indisponible.";
    res.status(500).json({ error: message });
  }
}

export async function mppMovementsHandler(req: Request, res: Response): Promise<void> {
  try {
    const hours = typeof req.query["hours"] === "string" ? Number(req.query["hours"]) : 24;
    res.json(await getStandingsMovements(hours));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mouvements indisponibles.";
    res.status(500).json({ error: message });
  }
}

export async function mppSnapshotCronHandler(req: Request, res: Response): Promise<void> {
  const cronSecret = process.env["CRON_SECRET"];
  if (!cronSecret || req.get("authorization") !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    res.json({ ok: true, ...await captureStandingsSnapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture impossible.";
    console.error("[snapshot]", error);
    res.status(500).json({ ok: false, error: message });
  }
}

// ---------------------------------------------------------------------------
// Classement (fragment HTMX)
// ---------------------------------------------------------------------------
export async function mppClassementHandler(req: Request, res: Response): Promise<void> {
  try {
    const department =
      typeof req.query["department"] === "string" ? req.query["department"] : undefined;

    const allPlayers  = await getMppClassement();
    const filtered    = filterByDepartment(allPlayers, department);
    const isMock      = useMock();
    const contestInfo = isMock ? null : await getContestInfo().catch(() => null);

    res.send(renderClassement(filtered, formatDate(), isMock, contestInfo, department));
  } catch (_err) {
    res.status(500).send(renderError("Erreur lors du chargement du classement."));
  }
}

// ---------------------------------------------------------------------------
// Statistiques (fragment HTMX)
// ---------------------------------------------------------------------------
export async function mppStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const players = await getMppClassement();
    const stats   = computeDepartmentStats(players);
    res.send(renderStats(stats));
  } catch (_err) {
    res.status(500).send(renderError("Erreur lors du chargement des statistiques."));
  }
}

// ---------------------------------------------------------------------------
// Expand détail joueur — insère une sous-ligne dans le tableau
// ---------------------------------------------------------------------------
export async function mppPlayerExpandHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id }   = req.params as { id: string };
    const players  = await getMppClassement();
    const player   = players.find((p) => p.id === id);

    if (!player) {
      res.status(404).send(`<tr id="detail-${id}"></tr>`);
      return;
    }
    res.send(renderPlayerExpandRow(player));
  } catch (_err) {
    res.status(500).send(renderError("Erreur lors du chargement du joueur."));
  }
}

// ---------------------------------------------------------------------------
// Close détail joueur — supprime la sous-ligne
// ---------------------------------------------------------------------------
export async function mppPlayerCloseHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id }  = req.params as { id: string };
    const players = await getMppClassement();
    const player  = players.find((p) => p.id === id);

    if (!player) {
      res.send(`<tr id="detail-${id}"></tr>`);
      return;
    }
    res.send(renderPlayerCloseRow(player));
  } catch (_err) {
    res.send(`<tr id="detail-${req.params["id"] ?? ""}"></tr>`);
  }
}

// ---------------------------------------------------------------------------
// Vide le cache
// ---------------------------------------------------------------------------
export function mppCacheInvalidateHandler(_req: Request, res: Response): void {
  invalidateCache();
  res.send(`<span class="text-green-400">✓ Actualisé</span>`);
}

// ---------------------------------------------------------------------------
// Debug : GET /user — DEV UNIQUEMENT
// ---------------------------------------------------------------------------
export async function mppDebugUserHandler(_req: Request, res: Response): Promise<void> {
  if (!isDev()) { res.status(403).send("Interdit en production."); return; }

  if (!hasToken()) {
    res.send(renderDebugUser(null, "MPP_ACCESS_TOKEN absent — ajoutez-le dans .env"));
    return;
  }
  try {
    const user = await getMppUser();
    res.send(renderDebugUser(user, null));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(renderDebugUser(null, `Erreur API : ${msg}`));
  }
}

// ---------------------------------------------------------------------------
// Debug : probe classement — DEV UNIQUEMENT
// ---------------------------------------------------------------------------
export async function mppDebugProbeHandler(req: Request, res: Response): Promise<void> {
  if (!isDev()) { res.status(403).send("Interdit en production."); return; }

  if (!hasToken()) {
    res.status(400).send(renderError("MPP_ACCESS_TOKEN absent."));
    return;
  }

  const challengeId = typeof req.query["challengeId"] === "string"
    ? req.query["challengeId"]
    : process.env["MPP_CHALLENGE_ID"];

  if (!challengeId) {
    res.status(400).send(renderError("Paramètre challengeId manquant."));
    return;
  }

  try {
    const results = await probeRankingEndpoints(challengeId);
    res.send(renderDebugProbe(challengeId, results));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(renderError(`Erreur probe : ${msg}`));
  }
}
