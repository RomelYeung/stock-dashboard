import yf from "yahoo-finance2";
const yahooFinance = new yf();
const tickers = process.argv.slice(2);
for (const t of tickers) {
  try {
    const r = await Promise.race([
      yahooFinance.quoteSummary(t, { modules: ["calendarEvents","price"] }, { validateResult: false }),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),15000))
    ]);
    const ed = r?.calendarEvents?.earnings?.earningsDate?.[0];
    console.log(t, ed ? new Date(ed).toISOString() : "NONE");
  } catch(e) {
    console.log(t, "ERR:"+e.message);
  }
}
