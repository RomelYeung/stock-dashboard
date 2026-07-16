import { getSummary } from "./services/yahoofinance.js";
const s = await getSummary("FICO");
console.log("FICO earningsDate:", s.earningsDate);
console.log("FICO name:", s.name, "price:", s.currentPrice);
