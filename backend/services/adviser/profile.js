import prisma from "../db.js";

export const MAX_PROFILE_NOTES = 1000;

const PROFILE_SELECT = {
  investorRiskTolerance: true,
  investorHorizon: true,
  investorStyle: true,
  investorNotes: true,
};

const ENUMS = {
  riskTolerance: ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"],
  horizon: ["SHORT", "MEDIUM", "LONG"],
  style: ["VALUE", "GROWTH", "BLEND", "INDEX"],
};

function requireUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("userId is required.");
  return userId;
}

function normalizeEnum(value, field) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toUpperCase();
  if (!ENUMS[field].includes(normalized)) throw new Error(`Invalid ${field}.`);
  return normalized;
}

function normalizeNotes(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid notes.");
  const normalized = value.trim();
  if (normalized.length > MAX_PROFILE_NOTES) throw new Error("Notes are too long.");
  return normalized || null;
}

function profileFromUser(user) {
  if (!user) return null;
  return {
    riskTolerance: user.investorRiskTolerance ?? null,
    horizon: user.investorHorizon ?? null,
    style: user.investorStyle ?? null,
    notes: user.investorNotes ?? null,
  };
}

function profileValue(profile, field, databaseField) {
  return profile?.[field] ?? profile?.[databaseField] ?? null;
}

export async function getInvestorProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: requireUserId(userId) },
    select: PROFILE_SELECT,
  });
  return profileFromUser(user);
}

export async function saveInvestorProfile(userId, input) {
  const id = requireUserId(userId);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid investor profile.");
  }

  const data = {};
  if (Object.hasOwn(input, "riskTolerance")) {
    data.investorRiskTolerance = normalizeEnum(input.riskTolerance, "riskTolerance");
  }
  if (Object.hasOwn(input, "horizon")) {
    data.investorHorizon = normalizeEnum(input.horizon, "horizon");
  }
  if (Object.hasOwn(input, "style")) {
    data.investorStyle = normalizeEnum(input.style, "style");
  }
  if (Object.hasOwn(input, "notes")) data.investorNotes = normalizeNotes(input.notes);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: PROFILE_SELECT,
  });
  return profileFromUser(user);
}

export function isProfileComplete(profile) {
  return [
    ["riskTolerance", "investorRiskTolerance"],
    ["horizon", "investorHorizon"],
    ["style", "investorStyle"],
  ].every(([field, databaseField]) => {
    const value = profileValue(profile, field, databaseField);
    return typeof value === "string" && ENUMS[field].includes(value.trim().toUpperCase());
  });
}

export function formatProfileBlock(profile) {
  const values = {
    riskTolerance: profileValue(profile, "riskTolerance", "investorRiskTolerance"),
    horizon: profileValue(profile, "horizon", "investorHorizon"),
    style: profileValue(profile, "style", "investorStyle"),
    notes: profileValue(profile, "notes", "investorNotes"),
  };
  if (!Object.values(values).some((value) => typeof value === "string" && value.trim())) return "";

  return [
    `Risk tolerance: ${values.riskTolerance?.trim().toUpperCase() || "UNKNOWN"}`,
    `Investment horizon: ${values.horizon?.trim().toUpperCase() || "UNKNOWN"}`,
    `Investment style: ${values.style?.trim().toUpperCase() || "UNKNOWN"}`,
    values.notes?.trim() ? `Investor notes: ${values.notes.trim()}` : "",
  ].filter(Boolean).join("\n");
}
