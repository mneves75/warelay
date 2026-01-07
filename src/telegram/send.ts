import type { ReactionType, ReactionTypeEmoji } from "@grammyjs/types";
import { Bot, InputFile } from "grammy";
import { formatErrorMessage } from "../infra/errors.js";
import { mediaKindFromMime } from "../media/constants.js";
import { isGifMedia } from "../media/mime.js";
import { loadWebMedia } from "../web/media.js";

type TelegramSendOpts = {
  token?: string;
  verbose?: boolean;
  mediaUrl?: string;
  maxBytes?: number;
  api?: Bot["api"];
  /** Message ID to reply to (for threading) */
  replyToMessageId?: number;
  /** Forum topic thread ID (for forum supergroups) */
  messageThreadId?: number;
};

type TelegramSendResult = {
  messageId: string;
  chatId: string;
};

type TelegramReactionOpts = {
  token?: string;
  api?: Bot["api"];
  remove?: boolean;
};

const PARSE_ERR_RE =
  /can't parse entities|parse entities|find end of the entity/i;

function resolveToken(explicit?: string): string {
  const token = explicit ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required for Telegram sends (Bot API)",
    );
  }
  return token.trim();
}

function normalizeChatId(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) throw new Error("Recipient is required for Telegram sends");

  // Common internal prefixes that sometimes leak into outbound sends.
  // - ctx.To uses `telegram:<id>`
  // - group sessions often use `telegram:group:<id>`
  let normalized = trimmed.replace(/^(telegram|tg|group):/i, "").trim();

  // Accept t.me links for public chats/channels.
  // (Invite links like `t.me/+...` are not resolvable via Bot API.)
  const m =
    /^https?:\/\/t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized) ??
    /^t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized);
  if (m?.[1]) normalized = `@${m[1]}`;

  if (!normalized) throw new Error("Recipient is required for Telegram sends");
  if (normalized.startsWith("@")) return normalized;
  if (/^-?\d+$/.test(normalized)) return normalized;

  // If the user passed a username without `@`, assume they meant a public chat/channel.
  if (/^[A-Za-z0-9_]{5,}$/i.test(normalized)) return `@${normalized}`;

  return normalized;
}

function normalizeMessageId(raw: string | number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      throw new Error("Message id is required for Telegram reactions");
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("Message id is required for Telegram reactions");
}

