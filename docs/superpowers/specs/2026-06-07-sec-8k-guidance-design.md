# SEC 8-K Forward Guidance Parser Design

## Overview

Add a free SEC 8-K parser to extract forward guidance from company filings, integrating with the existing earnings sentiment analysis to provide a comprehensive view of company outlook.

## Requirements

1. Fetch latest 8-K filing from SEC EDGAR API
2. Extract text from Exhibit 99.1 (press releases)
3. Use Gemini API to parse and extract structured forward guidance
4. Integrate with existing earnings sentiment analysis
5. Cache 8-K data for 24 hours
6. Display in EarningsTab UI

## Backend Architecture

### New Service: `backend/services/secGuidance.js`

**Purpose:** Fetch and cache 8-K filings from SEC EDGAR

**Key Functions:**
- `getSecGuidance(ticker)` - Main entry point
- `getCIK(ticker)` - Fetch SEC CIK (reuse from insiderTrading.js)
- `getLatest8K(cik)` - Fetch latest 8-K filing
- `extractExhibit991(filing)` - Extract press release text

**Data Flow:**
```
getSecGuidance(ticker)
  → getCIK(ticker) [cached in fundamentals cache]
  → getLatest8K(cik) [returns filing metadata]
  → fetch filing text
  → extract Exhibit 99.1
  → cache result [24 hours]
  → return { filingDate, text, ticker }
```

**Cache Strategy:**
- Cache key: `8k-guidance:${ticker}`
- TTL: 24 hours (same as insider trading)
- Storage: NodeCache with fundamentals cache

### Enhanced Service: `backend/services/earnings.js`

**Changes to `getEarningsSentiment(ticker)`:**

1. Import and call `getSecGuidance(ticker)` 
2. Include 8-K text in Gemini prompt
3. Extract forward guidance from combined analysis
4. Return enhanced sentiment with guidance data

**Enhanced Prompt Structure:**
```
You are an expert financial analyst. Analyze the following data for ${ticker}:

Earnings Data:
${JSON.stringify(earningsData)}

SEC 8-K Filing (Exhibit 99.1):
${secGuidance.text}

Your task:
1. Extract forward guidance from the 8-K filing
2. Analyze earnings data and management commentary
3. Provide sentiment score (Bullish/Bearish/Neutral)
4. Extract specific guidance metrics if available

Format response as JSON:
{
  "score": "Bullish",
  "summary": "Brief analysis...",
  "guidance": {
    "revenue": { "low": 10.5, "high": 11.0, "unit": "billion" },
    "eps": { "low": 2.50, "high": 2.75 },
    "quarter": "Q3 2026",
    "source": "SEC 8-K Exhibit 99.1"
  }
}
```

### New Route: `backend/routes/stocks.js`

**Endpoint:** `GET /api/stocks/:ticker/8k-guidance`

**Purpose:** Return raw 8-K data for frontend display

**Response:**
```json
{
  "success": true,
  "data": {
    "ticker": "AAPL",
    "filingDate": "2026-06-01",
    "accessionNumber": "0000320193-26-000065",
    "text": "Exhibit 99.1 text..."
  }
}
```

**Caching:** 24 hours (same as service)

### Constants: `backend/constants.js`

**Add:**
```javascript
export const CACHE_TTL_8K = 60 * 60 * 24; // 24 hours for 8-K filings
```

## Frontend Architecture

### New Hook: `frontend/src/hooks/useStockData.js`

**Function:** `use8KGuidance(ticker)`

**Purpose:** Fetch raw 8-K data from backend

**Implementation:**
```javascript
export function use8KGuidance(ticker) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["8kGuidance", ticker],
    queryFn: () => apiFetch(`/${ticker}/8k-guidance`),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  return { data, loading: isLoading, error: error?.message };
}
```

### Enhanced Component: `frontend/src/components/EarningsTab.jsx`

**Changes to `AISentimentCard`:**

1. Import `use8KGuidance` hook
2. Fetch 8-K data alongside earnings sentiment
3. Display guidance metrics if available
4. Show SEC filing date as source

**UI Layout (to be designed by @ui-specialist):**
- Sentiment score badge (Bullish/Bearish/Neutral)
- Forward guidance section with revenue/EPS ranges
- Source: SEC 8-K filing date
- Summary text

## Implementation Order

1. **Backend Service** - Create `secGuidance.js`
2. **Backend Route** - Add `/api/stocks/:ticker/8k-guidance`
3. **Backend Integration** - Enhance `earnings.js` to include 8-K data
4. **Frontend Hook** - Add `use8KGuidance` to `useStockData.js`
5. **Frontend UI** - Enhance `AISentimentCard` (with UI specialist)
6. **Release Note** - Add entry to `release-notes.html`

## Testing Plan

1. **Unit Tests:**
   - Test SEC CIK lookup
   - Test 8-K fetch and parsing
   - Test Exhibit 99.1 extraction
   - Test Gemini prompt construction

2. **Integration Tests:**
   - Test complete flow from ticker to guidance
   - Test caching behavior
   - Test error handling (no 8-K, API failures)

3. **Manual Testing:**
   - Test with real tickers (AAPL, MSFT, GOOG)
   - Verify guidance extraction accuracy
   - Check UI rendering

## Edge Cases

1. **No 8-K filing available** - Return null guidance
2. **No Exhibit 99.1** - Fall back to main 8-K text
3. **SEC API rate limits** - Implement backoff
4. **Gemini API failures** - Return partial data with error
5. **Invalid ticker** - Proper error handling

## Performance Considerations

1. **Caching:** 24-hour cache reduces SEC API calls
2. **Batch Processing:** Fetch CIK once, reuse for multiple requests
3. **Parallel Requests:** Fetch 8-K and earnings data simultaneously
4. **Token Optimization:** Truncate 8-K text if too long for Gemini

## Security Considerations

1. **SEC User-Agent:** Required by SEC API policy
2. **Rate Limiting:** Respect SEC API limits
3. **Input Validation:** Sanitize ticker and filing data
4. **Error Messages:** Don't expose internal details

## Future Enhancements

1. **Multiple Filing Support:** Analyze multiple 8-Ks over time
2. **Guidance Tracking:** Compare guidance vs actual results
3. **Industry Comparison:** Benchmark against sector peers
4. **Alerts:** Notify when new 8-K is filed

---

**Design Status:** Approved
**Implementation Ready:** Yes
**Next Step:** Invoke writing-plans skill