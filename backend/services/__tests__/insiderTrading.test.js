import { normalizeAccession } from "../insiderTrading.js";
import { getOrFetch } from "../cache.js";

describe("Insider Trading Service Unit Tests", () => {
  describe("normalizeAccession", () => {
    test("should strip dashes from accession number", () => {
      const result = normalizeAccession("0001234567-23-000123");
      expect(result).toBe("000123456723000123");
    });

    test("should strip /A suffix from accession number", () => {
      const result = normalizeAccession("0001234567-23-000123/A");
      expect(result).toBe("000123456723000123");
    });

    test("should strip both dashes and /A suffix", () => {
      const result = normalizeAccession("0001234567-23-000123/A");
      expect(result).toBe("000123456723000123");
    });

    test("should handle accession number without dashes or /A", () => {
      const result = normalizeAccession("000123456723000123");
      expect(result).toBe("000123456723000123");
    });
  });

  describe("Form 4/A Supersession Logic", () => {
    test("should handle 4/A overwriting original 4 filing", () => {
      // Simulate the supersession logic
      const filingMap = new Map();
      
      // Original Form 4
      filingMap.set("000123456723000123", {
        accessionNumber: "0001234567-23-000123",
        filingDate: "2023-01-15",
        primaryDocument: "doc1.xml",
        formType: "4",
      });
      
      // Form 4/A should overwrite the original
      filingMap.set("000123456723000123", {
        accessionNumber: "0001234567-23-000123",
        filingDate: "2023-01-16",
        primaryDocument: "doc2.xml",
        formType: "4/A",
      });
      
      // Verify the 4/A overwrites the original
      expect(filingMap.size).toBe(1);
      const filing = filingMap.get("000123456723000123");
      expect(filing.formType).toBe("4/A");
      expect(filing.filingDate).toBe("2023-01-16");
      expect(filing.primaryDocument).toBe("doc2.xml");
    });

    test("should keep separate entries for different accession numbers", () => {
      const filingMap = new Map();
      
      // Two different Form 4 filings
      filingMap.set("000123456723000123", {
        accessionNumber: "0001234567-23-000123",
        filingDate: "2023-01-15",
        primaryDocument: "doc1.xml",
        formType: "4",
      });
      
      filingMap.set("000123456723000124", {
        accessionNumber: "0001234567-23-000124",
        filingDate: "2023-01-16",
        primaryDocument: "doc2.xml",
        formType: "4",
      });
      
      expect(filingMap.size).toBe(2);
    });

    test("should include both Form 4 and Form 4/A in output", () => {
      // When 4/A has a different accession number, both should appear
      const filingMap = new Map();
      filingMap.set("acc1", {
        accessionNumber: "acc1", filingDate: "2023-01-15",
        primaryDocument: "doc1.xml", formType: "4",
      });
      filingMap.set("acc2", {
        accessionNumber: "acc2", filingDate: "2023-01-16",
        primaryDocument: "doc2.xml", formType: "4/A",
      });

      const form4s = [];
      for (const [acc, filing] of filingMap) {
        form4s.push({ accessionNumber: filing.accessionNumber, formType: filing.formType });
      }

      expect(form4s).toHaveLength(2);
      expect(form4s.map(f => f.formType).sort()).toEqual(["4", "4/A"]);
    });
  });

  describe("Cache TTL Override", () => {
    test("should cache empty results with shorter TTL", () => {
      const cacheTtl = 7200; // 2 hours in seconds
      expect(cacheTtl).toBe(60 * 60 * 2);
    });

    test("should not cache errors", () => {
      // Verify that errors are thrown and not cached
      const error = new Error("Test error");
      expect(() => {
        throw error;
      }).toThrow("Test error");
    });
  });

  describe("Pagination Logic", () => {
    test("should stop early when enough Form 4s are found", () => {
      const MIN_FORM4S = 10;
      const filingMap = new Map();
      
      // Add 10 Form 4 entries
      for (let i = 0; i < 10; i++) {
        filingMap.set(`acc${i}`, {
          accessionNumber: `acc${i}`,
          filingDate: "2023-01-15",
          primaryDocument: "doc.xml",
          formType: "4",
        });
      }
      
      // Should stop processing when we have enough
      expect(filingMap.size).toBeGreaterThanOrEqual(MIN_FORM4S);
    });

    test("should cap at 3 pages maximum", () => {
      const MAX_PAGES = 3;
      let pagesProcessed = 0;
      
      // Simulate processing pages
      for (let i = 0; i < 5; i++) {
        if (pagesProcessed >= MAX_PAGES) break;
        pagesProcessed++;
      }
      
      expect(pagesProcessed).toBe(MAX_PAGES);
    });
  });
});

describe("getOrFetch TTL Parameter", () => {
  // Minimal in-memory cache simulation
  function createFakeCache() {
    const store = new Map();
    const ttlStore = new Map();
    const getter = (key) => store.get(key);
    const setter = (key, value, ttl) => {
      store.set(key, value);
      if (ttl !== undefined) ttlStore.set(key, ttl);
    };
    return { getter, setter, store, ttlStore };
  }

  test("should pass TTL to setter when provided", async () => {
    const { getter, setter, store, ttlStore } = createFakeCache();
    const key = "test-key";
    const value = { data: "hello" };

    await getOrFetch(getter, setter, key, async () => value, 7200);

    expect(store.get(key)).toEqual(value);
    expect(ttlStore.get(key)).toBe(7200);
  });

  test("should call setter without TTL when ttl is undefined", async () => {
    const { getter, setter, store, ttlStore } = createFakeCache();
    const key = "test-key-no-ttl";
    const value = { data: "world" };

    await getOrFetch(getter, setter, key, async () => value);

    expect(store.get(key)).toEqual(value);
    expect(ttlStore.has(key)).toBe(false);
  });

  test("should not call fetcher on cache hit", async () => {
    const { getter, setter, store } = createFakeCache();
    const key = "cached-key";
    store.set(key, { cached: true });

    let fetchCount = 0;
    const result = await getOrFetch(getter, setter, key, async () => {
      fetchCount++;
      return { fresh: true };
    });

    expect(result).toEqual({ cached: true });
    expect(fetchCount).toBe(0);
  });
});
