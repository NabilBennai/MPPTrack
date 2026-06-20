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
  renderPlayerDetail,
  renderError,
  renderDebugUser,
  renderDebugProbe,
} from "../views/mpp/templates.js";

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
  res.sendFile(path.resolve("src/views/mpp/index.html"));
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
// Détail joueur (fragment HTMX)
// ---------------------------------------------------------------------------
export async function mppPlayerDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id }  = req.params as { id: string };
    const players = await getMppClassement();
    const player  = players.find((p) => p.id === id);

    if (!player) {
      res.status(404).send(`<p class="text-red-400 text-center py-4 text-sm">Joueur introuvable.</p>`);
      return;
    }
    res.send(renderPlayerDetail(player));
  } catch (_err) {
    res.status(500).send(renderError("Erreur lors du chargement du joueur."));
  }
}

// ---------------------------------------------------------------------------
// Vide le cache
// ---------------------------------------------------------------------------
export function mppCacheInvalidateHandler(_req: Request, res: Response): void {
  invalidateCache();
  res.send(`<p class="text-green-400 text-sm text-center py-2">✓ Cache vidé.</p>`);
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
    res.status(400).send(renderError(
      "Paramètre challengeId manquant. Exemple : /mpp/debug/probe?challengeId=mpp_challenge_UBXC3UXL"
    ));
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
