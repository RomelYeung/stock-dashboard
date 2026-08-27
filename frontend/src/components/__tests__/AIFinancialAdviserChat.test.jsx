import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDeepResearchPollError } from "../AIFinancialAdviserChat";

const adviserChatSource = readFileSync(new URL("../AIFinancialAdviserChat.jsx", import.meta.url), "utf8");

describe("getDeepResearchPollError", () => {
  it("turns authenticated polling failures into retryable terminal errors", () => {
    expect(getDeepResearchPollError({ ok: false, status: 404 }, { error: "Research not found" }))
      .toBe("Research not found");
    expect(getDeepResearchPollError({ ok: false, status: 500 }, {}))
      .toBe("Server returned 500");
    expect(getDeepResearchPollError({ ok: false, status: 401 }, null))
      .toBe("Server returned 401");
    expect(getDeepResearchPollError({ ok: true, status: 200 }, {})).toBe("");
  });

  it("serializes status polls behind the previous response", () => {
    expect(adviserChatSource).not.toContain("setInterval(async");
    expect(adviserChatSource.match(/setTimeout\(pollDeepResearch, 10000\)/g)).toHaveLength(2);
  });
});
