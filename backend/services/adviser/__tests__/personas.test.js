// backend/services/adviser/__tests__/personas.test.js
import { PANEL, getPersonaByName, personaSystemPrompt, personaRebuttalPrompt,
         alexSynthesisPrompt, fastLaneSystemPrompt, PROFILE_CAPTURE_INSTRUCTION } from "../personas.js";

describe("personas", () => {
  test("panel has exactly the four named experts", () => {
    expect(PANEL.map(p => p.name)).toEqual(["Alex Meridian", "Viktor Hale", "Mina Okafor", "Sam Reyes"]);
    expect(PANEL.map(p => p.colorToken)).toEqual(["--accent-blue", "--accent-amber", "--accent-green", "--accent-red"]);
  });

  test("every persona has non-empty philosophy, voice guide and ≥3-item checklist", () => {
    for (const p of PANEL) {
      expect(p.philosophy.length).toBeGreaterThan(20);
      expect(p.voiceGuide.length).toBeGreaterThan(20);
      expect(Array.isArray(p.checklist)).toBe(true);
      expect(p.checklist.length).toBeGreaterThanOrEqual(3);
      if (p.id !== "alex") { // the coordinator deliberately has no signature line
        expect(p.verbalSignature.length).toBeGreaterThan(3);
      }
    }
  });

  test("getPersonaByName is case-insensitive and null-safe", () => {
    expect(getPersonaByName("viktor hale").id).toBe("viktor");
    expect(getPersonaByName("Nobody")).toBeNull();
  });

  test("memo prompt embeds identity, checklist and strict JSON contract", () => {
    const v = getPersonaByName("Viktor Hale");
    const s = personaSystemPrompt(v, { ticker: "AAPL" });
    expect(s).toContain("Viktor Hale");
    expect(s).toContain("AAPL");
    expect(s).toContain('"stance"');
    expect(s).toContain('"conviction"');
    expect(s.toLowerCase()).toContain("margin of safety"); // philosophy present
  });

  test("rebuttal prompt demands a specific rebuttal AND a concession", () => {
    const s = personaRebuttalPrompt(getPersonaByName("Sam Reyes"), { peersBlock: "MEMOS-HERE" });
    expect(s).toContain("MEMOS-HERE");
    expect(/rebut/i.test(s)).toBe(true);
    expect(/concede/i.test(s)).toBe(true);
  });

  test("synthesis prompt fixes Alex's output sections and suggestion trailer", () => {
    const s = alexSynthesisPrompt({ briefText: "BRIEF", profileBlock: "", memosBlock: "M", rebuttalsBlock: "R" });
    expect(s).toContain("BRIEF"); expect(s).toContain("M"); expect(s).toContain("R");
    expect(s.toLowerCase()).toContain("what would change my mind");
    expect(s.toLowerCase()).toContain("execution plan");
    expect(s).toContain("[Suggestions]:");
  });

  test("fast lane prompt has no canned example suggestions", () => {
    const s = fastLaneSystemPrompt({ profileBlock: "" });
    expect(s).toContain("[Suggestions]:");
    expect(s).not.toContain("What are the downside risks?");
    expect(s).toMatch(/vary/i); // turn-order variation instruction present
  });
});
