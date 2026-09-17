import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireSelf } from "../middleware/auth.js";
import { getMe, updateProfile } from "../controllers/userController.js";

const router = Router();

router.get("/me", requireAuth, asyncHandler(getMe));
router.put("/:userId/profile", requireAuth, requireSelf, asyncHandler(updateProfile));

export default router;
