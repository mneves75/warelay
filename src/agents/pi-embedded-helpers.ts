import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentMessage,
  AgentToolResult,
} from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
  normalizeThinkLevel,
  type ThinkLevel,
} from "../auto-reply/thinking.js";

import { sanitizeContentBlocksImages } from "./tool-images.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

export type EmbeddedContextFile = { path: string; content: string };

export async function ensureSessionHeader(params: {
  sessionFile: string;
  sessionId: string;
  cwd: string;
}) {
  const file = params.sessionFile;
  try {
    await fs.stat(file);
    return;
  } catch {
    // create
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const sessionVersion = 2;
  const entry = {
    type: "session",
    version: sessionVersion,
    id: params.sessionId,
    timestamp: new Date().toISOString(),
    cwd: params.cwd,
  };
  await fs.writeFile(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

type ContentBlock = AgentToolResult<unknown>["content"][number];

export async function sanitizeSessionMessagesImages(
  messages: AgentMessage[],
  label: string,
): Promise<AgentMessage[]> {
  // We sanitize historical session messages because Anthropic can reject a request
  // if the transcript contains oversized base64 images (see MAX_IMAGE_DIMENSION_PX).
  const out: AgentMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    const role = (msg as { role?: unknown }).role;
    if (role === "toolResult") {
      const toolMsg = msg as Extract<AgentMessage, { role: "toolResult" }>;
      const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
      const nextContent = (await sanitizeContentBlocksImages(
        content as ContentBlock[],
        label,
      )) as unknown as typeof toolMsg.content;
      out.push({ ...toolMsg, content: nextContent });
      continue;
    }

    if (role === "user") {
      const userMsg = msg as Extract<AgentMessage, { role: "user" }>;
      const content = userMsg.content;
      if (Array.isArray(content)) {
        const nextContent = (await sanitizeContentBlocksImages(
          content as unknown as ContentBlock[],
          label,
        )) as unknown as typeof userMsg.content;
        out.push({ ...userMsg, content: nextContent });
        continue;
      }
    }

    out.push(msg);
  }
  return out;
}

export function buildBootstrapContextFiles(
  files: WorkspaceBootstrapFile[],
): EmbeddedContextFile[] {
  return files.map((file) => ({
    path: file.name,
    content: file.missing
      ? `[MISSING] Expected at: ${file.path}`
      : (file.content ?? ""),
  }));
}

export function formatAssistantErrorText(
  msg: AssistantMessage,
): string | undefined {
  if (msg.stopReason !== "error") return undefined;
  const raw = (msg.errorMessage ?? "").trim();
  if (!raw) return "LLM request failed with an unknown error.";

  const invalidRequest = raw.match(
    /"type":"invalid_request_error".*?"message":"([^"]+)"/,
  );
  if (invalidRequest?.[1]) {
    return `LLM request rejected: ${invalidRequest[1]}`;
  }

  // Keep it short for WhatsApp.
  return raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
}

export function isRateLimitAssistantError(
  msg: AssistantMessage | undefined,
): boolean {
  if (!msg || msg.stopReason !== "error") return false;
  const raw = (msg.errorMessage ?? "").toLowerCase();
  if (!raw) return false;
  return isRateLimitErrorMessage(raw);
}

export function isRateLimitErrorMessage(raw: string): boolean {
  const value = raw.toLowerCase();
  return (
    /rate[_ ]limit|too many requests|429/.test(value) ||
    value.includes("exceeded your current quota")
  );
}

export function isAuthErrorMessage(raw: string): boolean {
  const value = raw.toLowerCase();
  if (!value) return false;
  return (
    /invalid[_ ]?api[_ ]?key/.test(value) ||
    value.includes("incorrect api key") ||
    value.includes("invalid token") ||
    value.includes("authentication") ||
    value.includes("unauthorized") ||
    value.includes("forbidden") ||
    value.includes("access denied") ||
    /\b401\b/.test(value) ||
    /\b403\b/.test(value)
  );
}

export function isAuthAssistantError(
  msg: AssistantMessage | undefined,
): boolean {
  if (!msg || msg.stopReason !== "error") return false;
  return isAuthErrorMessage(msg.errorMessage ?? "");
}

function extractSupportedValues(raw: string): string[] {
  const match =
    raw.match(/supported values are:\s*([^\n.]+)/i) ??
    raw.match(/supported values:\s*([^\n.]+)/i);
  if (!match?.[1]) return [];
  const fragment = match[1];
  const quoted = Array.from(fragment.matchAll(/['"]([^'"]+)['"]/g)).map(
    (entry) => entry[1]?.trim(),
  );
  if (quoted.length > 0) {
    return quoted.filter((entry): entry is string => Boolean(entry));
  }
  return fragment
    .split(/,|\band\b/gi)
    .map((entry) => entry.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").trim())
    .filter(Boolean);
}

export function pickFallbackThinkingLevel(params: {
  message?: string;
  attempted: Set<ThinkLevel>;
}): ThinkLevel | undefined {
  const raw = params.message?.trim();
  if (!raw) return undefined;
  const supported = extractSupportedValues(raw);
  if (supported.length === 0) return undefined;
  for (const entry of supported) {
    const normalized = normalizeThinkLevel(entry);
    if (!normalized) continue;
    if (params.attempted.has(normalized)) continue;
    return normalized;
  }
  return undefined;
}

// ── Messaging tool duplicate detection ──────────────────────────────────────
// When the agent uses a messaging tool (telegram, discord, slack, sessions_send)
// to send a message, we track the text so we can suppress duplicate block replies.
// The LLM sometimes elaborates or wraps the same content, so we use substring matching.

const MIN_DUPLICATE_TEXT_LENGTH = 10;

/**
 * Normalize text for duplicate comparison.
 * - Trims whitespace
 * - Lowercases
 * - Strips emoji (Emoji_Presentation and Extended_Pictographic)
 * - Collapses multiple spaces to single space
 */
export function normalizeTextForComparison(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a text is a duplicate of any previously sent messaging tool text.
 * Uses substring matching to handle LLM elaboration (e.g., wrapping in quotes,
 * adding context, or slight rephrasing that includes the original).
 */
export function isMessagingToolDuplicate(
  text: string,
  sentTexts: string[],
): boolean {
  if (sentTexts.length === 0) return false;
  const normalized = normalizeTextForComparison(text);
  if (!normalized || normalized.length < MIN_DUPLICATE_TEXT_LENGTH)
    return false;
  return sentTexts.some((sent) => {
    const normalizedSent = normalizeTextForComparison(sent);
    if (!normalizedSent || normalizedSent.length < MIN_DUPLICATE_TEXT_LENGTH)
      return false;
    // Substring match: either text contains the other
    return (
      normalized.includes(normalizedSent) || normalizedSent.includes(normalized)
    );
  });
}
