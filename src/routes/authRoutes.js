import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  checkEmail,
  checkProviderCode,
  register,
  login,
  logout,
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router = Router();

router.get("/check-email", asyncHandler(checkEmail));
router.get("/check-provider-code", asyncHandler(checkProviderCode));

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/logout", logout);

router.post("/resend-verification", asyncHandler(resendVerification));
router.post("/verify-email/:token", asyncHandler(verifyEmail));

router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password/:token", asyncHandler(resetPassword));

export default router;
