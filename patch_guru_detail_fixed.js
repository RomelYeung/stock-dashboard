const fs = require('fs');
let code = fs.readFileSync('frontend/src/components/GuruDetail.jsx', 'utf8');

const oldQoqMap = `      const prevMap = new Map(prevHoldings.map(h => [h.ticker.toUpperCase(), h.shares]));
      currHoldings.forEach(curr => {
        const tickerUpper = curr.ticker.toUpperCase();
        if (!prevMap.has(tickerUpper)) {
          map[tickerUpper] = { label: "New", numericSort: Infinity };
        } else {
          const prevShares = prevMap.get(tickerUpper);
          if (prevShares === 0) {
            map[tickerUpper] = { label: "New", numericSort: Infinity };
          } else if (curr.shares === prevShares) {
            map[tickerUpper] = { label: "0%", numericSort: 0 };
          } else {
            const pctChange = ((curr.shares - prevShares) / prevShares) * 100;
            const sign = pctChange > 0 ? "+" : "";
            map[tickerUpper] = { label: \`\${sign}\${pctChange.toFixed(1)}%\`, numericSort: pctChange };
          }
        }
      });
      // Handle closed positions
      prevHoldings.forEach(prev => {
        const tickerUpper = prev.ticker.toUpperCase();
        if (!currHoldings.some(c => c.ticker.toUpperCase() === tickerUpper)) {
          map[tickerUpper] = { label: "Closed", numericSort: -Infinity };
        }
      });`;

const newQoqMap = `      const aggregate = (holdings) => {
        const m = new Map();
        for (const h of holdings) {
          const key = \`\${h.ticker.toUpperCase()}-\${(h.optionType || "none").toLowerCase()}\`;
          if (!m.has(key)) {
            m.set(key, h.shares);
          } else {
            m.set(key, m.get(key) + h.shares);
          }
        }
        return m;
      };

      const prevMap = aggregate(prevHoldings);
      const currMap = aggregate(currHoldings);

      for (const [key, currShares] of currMap.entries()) {
        if (!prevMap.has(key)) {
          map[key] = { label: "New", numericSort: Infinity };
        } else {
          const prevShares = prevMap.get(key);
          if (prevShares === 0) {
            map[key] = { label: "New", numericSort: Infinity };
          } else if (currShares === prevShares) {
            map[key] = { label: "0%", numericSort: 0 };
          } else {
            const pctChange = ((currShares - prevShares) / prevShares) * 100;
            const sign = pctChange > 0 ? "+" : "";
            map[key] = { label: \`\${sign}\${pctChange.toFixed(1)}%\`, numericSort: pctChange };
          }
        }
      }
      
      // Handle closed positions
      for (const [key, prevShares] of prevMap.entries()) {
        if (!currMap.has(key)) {
          map[key] = { label: "Closed", numericSort: -Infinity };
        }
      }`;

code = code.replace(oldQoqMap, newQoqMap);
fs.writeFileSync('frontend/src/components/GuruDetail.jsx', code);
