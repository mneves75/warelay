/**
 * Classification pipeline orchestrator.
 * Runs classifiers in priority order and returns the best match.
 */

import { createLogger } from "../logger.js";
import { aiClassifier } from "./ai.js";
import { commandClassifier } from "./command.js";
import { keywordClassifier } from "./keyword.js";
import { sessionClassifier } from "./session.js";
import type {
  Classifier,
  ClassificationResult,
  ParsedConfig,
  ParsedInput,
  Session,
} from "./types.js";

const logger = createLogger("classifier");

/**
 * Classification pipeline in priority order.
 * Each classifier is tried in sequence until one returns a result.
 *
 * Order rationale:
 * 1. command - Explicit user intent, always wins
 * 2. session - Maintains conversation context, high priority
 * 3. keyword - Fast, free, good for obvious matches
 * 4. ai - Expensive but accurate, last resort before fallback
 */
const pipeline: readonly Classifier[] = [
  commandClassifier,
  sessionClassifier,
  keywordClassifier,
  aiClassifier,
];

/**
 * Run the classification pipeline on an input message.
 * Returns the classification result from the first classifier that matches,
 * or falls back to the default agent.
 */
export async function classify(
  input: ParsedInput,
  config: ParsedConfig,
  session: Session | null
): Promise<ClassificationResult> {
  const startTime = performance.now();

  logger.info("Starting classification", {
    sender: input.sender,
    messageLength: input.message.length,
    hasSession: session !== null,
  });

  // Try each classifier in order
  for (const classifier of pipeline) {
    logger.debug(`Trying classifier: ${classifier.name}`);

    try {
      const result = await classifier.classify(input, config, session);

      if (result !== null) {
        logger.info("Classification complete", {
          method: result.method,
          agentId: result.agentId,
          confidence: result.confidence.toFixed(3),
          totalTimeMs: performance.now() - startTime,
        });
        return result;
      }
    } catch (err) {
      logger.error(`Classifier ${classifier.name} threw an error`, {
        error: String(err),
      });
      // Continue to next classifier
    }
  }

  // No classifier matched - use fallback
  const endTime = performance.now();

  logger.info("Using fallback agent", {
    agentId: config.defaultAgent.id,
    totalTimeMs: endTime - startTime,
  });

  return {
    agentId: config.defaultAgent.id,
    confidence: 0.0,
    method: "fallback",
    reasoning: "No classifier matched, using default agent",
    originalMessage: input.message,
    classificationTimeMs: endTime - startTime,
  };
}

// Re-export types and utilities
export { stripCommand } from "./command.js";
export type {
  AgentConfig,
  ClassificationMethod,
  ClassificationResult,
  Classifier,
  ClassifierConfig,
  ParsedConfig,
  ParsedInput,
  Session,
  SessionConfig,
} from "./types.js";
