/**
 * Tests for the configuration loader.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
    configPath = path.join(testDir, "agents.json");
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const validConfig = {
    version: "1.0.0",
    agents: {
      code: {
        name: "Code Assistant",
        description: "Helps with coding tasks",
        systemPromptFile: "code.md",
        keywords: ["code", "programming"],
        commands: ["code", "dev"],
        model: "claude-sonnet-4",
        temperature: 0.7,
        maxTokens: 8192,
        isDefault: true,
      },
      travel: {
        name: "Travel Assistant",
        description: "Helps with travel planning",
        systemPromptFile: "travel.md",
        keywords: ["travel", "trip"],
        commands: ["travel"],
        model: "claude-haiku",
        temperature: 0.8,
        maxTokens: 4096,
      },
    },
    classifier: {
      keywordThreshold: 0.3,
      aiThreshold: 0.6,
      aiModel: "claude-haiku",
      enableAI: true,
    },
    session: {
      idleTimeoutMinutes: 30,
      maxSessionsPerSender: 3,
    },
  };

  it("should load valid configuration", () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));

    const config = loadConfig(configPath);

    expect(config.version).toBe("1.0.0");
    expect(config.agents).toHaveLength(2);
    expect(config.defaultAgent.id).toBe("code");
  });

  it("should parse agents with IDs from keys", () => {
    fs.writeFileSync(configPath, JSON.stringify(validConfig));

    const config = loadConfig(configPath);
    const codeAgent = config.agents.find((a) => a.id === "code");

    expect(codeAgent).toBeDefined();
    expect(codeAgent?.name).toBe("Code Assistant");
  });

  it("should throw error for missing file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow(
      "Failed to read config file"
    );
  });

  it("should throw error for invalid JSON", () => {
    fs.writeFileSync(configPath, "not valid json {");

    expect(() => loadConfig(configPath)).toThrow("Failed to parse config file");
  });

  it("should throw error for missing version", () => {
    const invalidConfig = { ...validConfig, version: "" };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      "version must be a non-empty string"
    );
  });

  it("should throw error for missing agent name", () => {
    const invalidConfig = {
      ...validConfig,
      agents: {
        code: { ...validConfig.agents.code, name: "" },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      'Agent "code": name must be a non-empty string'
    );
  });

  it("should throw error for invalid model", () => {
    const invalidConfig = {
      ...validConfig,
      agents: {
        code: { ...validConfig.agents.code, model: "invalid-model" },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      'Agent "code": model must be one of'
    );
  });

  it("should throw error for invalid temperature", () => {
    const invalidConfig = {
      ...validConfig,
      agents: {
        code: { ...validConfig.agents.code, temperature: 3 },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      'Agent "code": temperature must be between 0 and 2'
    );
  });

  it("should throw error for multiple default agents", () => {
    const invalidConfig = {
      ...validConfig,
      agents: {
        code: { ...validConfig.agents.code, isDefault: true },
        travel: { ...validConfig.agents.travel, isDefault: true },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow("Multiple default agents found");
  });

  it("should throw error for no agents", () => {
    const invalidConfig = { ...validConfig, agents: {} };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      "At least one agent must be configured"
    );
  });

  it("should use first agent as default if none specified", () => {
    const configNoDefault = {
      ...validConfig,
      agents: {
        code: { ...validConfig.agents.code, isDefault: undefined },
        travel: { ...validConfig.agents.travel },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configNoDefault));

    const config = loadConfig(configPath);

    // First agent should be default
    expect(config.defaultAgent).toBeDefined();
  });

  it("should validate classifier configuration", () => {
    const invalidConfig = {
      ...validConfig,
      classifier: {
        ...validConfig.classifier,
        keywordThreshold: 2, // Invalid: should be 0-1
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      "classifier.keywordThreshold must be between 0 and 1"
    );
  });

  it("should validate session configuration", () => {
    const invalidConfig = {
      ...validConfig,
      session: {
        ...validConfig.session,
        idleTimeoutMinutes: 0, // Invalid: should be 1-1440
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

    expect(() => loadConfig(configPath)).toThrow(
      "session.idleTimeoutMinutes must be between 1 and 1440"
    );
  });
});