export async function sendMessageTelegram(
  to: string,
  text: string,
  opts: TelegramSendOpts = {},
): Promise<TelegramSendResult> {
  const token = resolveToken(opts.token);
  const chatId = normalizeChatId(to);
  // Use provided api or create a new Bot instance. The nullish coalescing
  // operator ensures api is always defined (Bot.api is always non-null).
  const api = opts.api ?? new Bot(token).api;
  const mediaUrl = opts.mediaUrl?.trim();

  // Build optional params for forum topics and reply threading.
  // Only include these if actually provided to keep API calls clean.
  const threadParams: Record<string, number> = {};
  if (opts.messageThreadId != null) {
    threadParams.message_thread_id = opts.messageThreadId;
  }
  if (opts.replyToMessageId != null) {
    threadParams.reply_to_message_id = opts.replyToMessageId;
  }
  const hasThreadParams = Object.keys(threadParams).length > 0;

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const sendWithRetry = async <T>(fn: () => Promise<T>, label: string) => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const errText = formatErrorMessage(err);
        const terminal =
          attempt === 3 ||
          !/429|timeout|connect|reset|closed|unavailable|temporarily/i.test(
            errText,
          );
        if (terminal) break;
        const backoff = 400 * attempt;
        if (opts.verbose) {
          console.warn(
            `telegram send retry ${attempt}/2 for ${label} in ${backoff}ms: ${errText}`,
          );
        }
        await sleep(backoff);
      }
    }
    throw lastErr ?? new Error(`Telegram send failed (${label})`);
  };

  const wrapChatNotFound = (err: unknown) => {
    if (!/400: Bad Request: chat not found/i.test(formatErrorMessage(err)))
      return err;
    return new Error(
      [
        `Telegram send failed: chat not found (chat_id=${chatId}).`,
        "Likely: bot not started in DM, bot removed from group/channel, group migrated (new -100… id), or wrong bot token.",
        `Input was: ${JSON.stringify(to)}.`,
      ].join(" "),
    );
  };

  if (mediaUrl) {
    const media = await loadWebMedia(mediaUrl, opts.maxBytes);
    const kind = mediaKindFromMime(media.contentType ?? undefined);
    const isGif = isGifMedia({
      contentType: media.contentType,
      fileName: media.fileName,
    });
    const fileName =
      media.fileName ??
      (isGif ? "animation.gif" : inferFilename(kind)) ??
      "file";
    const file = new InputFile(media.buffer, fileName);
    const caption = text?.trim() || undefined;
    const mediaParams = hasThreadParams
      ? { caption, ...threadParams }
      : { caption };
    let result:
      | Awaited<ReturnType<typeof api.sendPhoto>>
      | Awaited<ReturnType<typeof api.sendVideo>>
      | Awaited<ReturnType<typeof api.sendAudio>>
      | Awaited<ReturnType<typeof api.sendAnimation>>
      | Awaited<ReturnType<typeof api.sendDocument>>;
    if (isGif) {
      result = await sendWithRetry(
        () => api.sendAnimation(chatId, file, mediaParams),
        "animation",
      ).catch((err) => {
        throw wrapChatNotFound(err);
      });
    } else if (kind === "image") {
      result = await sendWithRetry(
        () => api.sendPhoto(chatId, file, mediaParams),
        "photo",
      ).catch((err) => {
        throw wrapChatNotFound(err);
      });
    } else if (kind === "video") {
      result = await sendWithRetry(
        () => api.sendVideo(chatId, file, mediaParams),
        "video",
      ).catch((err) => {
        throw wrapChatNotFound(err);
      });
    } else if (kind === "audio") {
      result = await sendWithRetry(
        () => api.sendAudio(chatId, file, mediaParams),
        "audio",
      ).catch((err) => {
        throw wrapChatNotFound(err);
      });
    } else {
      result = await sendWithRetry(
        () => api.sendDocument(chatId, file, mediaParams),
        "document",
      ).catch((err) => {
        throw wrapChatNotFound(err);
      });
    }
    const messageId = String(result?.message_id ?? "unknown");
    return { messageId, chatId: String(result?.chat?.id ?? chatId) };
  }

  if (!text || !text.trim()) {
    throw new Error("Message must be non-empty for Telegram sends");
  }
  const textParams = hasThreadParams
    ? { parse_mode: "Markdown" as const, ...threadParams }
    : { parse_mode: "Markdown" as const };
  const res = await sendWithRetry(
    () => api.sendMessage(chatId, text, textParams),
    "message",
  ).catch(async (err) => {
    // Telegram rejects malformed Markdown (e.g., unbalanced '_' or '*').
    // When that happens, fall back to plain text so the message still delivers.
    const errText = formatErrorMessage(err);
    if (PARSE_ERR_RE.test(errText)) {
      if (opts.verbose) {
        console.warn(
          `telegram markdown parse failed, retrying as plain text: ${errText}`,
        );
      }
      // For plain text fallback, only include thread params if present
      return await sendWithRetry(
        () =>
          hasThreadParams
            ? api.sendMessage(chatId, text, threadParams)
            : api.sendMessage(chatId, text),
        "message-plain",
      ).catch((err2) => {
        throw wrapChatNotFound(err2);
      });
    }
    throw wrapChatNotFound(err);
  });
  const messageId = String(res?.message_id ?? "unknown");
  return { messageId, chatId: String(res?.chat?.id ?? chatId) };
}

export async function reactMessageTelegram(
  chatIdInput: string | number,
  messageIdInput: string | number,
  emoji: string,
  opts: TelegramReactionOpts = {},
): Promise<{ ok: true }> {
  const token = resolveToken(opts.token);
  const chatId = normalizeChatId(String(chatIdInput));
  const messageId = normalizeMessageId(messageIdInput);
  // Use provided api or create a new Bot instance.
  const api = opts.api ?? new Bot(token).api;
  const remove = opts.remove === true;
  const trimmedEmoji = emoji.trim();
  // Build the reaction array. We cast emoji to the grammY union type since
  // Telegram validates emoji server-side; invalid emojis fail gracefully.
  const reactions: ReactionType[] =
    remove || !trimmedEmoji
      ? []
      : [{ type: "emoji", emoji: trimmedEmoji as ReactionTypeEmoji["emoji"] }];
  if (typeof api.setMessageReaction !== "function") {
    throw new Error("Telegram reactions are unavailable in this bot API.");
  }
  await api.setMessageReaction(chatId, messageId, reactions);
  return { ok: true };
}

function inferFilename(kind: ReturnType<typeof mediaKindFromMime>) {
  switch (kind) {
    case "image":
      return "image.jpg";
    case "video":
      return "video.mp4";
    case "audio":
      return "audio.ogg";
    default:
      return "file.bin";
  }
}
