/**
 * Session-based classifier.
 * Routes messages to the agent from an existing conversation session.
 * This maintains context continuity for ongoing conversations.
 */

import { createLogger } from "../logger.js";
import type {
  Classifier,
  ClassificationResult,
  ParsedConfig,
  ParsedInput,
  Session,
} from "./types.js";

const logger = createLogger("session-classifier");

/**
 * Session-based classifier implementation.
 * Routes to the agent associated with an active session.
 */
export const sessionClassifier: Classifier = {
  name: "session",

  async classify(
    input: ParsedInput,
    config: ParsedConfig,
    session: Session | null
  ): Promise<ClassificationResult | null> {
    const startTime = performance.now();

    // No session means we can't use session-based routing
    if (session === null) {
      logger.debug("No active session for sender", { sender: input.sender });
      return null;
    }

    // Verify the agent still exists in config
    const agent = config.agents.find((a) => a.id === session.agentId);
    if (!agent) {
      logger.warn("Session references non-existent agent", {
        sessionId: session.id,
        agentId: session.agentId,
      });
      return null;
    }

    const endTime = performance.now();

    // Calculate session age for confidence adjustment
    const sessionAge =
      new Date().getTime() - new Date(session.lastActivityAt).getTime();
    const sessionAgeMinutes = sessionAge / (1000 * 60);

    // Reduce confidence as session ages (max 30 minutes for full confidence)
    // After 30 minutes, confidence drops linearly
    const maxFullConfidenceMinutes = 30;
    const ageRatio = Math.min(sessionAgeMinutes / maxFullConfidenceMinutes, 2);
    const confidence = Math.max(0.6, 0.95 - ageRatio * 0.15);

    logger.info("Session match found", {
      sessionId: session.id,
      agentId: session.agentId,
      messageCount: session.messageCount,
      sessionAgeMinutes: sessionAgeMinutes.toFixed(1),
      confidence: confidence.toFixed(3),
      timeMs: endTime - startTime,
    });

    return {
      agentId: session.agentId,
      confidence,
      method: "session",
      reasoning: `Continuing session ${session.id} (${session.messageCount} messages, ${sessionAgeMinutes.toFixed(0)}min old)`,
      originalMessage: input.message,
      classificationTimeMs: endTime - startTime,
    };
  },
};
