import { jest } from "@jest/globals";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
jest.unstable_mockModule("../../db.js", () => ({ default: mockPrisma }));

const {
  formatProfileBlock,
  getInvestorProfile,
  isProfileComplete,
  saveInvestorProfile,
} = await import("../profile.js");

describe("investor profile service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("loads only profile fields for the supplied user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      investorRiskTolerance: "BALANCED",
      investorHorizon: "LONG",
      investorStyle: "VALUE",
      investorNotes: "Prefer staged entries.",
    });

    await expect(getInvestorProfile("user-1")).resolves.toEqual({
      riskTolerance: "BALANCED",
      horizon: "LONG",
      style: "VALUE",
      notes: "Prefer staged entries.",
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        investorRiskTolerance: true,
        investorHorizon: true,
        investorStyle: true,
        investorNotes: true,
      },
    });
  });

  test("normalizes saved values and scopes the update to userId", async () => {
    mockPrisma.user.update.mockResolvedValue({
      investorRiskTolerance: "AGGRESSIVE",
      investorHorizon: "SHORT",
      investorStyle: "INDEX",
      investorNotes: "Keep it simple.",
    });

    await expect(saveInvestorProfile("user-2", {
      riskTolerance: " aggressive ",
      horizon: "short",
      style: "index",
      notes: " Keep it simple. ",
      userId: "other-user",
    })).resolves.toEqual({
      riskTolerance: "AGGRESSIVE",
      horizon: "SHORT",
      style: "INDEX",
      notes: "Keep it simple.",
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: {
        investorRiskTolerance: "AGGRESSIVE",
        investorHorizon: "SHORT",
        investorStyle: "INDEX",
        investorNotes: "Keep it simple.",
      },
      select: {
        investorRiskTolerance: true,
        investorHorizon: true,
        investorStyle: true,
        investorNotes: true,
      },
    });
  });

  test("reports completeness and formats an empty profile as no prompt block", () => {
    expect(isProfileComplete({ riskTolerance: "balanced", horizon: "LONG", style: "VALUE" })).toBe(true);
    expect(isProfileComplete({ riskTolerance: "BALANCED", horizon: null, style: "VALUE" })).toBe(false);
    expect(formatProfileBlock({ riskTolerance: null, horizon: null, style: null, notes: null })).toBe("");
    expect(formatProfileBlock({ riskTolerance: "BALANCED", horizon: "LONG", style: "VALUE", notes: "Staged entries." }))
      .toBe("Risk tolerance: BALANCED\nInvestment horizon: LONG\nInvestment style: VALUE\nInvestor notes: Staged entries.");
  });
});
