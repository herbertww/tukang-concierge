/**
 * qwen.ts
 * Qwen Cloud (Alibaba Cloud DashScope) client, OpenAI-compatible chat completions.
 * Docs: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope
 *
 * This is Tukang's Alibaba Cloud API usage proof for the Qwen Cloud Global Hackathon
 * (Track 4 — Autopilot Agent).
 */

import axios from "axios";
import { config } from "./config.js";
import { TUKANG_SYSTEM_PROMPT } from "./system-prompt.js";

export interface QwenMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface QwenChatResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const qwenClient = axios.create({
  baseURL: config.qwen.baseUrl,
  headers: {
    Authorization: `Bearer ${config.qwen.apiKey}`,
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

interface DashScopeChatResponse {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Send a chat completion request to Qwen Cloud via DashScope's
 * OpenAI-compatible endpoint.
 */
export async function qwenChatCompletion(
  messages: QwenMessage[],
  options?: { model?: string; temperature?: number }
): Promise<QwenChatResult> {
  // Inject Tukang's system prompt unless the caller already supplied one.
  const fullMessages: QwenMessage[] = messages.some((m) => m.role === "system")
    ? messages
    : [{ role: "system", content: TUKANG_SYSTEM_PROMPT }, ...messages];

  if (!config.qwen.apiKey) {
    return simulateChatCompletion(fullMessages);
  }

  try {
    const res = await qwenClient.post<DashScopeChatResponse>("/chat/completions", {
      model: options?.model ?? config.qwen.model,
      messages: fullMessages,
      temperature: options?.temperature ?? 0.7,
    });

    const choice = res.data.choices[0];
    const usage = res.data.usage;

    return {
      content: choice?.message?.content ?? "",
      model: res.data.model,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Qwen] chatCompletion error:", msg);
    return simulateChatCompletion(messages);
  }
}

// ─── Simulation (Dev Mode) ────────────────────────────────────────────────────

function simulateChatCompletion(messages: QwenMessage[]): QwenChatResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  console.log(`[Qwen SIM] Prompt: ${lastUser?.content ?? ""}`);

  return {
    content: "[Qwen Cloud not configured — set QWEN_API_KEY to enable real responses]",
    model: `${config.qwen.model}-sim`,
  };
}
