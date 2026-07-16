import { getAiClient } from "./aiClient.js";
import prisma from "./db.js";

import * as newsService from "./newsService.js";
import * as secGuidance from "./secGuidance.js";
import * as earnings from "./earnings.js";

const SYSTEM_PROMPT = `
You are a Financial Coordinator Agent orchestrating a team of specialized AI agents:
1. Data Analyst: Analyzes market data, fundamentals, and recent news.
2. Trading Analyst: Develops trading strategies based on risk profile and investment goals.
3. Execution Analyst: Defines execution plans for trading strategies.
4. Risk Evaluation Agent: Evaluates the overall risk of proposed plans.

You are provided with baseline quantitative data upfront. If the user asks for deep dives into SEC filings, recent news, or earnings call sentiment, you MUST use the available tools to fetch that data.

When answering, you MUST output your response explicitly separating which subagent is speaking. Use the exact format:
[Agent Name]: message

CITATION INSTRUCTIONS:
Whenever you mention a specific financial metric that appears on the user's dashboard (e.g. WACC, Revenue Growth, DCF Fair Value, Monte Carlo bounds), you MUST format it as a markdown link with the id as the href.
Valid hrefs: "#wacc", "#growth", "#dcf-value", "#monte-carlo".
Example: "The [WACC](#wacc) of 8.5% implies a [DCF Fair Value](#dcf-value) of $150."

QUICK REPLIES INSTRUCTION:
At the very end of your final response, you MUST append exactly ONE structured JSON array containing 2-3 suggested follow-up questions for the user. Use the exact format:
[Suggestions]: ["What are the downside risks?", "How does this compare to sector peers?"]
`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "fetchRecentNews",
        description: "Fetches recent news articles and an AI summary for the ticker. Use this when the user asks for the latest news or market sentiment.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "fetchSECFilings",
        description: "Fetches recent SEC 8-K filings and forward-looking guidance for the ticker.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "fetchEarningsSentiment",
        description: "Fetches deep forensic AI sentiment analysis of the latest earnings call.",
        parameters: { type: "OBJECT", properties: {} }
      }
    ]
  }
];

export async function* streamAdviserChat(sessionId, userId, ticker, userMessage, quantData) {
  let session;
  if (sessionId) {
    session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  } else if (userId) {
    session = await prisma.chatSession.findFirst({
       where: { userId, ticker },
       orderBy: { createdAt: 'desc' }
    });
  }

  if (!session) {
    session = await prisma.chatSession.create({ data: { userId, ticker } });
  }
  yield { type: 'sessionId', sessionId: session.id };

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: userMessage },
  });

  const history = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  const formattedHistory = history.map(msg => {
    if (msg.role === "user") return `User: ${msg.content}`;
    return msg.content;
  }).join("\n\n");

  const prompt = `
System Context:
Ticker: ${ticker}
Quantitative & Fundamental Data:
${JSON.stringify(quantData, null, 2)}

Conversation History:
${formattedHistory}

Continue the conversation. You must speak on behalf of the Coordinator and relevant subagents.
Begin your next turn using the [Agent Name]: format.
`;

  const aiClient = getAiClient();
  let contents = [
    { role: "user", parts: [{ text: prompt }] }
  ];

  let fullResponse = "";
  let currentAgent = "Coordinator";

  while(true) {
    const responseStream = await aiClient.models.generateContentStream({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: contents,
      config: { 
        systemInstruction: SYSTEM_PROMPT, 
        temperature: 0.7,
        tools: tools
      }
    });

    let buffer = "";
    let functionCalls = [];
    let functionCallParts = [];

    for await (const chunk of responseStream) {
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const p of chunk.candidates[0].content.parts) {
          if (p.functionCall) functionCallParts.push(p);
        }
      }
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        functionCalls.push(...chunk.functionCalls);
      }
      
      const text = chunk.text || "";
      if (text) {
        fullResponse += text;
        buffer += text;
        
        const regex = /\[([^\]]+)\]:\s*/g;
        let match;
        while ((match = regex.exec(buffer)) !== null) {
          if (match.index > 0) {
            yield { agent: currentAgent, chunk: buffer.substring(0, match.index) };
          }
          currentAgent = match[1];
          buffer = buffer.substring(match.index + match[0].length);
          regex.lastIndex = 0;
        }
        
        if (buffer.length > 50) {
          const safeLength = buffer.lastIndexOf("\n") !== -1 ? buffer.lastIndexOf("\n") + 1 : buffer.length - 20;
          if (safeLength > 0) {
            yield { agent: currentAgent, chunk: buffer.substring(0, safeLength) };
            buffer = buffer.substring(safeLength);
          }
        }
      }
    }
    
    if (buffer.length > 0) {
      yield { agent: currentAgent, chunk: buffer };
    }

    if (functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of functionCalls) {
        const { name } = call;
        yield { type: "status", message: `Coordinator is running tool: ${name}...` };
        
        let result = {};
        try {
          if (name === "fetchRecentNews") {
            const articles = await newsService.getStockNews(ticker);
            const aiSummary = await newsService.getNewsAISummary(ticker, articles);
            result = { sentiment: aiSummary.sentiment, summary: aiSummary.summary };
          } else if (name === "fetchSECFilings") {
            result = await secGuidance.getSecGuidance(ticker);
          } else if (name === "fetchEarningsSentiment") {
            result = await earnings.getEarningsSentiment(ticker);
          }
        } catch(e) {
          result = { error: e.message };
        }
        
        functionResponses.push({
           functionResponse: { name, response: result }
        });
      }
      
      contents.push({ role: "model", parts: functionCallParts });
      contents.push({ role: "user", parts: functionResponses });
    } else {
      break; 
    }
  }

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "model", content: fullResponse }
  });
}

export async function getSessionsList(userId, ticker) {
  const sessions = await prisma.chatSession.findMany({
    where: { userId, ticker },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 2
      }
    }
  });

  return sessions.map(session => {
    const snippetMsg = session.messages.find(m => m.role === 'user')?.content || "New Session";
    return {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      snippet: snippetMsg.substring(0, 50) + (snippetMsg.length > 50 ? "..." : "")
    };
  });
}

export async function getSessionHistory(sessionId, userId, ticker) {
  let session;
  if (sessionId) {
    session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
  } else if (userId) {
    session = await prisma.chatSession.findFirst({
      where: { userId, ticker },
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
  }
  
  if (!session) return { sessionId: null, messages: [] };
  
  const parsedMessages = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
       parsedMessages.push({ role: "user", agent: "User", text: msg.content });
    } else {
       const parts = msg.content.split(/\[(.*?)\]:\s*/);
       if (parts.length === 1) {
          parsedMessages.push({ role: "model", agent: "Coordinator", text: parts[0] });
       } else {
          for (let i = 1; i < parts.length; i += 2) {
             if (parts[i+1] && parts[i+1].trim()) {
                 parsedMessages.push({ role: "model", agent: parts[i], text: parts[i+1] });
             }
          }
       }
    }
  }
  return { sessionId: session.id, messages: parsedMessages };
}
