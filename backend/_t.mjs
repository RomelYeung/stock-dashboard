import { getSummary } from "./services/yahoofinance.js";
const s = await getSummary("FICO");
console.log("DISK getSummary FICO earningsDate:", s.earningsDate);
process.exit(0);
