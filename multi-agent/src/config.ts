/**
 * Configuration loader with validation.
 * Loads agents.json and validates the structure.
 */

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";
import type {
  AgentConfig,
  ParsedConfig,
  RootConfig,
} from "./classifier/types.js";

const logger = createLogger("config");

/**
 * Default configuration directory.
 */
const CONFIG_DIR = path.join(
  process.env["HOME"] ?? "~",
  ".warelay",
  "multi-agent"
);

/**
 * Validate that a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate that a value is a number within a range.
 */
function isNumberInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return typeof value === "number" && value >= min && value <= max;
}

/**
 * Validate that a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validate a single agent configuration.
 */
function validateAgentConfig(
  id: string,
  config: unknown
): Omit<AgentConfig, "id"> {
  if (typeof config !== "object" || config === null) {
    throw new Error(`Agent "${id}": configuration must be an object`);
  }

  const c = config as Record<string, unknown>;

  if (!isNonEmptyString(c["name"])) {
    throw new Error(`Agent "${id}": name must be a non-empty string`);
  }

  if (!isNonEmptyString(c["description"])) {
    throw new Error(`Agent "${id}": description must be a non-empty string`);
  }

  if (!isNonEmptyString(c["systemPromptFile"])) {
    throw new Error(`Agent "${id}": systemPromptFile must be a non-empty string`);
  }

  if (!isStringArray(c["keywords"])) {
    throw new Error(`Agent "${id}": keywords must be an array of strings`);
  }

  if (!isStringArray(c["commands"])) {
    throw new Error(`Agent "${id}": commands must be an array of strings`);
  }

  const validModels = ["claude-sonnet-4", "claude-haiku", "claude-opus-4"];
  if (!validModels.includes(c["model"] as string)) {
    throw new Error(
      `Agent "${id}": model must be one of ${validModels.join(", ")}`
    );
  }

  if (!isNumberInRange(c["temperature"], 0, 2)) {
    throw new Error(`Agent "${id}": temperature must be between 0 and 2`);
  }

  if (!isNumberInRange(c["maxTokens"], 1, 100000)) {
    throw new Error(`Agent "${id}": maxTokens must be between 1 and 100000`);
  }

  return {
    name: c["name"] as string,
    description: c["description"] as string,
    systemPromptFile: c["systemPromptFile"] as string,
    keywords: c["keywords"] as string[],
    commands: c["commands"] as string[],
    model: c["model"] as AgentConfig["model"],
    temperature: c["temperature"] as number,
    maxTokens: c["maxTokens"] as number,
    isDefault: c["isDefault"] === true,
  };
}

/**
 * Validate the classifier configuration.
 */
function validateClassifierConfig(
  config: unknown
): ParsedConfig["classifier"] {
  if (typeof config !== "object" || config === null) {
    throw new Error("classifier configuration must be an object");
  }

  const c = config as Record<string, unknown>;

  if (!isNumberInRange(c["keywordThreshold"], 0, 1)) {
    throw new Error("classifier.keywordThreshold must be between 0 and 1");
  }

  if (!isNumberInRange(c["aiThreshold"], 0, 1)) {
    throw new Error("classifier.aiThreshold must be between 0 and 1");
  }

  const validModels = ["claude-haiku", "claude-sonnet-4"];
  if (!validModels.includes(c["aiModel"] as string)) {
    throw new Error(
      `classifier.aiModel must be one of ${validModels.join(", ")}`
    );
  }

  if (typeof c["enableAI"] !== "boolean") {
    throw new Error("classifier.enableAI must be a boolean");
  }

  return {
    keywordThreshold: c["keywordThreshold"] as number,
    aiThreshold: c["aiThreshold"] as number,
    aiModel: c["aiModel"] as ParsedConfig["classifier"]["aiModel"],
    enableAI: c["enableAI"] as boolean,
  };
}

/**
 * Validate the session configuration.
 */
function validateSessionConfig(config: unknown): ParsedConfig["session"] {
  if (typeof config !== "object" || config === null) {
    throw new Error("session configuration must be an object");
  }

  const c = config as Record<string, unknown>;

  if (!isNumberInRange(c["idleTimeoutMinutes"], 1, 1440)) {
    throw new Error("session.idleTimeoutMinutes must be between 1 and 1440");
  }

  if (!isNumberInRange(c["maxSessionsPerSender"], 1, 100)) {
    throw new Error("session.maxSessionsPerSender must be between 1 and 100");
  }

  return {
    idleTimeoutMinutes: c["idleTimeoutMinutes"] as number,
    maxSessionsPerSender: c["maxSessionsPerSender"] as number,
  };
}

/**
 * Load and validate the configuration file.
 */
export function loadConfig(configPath?: string): ParsedConfig {
  const filePath = configPath ?? path.join(CONFIG_DIR, "config", "agents.json");

  logger.info("Loading configuration", { path: filePath });

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read config file: ${filePath}: ${err}`);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Failed to parse config file as JSON: ${err}`);
  }

  if (typeof rawConfig !== "object" || rawConfig === null) {
    throw new Error("Configuration must be an object");
  }

  const config = rawConfig as RootConfig;

  // Validate version
  if (!isNonEmptyString(config.version)) {
    throw new Error("version must be a non-empty string");
  }

  // Validate and parse agents
  if (typeof config.agents !== "object" || config.agents === null) {
    throw new Error("agents must be an object");
  }

  const agents: AgentConfig[] = [];
  let defaultAgent: AgentConfig | null = null;

  for (const [id, agentConfig] of Object.entries(config.agents)) {
    const validated = validateAgentConfig(id, agentConfig);
    const agent: AgentConfig = { id, ...validated };
    agents.push(agent);

    if (agent.isDefault) {
      if (defaultAgent !== null) {
        throw new Error(
          `Multiple default agents found: "${defaultAgent.id}" and "${id}"`
        );
      }
      defaultAgent = agent;
    }
  }

  if (agents.length === 0) {
    throw new Error("At least one agent must be configured");
  }

  // If no default agent specified, use the first one
  if (defaultAgent === null) {
    defaultAgent = agents[0]!;
    logger.warn("No default agent specified, using first agent", {
      agent: defaultAgent.id,
    });
  }

  // Validate classifier config
  const classifier = validateClassifierConfig(config.classifier);

  // Validate session config
  const session = validateSessionConfig(config.session);

  logger.info("Configuration loaded successfully", {
    agentCount: agents.length,
    defaultAgent: defaultAgent.id,
  });

  return {
    version: config.version,
    agents,
    classifier,
    session,
    defaultAgent,
  };
}

/**
 * Get the configuration directory path.
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
