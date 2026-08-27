import { getAiClient } from "./aiClient.js";
import prisma from "./db.js";

import * as newsService from "./newsService.js";
import * as secGuidance from "./secGuidance.js";
import * as earnings from "./earnings.js";
import { buildAnalystBrief } from "./adviser/analystBrief.js";
import { fastLaneSystemPrompt } from "./adviser/personas.js";
import { runDeepDebate } from "./adviser/debate.js";
import { formatProfileBlock, getInvestorProfile } from "./adviser/profile.js";
import { classifyLane } from "./adviser/router.js";

export const MAX_GENERATION_ROUNDS = 4;
export const MAX_TOOL_CALLS = 8;
export const MAX_RESPONSE_CHARS = 12000;
export const MAX_CONTEXT_CHARS = 24000;

const MAX_TEXT_PART_CHARS = 8000;
const LIMIT_NOTICE = "\n\n[Coordinator]: Response stopped after the adviser safety limit.";

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

export async function findOwnedSession(sessionId, userId, ticker) {
  if (!sessionId || !userId || !ticker) return null;
  return prisma.chatSession.findFirst({ where: { id: sessionId, userId, ticker } });
}

async function resolveSession(sessionId, userId, ticker) {
  if (!userId) throw new Error("Authentication required.");

  let session;
  if (sessionId) {
    session = await findOwnedSession(sessionId, userId, ticker);
    if (!session) {
      const error = new Error("Session not found.");
      error.status = 404;
      throw error;
    }
  } else {
    session = await prisma.chatSession.findFirst({
       where: { userId, ticker },
       orderBy: { createdAt: 'desc' }
    });
  }

  if (!session) {
    session = await prisma.chatSession.create({ data: { userId, ticker } });
  }
  return session;
}

async function runTool(name, ticker) {
  try {
    if (name === "fetchRecentNews") {
      const articles = await newsService.getStockNews(ticker);
      const aiSummary = await newsService.getNewsAISummary(ticker, articles);
      return { sentiment: aiSummary.sentiment, summary: aiSummary.summary };
    }
    if (name === "fetchSECFilings") return await secGuidance.getSecGuidance(ticker);
    if (name === "fetchEarningsSentiment") return await earnings.getEarningsSentiment(ticker);
  } catch (error) {
    return { error: error.message };
  }
  return {};
}

function boundedPart(part) {
  if (typeof part?.text === "string") {
    return { ...part, text: part.text.slice(0, MAX_TEXT_PART_CHARS) };
  }
  if (part?.functionResponse?.response !== undefined) {
    const responseText = JSON.stringify(part.functionResponse.response);
    if (responseText.length > MAX_TEXT_PART_CHARS) {
      return {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: { error: "Tool response truncated for context safety." },
        },
      };
    }
  }
  if (part?.functionCall?.args !== undefined) {
    const argsText = JSON.stringify(part.functionCall.args);
    if (argsText.length > MAX_TEXT_PART_CHARS) {
      return {
        ...part,
        functionCall: {
          ...part.functionCall,
          args: { error: "Tool arguments truncated for context safety." },
        },
      };
    }
  }
  return part;
}

function boundedContents(contents) {
  const result = contents.map((content) => ({
    ...content,
    parts: (content.parts || []).map(boundedPart),
  }));

  while (JSON.stringify(result).length > MAX_CONTEXT_CHARS && result.length > 3) {
    // Remove the oldest complete model/tool pair while retaining the initial and latest turns.
    result.splice(1, Math.min(2, result.length - 2));
  }

  while (JSON.stringify(result).length > MAX_CONTEXT_CHARS) {
    let longest = null;
    for (const content of result) {
      for (const part of content.parts || []) {
        if (typeof part.text === "string" && (!longest || part.text.length > longest.part.text.length)) {
          longest = { part };
        }
      }
    }
    if (!longest || longest.part.text.length === 0) break;
    longest.part.text = longest.part.text.slice(0, Math.max(0, longest.part.text.length - 1000));
  }

  return result;
}

