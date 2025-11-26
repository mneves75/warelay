/**
 * Command-based classifier.
 * Detects explicit /command patterns at the start of messages.
 * This is the highest priority classifier with perfect confidence.
 */

import { createLogger } from "../logger.js";
import type {
  Classifier,
  ClassificationResult,
  ParsedConfig,
  ParsedInput,
  Session,
} from "./types.js";

const logger = createLogger("command-classifier");

/**
 * Extract command from message if present.
 * Commands must be at the start of the message and prefixed with '/'.
 * Returns the command name (without '/') or null if no command found.
 */
function extractCommand(message: string): string | null {
  const trimmed = message.trim();
  const match = trimmed.match(/^\/([a-zA-Z][a-zA-Z0-9_-]*)/);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Find agent by command.
 * Returns the agent config or null if no agent handles this command.
 */
function findAgentByCommand(
  command: string,
  config: ParsedConfig
): { agentId: string } | null {
  for (const agent of config.agents) {
    if (agent.commands.includes(command)) {
      return { agentId: agent.id };
    }
  }
  return null;
}

/**
 * Command-based classifier implementation.
 * Detects /command patterns and routes to the appropriate agent.
 */
export const commandClassifier: Classifier = {
  name: "command",

  async classify(
    input: ParsedInput,
    config: ParsedConfig,
    _session: Session | null
  ): Promise<ClassificationResult | null> {
    const startTime = performance.now();

    const command = extractCommand(input.message);

    if (command === null) {
      logger.debug("No command found in message", {
        messageStart: input.message.substring(0, 50),
      });
      return null;
    }

    logger.debug("Command extracted", { command });

    const agent = findAgentByCommand(command, config);

    if (agent === null) {
      logger.warn("Unknown command", { command });
      // Return null to let other classifiers try
      // The message might still be relevant without the command
      return null;
    }

    const endTime = performance.now();

    logger.info("Command matched", {
      command,
      agentId: agent.agentId,
      timeMs: endTime - startTime,
    });

    return {
      agentId: agent.agentId,
      confidence: 1.0, // Commands have perfect confidence
      method: "command",
      reasoning: `Explicit /${command} command detected`,
      originalMessage: input.message,
      classificationTimeMs: endTime - startTime,
    };
  },
};

/**
 * Strip the command from a message, returning the rest.
 * Useful for passing the actual query to the agent.
 */
export function stripCommand(message: string): string {
  return message.replace(/^\/[a-zA-Z][a-zA-Z0-9_-]*\s*/, "").trim();
}
