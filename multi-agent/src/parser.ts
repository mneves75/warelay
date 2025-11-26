/**
 * Input parser for the multi-agent router.
 * Parses command line arguments into structured input.
 */

import type { ParsedInput } from "./classifier/types.js";

/**
 * Parse command line arguments into structured input.
 * Expected format: router <sender> <message>
 */
export function parseInput(args: string[]): ParsedInput {
  // Skip node and script path
  const [, , sender, ...messageParts] = args;

  if (!sender || sender.trim().length === 0) {
    throw new Error("Missing required argument: sender");
  }

  const message = messageParts.join(" ");
  if (message.trim().length === 0) {
    throw new Error("Missing required argument: message");
  }

  return {
    message: message.trim(),
    sender: sender.trim(),
    timestamp: new Date(),
  };
}

/**
 * Parse input from stdin (for piped input).
 * Format: JSON with sender and message fields.
 */
export async function parseStdinInput(): Promise<ParsedInput> {
  return new Promise((resolve, reject) => {
    let data = "";

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(data) as unknown;

        if (typeof parsed !== "object" || parsed === null) {
          reject(new Error("Invalid JSON input: expected object"));
          return;
        }

        const obj = parsed as Record<string, unknown>;

        if (typeof obj["sender"] !== "string" || obj["sender"].trim().length === 0) {
          reject(new Error("Invalid input: sender must be a non-empty string"));
          return;
        }

        if (typeof obj["message"] !== "string" || obj["message"].trim().length === 0) {
          reject(new Error("Invalid input: message must be a non-empty string"));
          return;
        }

        resolve({
          sender: obj["sender"].trim(),
          message: obj["message"].trim(),
          timestamp: new Date(),
        });
      } catch (err) {
        reject(new Error(`Failed to parse JSON input: ${err}`));
      }
    });

    process.stdin.on("error", (err) => {
      reject(new Error(`Failed to read stdin: ${err}`));
    });
  });
}
