import { Type } from "@sinclair/typebox";

export const TelegramToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("react"),
    chatId: Type.Union([Type.String(), Type.Number()]),
    messageId: Type.Union([Type.String(), Type.Number()]),
    emoji: Type.String(),
    remove: Type.Optional(Type.Boolean()),
  }),
  Type.Object({
    action: Type.Literal("sendMessage"),
    to: Type.String({ description: "Chat ID, @username, or t.me/username" }),
    content: Type.String({ description: "Message text to send" }),
    mediaUrl: Type.Optional(
      Type.String({ description: "URL of image/video/audio to attach" }),
    ),
    replyToMessageId: Type.Optional(
      Type.Union([Type.String(), Type.Number()], {
        description: "Message ID to reply to (for threading)",
      }),
    ),
    messageThreadId: Type.Optional(
      Type.Union([Type.String(), Type.Number()], {
        description: "Forum topic thread ID (for forum supergroups)",
      }),
    ),
  }),
]);
