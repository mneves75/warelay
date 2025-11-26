/**
 * Agent executor for the multi-agent router.
 * Invokes Claude CLI with the appropriate agent configuration.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";
import { stripCommand } from "./classifier/index.js";
import type { AgentConfig, ClassificationResult } from "./classifier/types.js";

const logger = createLogger("executor");

/**
 * Default prompts directory.
 */
const PROMPTS_DIR = path.join(
  process.env["HOME"] ?? "~",
  ".warelay",
  "multi-agent",
  "prompts"
);

/**
 * Result of executing an agent.
 */
export interface ExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
  readonly agentId: string;
  readonly executionTimeMs: number;
}

/**
 * Load the system prompt for an agent.
 */
function loadSystemPrompt(agent: AgentConfig, promptsDir: string): string {
  const promptPath = path.join(promptsDir, agent.systemPromptFile);

  try {
    return fs.readFileSync(promptPath, "utf-8").trim();
  } catch (err) {
    logger.error("Failed to load system prompt", {
      agentId: agent.id,
      path: promptPath,
      error: String(err),
    });
    throw new Error(`Failed to load system prompt for agent ${agent.id}: ${err}`);
  }
}

/**
 * Map agent model to Claude CLI model flag.
 */
function getModelFlag(model: AgentConfig["model"]): string {
  const modelMap: Record<string, string> = {
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    "claude-haiku": "claude-3-5-haiku-latest",
    "claude-opus-4": "claude-opus-4-20250514",
  };
  return modelMap[model] ?? "claude-sonnet-4-20250514";
}

/**
 * Execute an agent using Claude CLI.
 */
export async function executeAgent(
  message: string,
  agent: AgentConfig,
  classification: ClassificationResult,
  promptsDir: string = PROMPTS_DIR,
  timeoutSeconds: number = 120
): Promise<ExecutionResult> {
  const startTime = performance.now();

  // Strip command prefix if present
  const cleanMessage =
    classification.method === "command" ? stripCommand(message) : message;

  // Load system prompt
  let systemPrompt: string;
  try {
    systemPrompt = loadSystemPrompt(agent, promptsDir);
  } catch (err) {
    return {
      success: false,
      output: "",
      error: String(err),
      agentId: agent.id,
      executionTimeMs: performance.now() - startTime,
    };
  }

  logger.info("Executing agent", {
    agentId: agent.id,
    model: agent.model,
    messageLength: cleanMessage.length,
    method: classification.method,
  });

  // Build Claude CLI command
  // Note: Claude CLI doesn't support --max-tokens, max tokens is model-dependent
  const args = [
    "--print", // Print response only
    "--dangerously-skip-permissions", // Required for non-interactive
    "--model",
    getModelFlag(agent.model),
    "--system-prompt",
    systemPrompt,
    cleanMessage,
  ];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("claude", args, {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Set timeout
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      logger.error("Agent execution timed out", {
        agentId: agent.id,
        timeoutSeconds,
      });
    }, timeoutSeconds * 1000);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const endTime = performance.now();
      const executionTimeMs = endTime - startTime;

      if (code === 0) {
        logger.info("Agent execution successful", {
          agentId: agent.id,
          outputLength: stdout.length,
          executionTimeMs,
        });

        resolve({
          success: true,
          output: stdout.trim(),
          agentId: agent.id,
          executionTimeMs,
        });
      } else {
        logger.error("Agent execution failed", {
          agentId: agent.id,
          exitCode: code,
          stderr: stderr.substring(0, 500),
          executionTimeMs,
        });

        resolve({
          success: false,
          output: stdout.trim(),
          error: stderr.trim() || `Exit code: ${code}`,
          agentId: agent.id,
          executionTimeMs,
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      const endTime = performance.now();

      logger.error("Failed to spawn Claude CLI", {
        agentId: agent.id,
        error: String(err),
      });

      resolve({
        success: false,
        output: "",
        error: `Failed to spawn Claude CLI: ${err}`,
        agentId: agent.id,
        executionTimeMs: endTime - startTime,
      });
    });
  });
}
