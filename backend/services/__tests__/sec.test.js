import { parse13Fxml, parse13D_G, translateCusipToTicker, calculateQoQ } from "../sec.js";

describe("SEC Service Unit Tests", () => {
  describe("parse13Fxml", () => {
    test("should parse standard 13F XML with multiple entries", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <informationTable>
        <infoTable>
          <nameOfIssuer>Apple Inc</nameOfIssuer>
          <cusip>037833100</cusip>
          <shrsOrPrnAmt>
            <sshPrnamt>150000</sshPrnamt>
          </shrsOrPrnAmt>
          <value>27000</value>
          <putCall>none</putCall>
        </infoTable>
        <infoTable>
          <nameOfIssuer>Microsoft Corp</nameOfIssuer>
          <cusip>594918104</cusip>
          <shrsOrPrnAmt>
            <sshPrnamt>80000</sshPrnamt>
          </shrsOrPrnAmt>
          <value>32000</value>
          <putCall>CALL</putCall>
        </infoTable>
      </informationTable>`;

      const parsed = await parse13Fxml(xml);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].companyName).toBe("Apple Inc");
      expect(parsed[0].cusip).toBe("037833100");
      expect(parsed[0].shares).toBe(150000);
      expect(parsed[0].value).toBe(27000);
      expect(parsed[0].optionType).toBe("none");

      expect(parsed[1].companyName).toBe("Microsoft Corp");
      expect(parsed[1].optionType).toBe("call");
    });

    test("should parse 13F XML with namespace prefixes", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ns1:informationTable xmlns:ns1="http://www.sec.gov/documents/wxs">
        <ns1:infoTable>
          <ns1:nameOfIssuer>Google LLC</ns1:nameOfIssuer>
          <ns1:cusip>02079K305</ns1:cusip>
          <ns1:shrsOrPrnAmt>
            <ns1:sshPrnamt>50000</ns1:sshPrnamt>
          </ns1:shrsOrPrnAmt>
          <ns1:value>15000</ns1:value>
          <ns1:putCall>PUT</ns1:putCall>
        </ns1:infoTable>
      </ns1:informationTable>`;

      const parsed = await parse13Fxml(xml);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].companyName).toBe("Google LLC");
      expect(parsed[0].cusip).toBe("02079K305");
      expect(parsed[0].shares).toBe(50000);
      expect(parsed[0].value).toBe(15000);
      expect(parsed[0].optionType).toBe("put");
    });

    test("should parse single infoTable element", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <informationTable>
        <infoTable>
          <NameOfIssuer>Amazon.com Inc</NameOfIssuer>
          <CUSIP>023135106</CUSIP>
          <ShrsOrPrnAmt>
            <SshPrnamt>20000</SshPrnamt>
          </ShrsOrPrnAmt>
          <Value>3500</Value>
          <PutCall>none</PutCall>
        </infoTable>
      </informationTable>`;

      const parsed = await parse13Fxml(xml);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].companyName).toBe("Amazon.com Inc");
      expect(parsed[0].shares).toBe(20000);
    });

    test("should throw error for malformed XML", async () => {
      const badXml = `<invalid-tag><unclosed-node>`;
      await expect(parse13Fxml(badXml)).rejects.toThrow("Malformed XML");
    });
  });

  describe("parse13D_G", () => {
    test("should calculate conviction score for 13D and 13G", () => {
      const dFiling = { type: "13D", percentOfClass: 12.0, date: "2026-06-20" };
      const gFiling = { type: "13G", percentOfClass: 8.5, date: "2026-06-20" };

      const dScore = parse13D_G(dFiling);
      const gScore = parse13D_G(gFiling);

      expect(dScore.convictionScore).toBe(10.0); // 8.5 + 1.5 premium
      expect(gScore.convictionScore).toBe(5.0);  // 5.0 base
    });

    test("should throw error for invalid type", () => {
      expect(() => parse13D_G({ type: "10-K" })).toThrow("Invalid filing type");
    });
  });

  describe("translateCusipToTicker", () => {
    test("should map CUSIP to ticker via localCache or fallbackFetcher", () => {
      const localCache = { "037833100": "AAPL" };
      const fallbackFetcher = (cusip) => (cusip === "594918104" ? "MSFT" : null);

      expect(translateCusipToTicker("037833100", localCache, fallbackFetcher)).toBe("AAPL");
      expect(translateCusipToTicker("594918104", localCache, fallbackFetcher)).toBe("MSFT");
      expect(translateCusipToTicker("UNKNOWN", localCache, fallbackFetcher)).toBeNull();
    });
  });

  describe("calculateQoQ", () => {
    test("should identify New, Closed, Increased, and Decreased holdings", () => {
      const prev = [
        { ticker: "AAPL", shares: 100, value: 1000 },
        { ticker: "MSFT", shares: 200, value: 2000 },
        { ticker: "TSLA", shares: 50, value: 500 }
      ];
      const curr = [
        { ticker: "AAPL", shares: 120, value: 1200 }, // Increased
        { ticker: "MSFT", shares: 150, value: 1500 }, // Decreased
        { ticker: "NVDA", shares: 80, value: 800 }   // New
        // TSLA Closed
      ];

      const diffs = calculateQoQ(prev, curr);
      const aapl = diffs.find(d => d.ticker === "AAPL");
      const msft = diffs.find(d => d.ticker === "MSFT");
      const nvda = diffs.find(d => d.ticker === "NVDA");
      const tsla = diffs.find(d => d.ticker === "TSLA");

      expect(aapl.change).toBe("Increased");
      expect(aapl.sharesDiff).toBe(20);
      expect(msft.change).toBe("Decreased");
      expect(msft.sharesDiff).toBe(-50);
      expect(nvda.change).toBe("New");
      expect(nvda.sharesDiff).toBe(80);
      expect(tsla.change).toBe("Closed");
      expect(tsla.sharesDiff).toBe(-50);
    });
  });
});
