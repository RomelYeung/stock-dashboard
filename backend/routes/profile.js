import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { getInvestorProfile, saveInvestorProfile, MAX_PROFILE_NOTES } from "../services/adviser/profile.js";

const router = Router();

const investorProfileSchema = z.object({
  riskTolerance: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]),
  horizon: z.enum(["SHORT", "MEDIUM", "LONG"]),
  style: z.enum(["VALUE", "GROWTH", "BLEND", "INDEX"]),
  notes: z.string().trim().max(MAX_PROFILE_NOTES).optional(),
}).strict();

router.use(requireAuth);

router.get("/investor", async (req, res) => {
  try {
    const profile = await getInvestorProfile(req.user.id);
    return res.json({ success: true, profile });
  } catch (err) {
    console.error("GET /api/profile/investor error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

router.put("/investor", validate(investorProfileSchema), async (req, res) => {
  try {
    const profile = await saveInvestorProfile(req.user.id, req.body);
    return res.json({ success: true, profile });
  } catch (err) {
    console.error("PUT /api/profile/investor error:", err);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

export default router;
