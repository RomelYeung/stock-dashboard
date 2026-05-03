import { getAAIISentiment } from './services/aaii.js';

async function test() {
  try {
    const data = await getAAIISentiment();
    console.log("Current Value:", data.currentValue);
    console.log("History length:", data.history.length);
    console.log("Last item:", data.history[data.history.length - 1]);
  } catch (e) {
    console.error(e);
  }
}
test();
