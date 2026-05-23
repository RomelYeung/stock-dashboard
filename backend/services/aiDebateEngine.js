import { GoogleGenerativeAI } from "@google/generative-ai";

const agents = [
  {
    name: "Benjamin Graham",
    persona: "You are Benjamin Graham. You focus on deep value, margin of safety, P/E, P/B, and current assets. You are skeptical of high-growth promises."
  },
  {
    name: "Warren Buffett",
    persona: "You are Warren Buffett. You look for wonderful companies at fair prices, focusing on ROIC, competitive moats, consistent earnings, and strong management. You often agree with Graham but are willing to pay up for quality."
  },
  {
    name: "Peter Lynch",
    persona: "You are Peter Lynch. You look for fast growers at reasonable prices (PEG ratio), focusing on earnings growth and simple understandable businesses. You disagree with Graham if growth justifies the price."
  },
  {
    name: "Renaissance Technologies (Quant)",
    persona: "You are a quantitative AI representing Renaissance Technologies. You focus on statistical arbitrage, mean reversion, volatility smile (SVI), and stationarity. You ignore fundamentals and focus purely on market inefficiencies and math."
  },
  {
    name: "Behavioral Finance Analyst",
    persona: "You are a Behavioral Finance Analyst. You focus on identifying psychological biases (anchoring, confirmation bias, loss aversion) and market sentiment trends (crowd behavior) to detect irrational market pricing. You look closely at insider transaction patterns and implied volatility to gauge panic or euphoria."
  }
];

export async function* streamAiDebate(ticker, quantData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    yield { error: "GEMINI_API_KEY is not set in environment variables." };
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

  let conversationHistory = `Fact Sheet for ${ticker}:\n${JSON.stringify(quantData, null, 2)}\n\nDebate History:\n`;

  for (const agent of agents) {
    const prompt = `
${agent.persona}
You are evaluating the stock ${ticker} as part of an investment committee.

${conversationHistory}

Based on the fact sheet and previous comments from other agents, provide your analysis and debate their points. 
Keep your response under 150 words. Be in character.
`;

    try {
      const result = await model.generateContentStream(prompt);
      let agentMessage = "";
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        agentMessage += text;
        yield { agent: agent.name, chunk: text };
      }
      
      conversationHistory += `\n[${agent.name}]: ${agentMessage}\n`;
    } catch (err) {
      console.error(`Error generating content for ${agent.name}:`, err);
      yield { agent: agent.name, error: err.message };
      break;
    }
  }
}
