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
} from "../controllers/mpp.controller.js";

const router = Router();

router.get("/",                    mppIndexHandler);
router.get("/classement",          mppClassementHandler);
router.get("/stats",               mppStatsHandler);
router.get("/player/:id/close",    mppPlayerCloseHandler);
router.get("/player/:id",          mppPlayerExpandHandler);
router.post("/cache/clear",        mppCacheInvalidateHandler);
router.get("/debug/user",          mppDebugUserHandler);
router.get("/debug/probe",         mppDebugProbeHandler);

export default router;