async function* runFastLane({ history, ticker, userMessage, quantData, profileBlock = "" }) {
  const v2 = process.env.ADVISER_V2 === "v2";
  const formattedHistory = [...history, { role: "user", content: userMessage }].map(msg => {
    if (msg.role === "user") return `User: ${msg.content}`;
    return msg.content;
  }).join("\n\n");

  let contents;
  let systemInstruction = SYSTEM_PROMPT;
  let temperature = 0.7;
  let currentAgent = "Coordinator";

  if (v2) {
    const { text: briefText, redFlags } = buildAnalystBrief({ ...quantData, ticker });
    systemInstruction = fastLaneSystemPrompt({ profileBlock }) + (redFlags.length
      ? `\nAUTO-DETECTED RED FLAGS (address if relevant):\n${redFlags.join("\n")}`
      : "");
    temperature = 0.9;
    currentAgent = "Alex Meridian";

    const priorMessages = history.slice(-20);
    contents = priorMessages.map((msg, index) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: index === 0 ? `${briefText}\n---\n${msg.content}` : msg.content }],
    }));
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: `${briefText}\n---\n${userMessage}` }] });
    } else {
      contents.push({ role: "user", parts: [{ text: userMessage }] });
    }
  } else {
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
    contents = [{ role: "user", parts: [{ text: prompt }] }];
  }

  const aiClient = getAiClient();
  let fullResponse = "";
  let toolCallsExecuted = 0;
  let limitReason = null;

  let round = 0;
  while (!v2 || round < MAX_GENERATION_ROUNDS) {
    round += 1;
    if (v2) contents = boundedContents(contents);
    const responseStream = await aiClient.models.generateContentStream({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: contents,
      config: { 
        systemInstruction,
        temperature,
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
        const responseBudget = Math.max(0, MAX_RESPONSE_CHARS - LIMIT_NOTICE.length);
        const boundedText = v2
          ? text.slice(0, Math.max(0, responseBudget - fullResponse.length))
          : text;
        if (v2 && boundedText.length < text.length) limitReason = "response";
        fullResponse += boundedText;
        buffer += boundedText;
        
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
      if (v2 && (limitReason || round === MAX_GENERATION_ROUNDS || toolCallsExecuted + functionCalls.length > MAX_TOOL_CALLS)) {
        limitReason ||= round === MAX_GENERATION_ROUNDS ? "rounds" : "tools";
        break;
      }

      const functionResponses = [];
      for (const call of functionCalls) {
        const { name } = call;
        yield { type: "status", message: `Coordinator is running tool: ${name}...` };
        
        const result = await runTool(name, ticker);
        toolCallsExecuted += 1;
        
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

  if (limitReason) {
    yield { type: "status", message: "Adviser generation safety limit reached; stopping tool continuation." };
    yield { type: "error", error: "Adviser generation limit reached.", message: "The response was bounded safely." };
    const notice = LIMIT_NOTICE.slice(0, Math.max(0, MAX_RESPONSE_CHARS - fullResponse.length));
    if (notice) {
      fullResponse += notice;
      yield { agent: currentAgent, chunk: notice };
    }
  }

  return { fullResponse };
}

export async function* streamAdviserChat(sessionId, userId, ticker, userMessage, quantData, forceDeep = false) {
  const session = await resolveSession(sessionId, userId, ticker);
  yield { type: "sessionId", sessionId: session.id };

  const history = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  // The facade owns the single user write; deep and fast lanes only generate.
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: userMessage },
  });

  let profileBlock = "";
  if (process.env.ADVISER_V2 === "v2") {
    try {
      profileBlock = formatProfileBlock(await getInvestorProfile(userId));
    } catch (error) {
      console.error("[adviser] investor profile unavailable:", error.message);
    }
  }

  const v2 = process.env.ADVISER_V2 === "v2";
  const autoDeep = v2 && process.env.ADVISER_AUTO_DEEP === "true";
  const lane = classifyLane(userMessage, { forceDeep, autoDeep });

  if (v2 && lane === "deep") {
    try {
      const debate = yield* runDeepDebate({ ticker, userMessage, quantData, history, profileBlock });
      await prisma.adviserDebate.create({
        data: {
          sessionId: session.id,
          ticker,
          question: userMessage,
          memos: debate.memos,
          rebuttals: debate.rebuttals,
          synthesis: debate.synthesis,
        },
      });
      yield { agent: "Alex Meridian", chunk: debate.synthesis };
      await prisma.chatMessage.create({
        data: { sessionId: session.id, role: "model", content: debate.synthesis },
      });
      return;
    } catch (error) {
      yield { type: "status", message: "Full Panel synthesis failed; running the fast lane fallback." };
      yield { type: "error", error: "Deep adviser synthesis failed.", message: "Using the fast lane fallback." };
    }
  }

  const { fullResponse } = yield* runFastLane({ history, ticker, userMessage, quantData, profileBlock });
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "model", content: fullResponse },
  });
}

export async function getSessionsList(userId, ticker) {
  if (!userId) return [];
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
    session = await findOwnedSession(sessionId, userId, ticker);
    if (session) {
      session = await prisma.chatSession.findFirst({
        where: { id: session.id, userId, ticker },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
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
