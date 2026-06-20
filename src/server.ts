import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import mppRouter from "./routes/mpp.routes.js";
import {
  captureStandingsSnapshot,
  getSnapshotIntervalMinutes,
} from "./services/history/standings-history.service.js";

const app = express();

// process.cwd() = racine du projet, fiable en local et sur Vercel
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/", mppRouter);

app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).send(`
    <div class="p-8 text-center text-red-400">
      <p class="font-semibold">Une erreur inattendue s'est produite.</p>
    </div>
  `);
});

// En local uniquement — Vercel gère lui-même le cycle requête/réponse
if (!process.env["VERCEL"]) {
  const PORT = process.env["PORT"] ?? 3000;
  app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
    startLocalSnapshotScheduler();
  });
}

export default app;

function startLocalSnapshotScheduler(): void {
  if (process.env["LOCAL_SNAPSHOT_SCHEDULER_ENABLED"] === "false") {
    console.log("[snapshot:local] désactivé via LOCAL_SNAPSHOT_SCHEDULER_ENABLED=false");
    return;
  }
  if (!process.env["TURSO_DATABASE_URL"] || !process.env["TURSO_AUTH_TOKEN"]) {
    console.log("[snapshot:local] désactivé : configuration Turso absente");
    return;
  }

  const intervalMinutes = getSnapshotIntervalMinutes();
  const intervalMs = intervalMinutes * 60_000;
  let running = false;

  const runCapture = async (): Promise<void> => {
    if (running) {
      console.log("[snapshot:local] exécution ignorée : capture précédente encore active");
      return;
    }
    running = true;
    try {
      const result = await captureStandingsSnapshot();
      console.log("[snapshot:local]", {
        status: result.skipped ? "skipped" : "captured",
        capturedAt: result.capturedAt,
        playerCount: result.playerCount,
        intervalMinutes: result.intervalMinutes,
      });
    } catch (error) {
      console.error("[snapshot:local] échec", error);
    } finally {
      running = false;
    }
  };

  console.log(`[snapshot:local] actif toutes les ${intervalMinutes} minute(s)`);
  void runCapture();
  const timer = setInterval(() => void runCapture(), intervalMs);
  timer.unref();
}
