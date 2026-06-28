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
  mppHistoryDataHandler,
  mppMovementsHandler,
  mppSnapshotCronHandler,
} from "../controllers/mpp.controller.js";

const router = Router();

router.get("/",                    mppIndexHandler);
router.get("/history",             mppHistoryPageHandler);
router.get("/api/history",         mppHistoryDataHandler);
router.get("/api/movements",       mppMovementsHandler);
router.get("/api/cron/snapshot",   mppSnapshotCronHandler);
router.get("/classement",          mppClassementHandler);
router.get("/stats",               mppStatsHandler);
router.get("/player/:id/close",    mppPlayerCloseHandler);
router.get("/player/:id",          mppPlayerExpandHandler);
router.post("/cache/clear",        mppCacheInvalidateHandler);
router.get("/debug/user",          mppDebugUserHandler);
router.get("/debug/probe",         mppDebugProbeHandler);

export default router;
