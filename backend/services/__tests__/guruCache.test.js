import { jest } from "@jest/globals";

const cache = await import("../../services/cache.js");

describe("getOrFetchGuru: epoch guard & overflow safety", () => {
  beforeEach(() => {
    cache.clearGuruData();
  });

  test("old-epoch completion cannot repopulate cache after clearGuruData", async () => {
    let resolveSlow;
    const slow = new Promise((resolve) => { resolveSlow = resolve; });

    const inflight = cache.getOrFetchGuru("race-key", () => slow); // starts under current epoch
    cache.clearGuruData(); // bumps epoch + flushes
    resolveSlow({ stale: true });
    await inflight;

    let calls = 0;
    const fresh = await cache.getOrFetchGuru("race-key", () => {
      calls += 1;
      return Promise.resolve({ fresh: true });
    });
    expect(calls).toBe(1); // must NOT be served stale from the old write
    expect(fresh).toEqual({ fresh: true });
  });

  test("maxKeys overflow degrades to uncached instead of throwing", async () => {
    for (let i = 0; i < 505; i++) {
      await cache.getOrFetchGuru(`overflow-${i}`, () => Promise.resolve({ v: i }));
    }
    const val = await cache.getOrFetchGuru("post-overflow", () => Promise.resolve({ ok: true }));
    expect(val).toEqual({ ok: true });
  });
});
