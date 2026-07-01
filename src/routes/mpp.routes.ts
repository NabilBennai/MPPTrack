import { Router } from "express";
import {
  mppIndexHandler,
  mppClassementHandler,
  mppStatsHandler,
  mppPlayerExpandHandler,
  mppPlayerCloseHandler,
  mppCacheInvalidateHandler,
  mppDebugUserHandler,
  mppDebugProbeHandler,
  mppHistoryPageHandler,
  mppTimelinePageHandler,
  mppHistoryDataHandler,
  mppEventsHandler,
  mppFormRankingHandler,
  mppMovementsHandler,
  mppRivalryReportHandler,
  mppSnapshotCronHandler,
  mppDuelPageHandler,
  mppMovementsPageHandler,
  mppRivalriesPageHandler,
  mppFormPageHandler,
  mppDistributionsPageHandler,
  mppDepartmentDistributionsHandler,
  mppDuelDataHandler,
  mppDuelPlayersHandler,
  mppGigaExportDataHandler,
  mppPlayerExportCardHandler,
  mppNarrative24hHandler,
} from "../controllers/mpp.controller.js";

const router = Router();

router.get("/",                    mppIndexHandler);
router.get("/history",             mppHistoryPageHandler);
router.get("/timeline",            mppTimelinePageHandler);
router.get("/duel",                mppDuelPageHandler);
router.get("/movements",           mppMovementsPageHandler);
router.get("/rivalries",           mppRivalriesPageHandler);
router.get("/form",                mppFormPageHandler);
router.get("/distributions",       mppDistributionsPageHandler);
router.get("/api/history",         mppHistoryDataHandler);
router.get("/api/events",          mppEventsHandler);
router.get("/api/duel",            mppDuelDataHandler);
router.get("/api/duel/players",    mppDuelPlayersHandler);
router.get("/api/movements",       mppMovementsHandler);
router.get("/api/rivalry-report",  mppRivalryReportHandler);
router.get("/api/form-ranking",    mppFormRankingHandler);
router.get("/api/distributions",   mppDepartmentDistributionsHandler);
router.get("/api/giga-export",      mppGigaExportDataHandler);
router.get("/narrative24h",          mppNarrative24hHandler);
router.get("/api/player/:id/export-card", mppPlayerExportCardHandler);
router.get("/api/cron/snapshot",   mppSnapshotCronHandler);
router.get("/classement",          mppClassementHandler);
router.get("/stats",               mppStatsHandler);
router.get("/player/:id/close",    mppPlayerCloseHandler);
router.get("/player/:id",          mppPlayerExpandHandler);
router.post("/cache/clear",        mppCacheInvalidateHandler);
router.get("/debug/user",          mppDebugUserHandler);
router.get("/debug/probe",         mppDebugProbeHandler);

export default router;
