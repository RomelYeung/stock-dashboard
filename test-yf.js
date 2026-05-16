import * as yfModule from "yahoo-finance2";
const yahooFinance = new yfModule.default();
async function test() {
  try {
    const quotes = await yahooFinance.quote(["AAPL", "INVALID_TICKER_123"]);
    console.log(quotes.map(q => q.symbol));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
