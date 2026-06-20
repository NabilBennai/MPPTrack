import { Router } from "express";
import {
  mppIndexHandler,
  mppClassementHandler,
  mppStatsHandler,
  mppPlayerDetailHandler,
  mppCacheInvalidateHandler,
  mppDebugUserHandler,
  mppDebugProbeHandler,
} from "../controllers/mpp.controller.js";

const router = Router();

// ---------------------------------------------------------------------------
// Routes principales
// ---------------------------------------------------------------------------
router.get("/",            mppIndexHandler);
router.get("/classement",  mppClassementHandler);
router.get("/stats",       mppStatsHandler);
router.get("/player/:id",  mppPlayerDetailHandler);
router.post("/cache/clear", mppCacheInvalidateHandler);

// ---------------------------------------------------------------------------
// Routes debug (développement uniquement — bloquées en production par le contrôleur)
// ---------------------------------------------------------------------------
router.get("/debug/user",  mppDebugUserHandler);
router.get("/debug/probe", mppDebugProbeHandler);

export default router;
