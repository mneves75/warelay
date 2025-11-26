#!/usr/bin/env node
/**
 * Multi-agent router for warelay WhatsApp automation.
 * Routes incoming messages to specialized AI agents based on content.
 *
 * Usage:
 *   warelay-router <sender> <message>
 *   echo '{"sender": "...", "message": "..."}' | warelay-router
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Configuration error
 *   3 - Classification error
 *   4 - Execution error
 */

import { loadConfig, getConfigDir } from "./config.js";
import { classify, type ClassificationResult } from "./classifier/index.js";
import { createLogger } from "./logger.js";
import { parseInput, parseStdinInput } from "./parser.js";
import { createSessionStore } from "./session.js";
import { executeAgent } from "./executor.js";
import type { ParsedConfig, ParsedInput } from "./classifier/types.js";
import path from "node:path";

const logger = createLogger("main");

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const startTime = performance.now();

  // Determine input source
  let input: ParsedInput;

  if (process.stdin.isTTY || process.argv.length > 2) {
    // Command line arguments
    try {
      input = parseInput(process.argv);
    } catch (err) {
      logger.error("Failed to parse command line arguments", {
        error: String(err),
      });
      console.error(`Error: ${err}`);
      console.error("Usage: warelay-router <sender> <message>");
      process.exit(1);
    }
  } else {
    // Stdin input
    try {
      input = await parseStdinInput();
    } catch (err) {
      logger.error("Failed to parse stdin input", { error: String(err) });
      console.error(`Error: ${err}`);
      process.exit(1);
    }
  }

  logger.info("Processing message", {
    sender: input.sender,
    messageLength: input.message.length,
    messagePreview: input.message.substring(0, 50),
  });

  // Load configuration
  let config: ParsedConfig;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error("Failed to load configuration", { error: String(err) });
    console.error(`Configuration error: ${err}`);
    process.exit(2);
  }

  // Initialize session store
  const sessionStore = createSessionStore(config.session);

  // Get existing session for sender (if any)
  const existingSession = sessionStore.getSession(input.sender);

  // Classify the message
  let classification: ClassificationResult;
  try {
    classification = await classify(input, config, existingSession);
  } catch (err) {
    logger.error("Classification failed", { error: String(err) });
    console.error(`Classification error: ${err}`);
    process.exit(3);
  }

  // Find the selected agent
  const agent = config.agents.find((a) => a.id === classification.agentId);
  if (!agent) {
    logger.error("Selected agent not found", {
      agentId: classification.agentId,
    });
    console.error(`Agent not found: ${classification.agentId}`);
    process.exit(3);
  }

  logger.info("Agent selected", {
    agentId: agent.id,
    agentName: agent.name,
    method: classification.method,
    confidence: classification.confidence.toFixed(3),
  });

  // Update session with selected agent
  sessionStore.upsertSession(input.sender, agent.id);

  // Execute the agent
  const promptsDir = path.join(getConfigDir(), "prompts");
  const result = await executeAgent(
    input.message,
    agent,
    classification,
    promptsDir
  );

  const totalTime = performance.now() - startTime;

  if (result.success) {
    logger.info("Request completed successfully", {
      agentId: agent.id,
      method: classification.method,
      executionTimeMs: result.executionTimeMs,
      totalTimeMs: totalTime,
    });

    // Output the response to stdout (for warelay to capture)
    console.log(result.output);
    process.exit(0);
  } else {
    logger.error("Agent execution failed", {
      agentId: agent.id,
      error: result.error,
      totalTimeMs: totalTime,
    });

    // Output error message for user
    console.log(
      `Sorry, I encountered an error while processing your request. Please try again.`
    );
    process.exit(4);
  }
}

// Run main
main().catch((err) => {
  logger.error("Unhandled error in main", { error: String(err) });
  console.error(`Fatal error: ${err}`);
  process.exit(1);
});
