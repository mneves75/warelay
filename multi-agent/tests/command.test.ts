/**
 * Tests for the command-based classifier.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { commandClassifier, stripCommand } from "../src/classifier/command.js";
import type { ParsedConfig, ParsedInput } from "../src/classifier/types.js";

describe("commandClassifier", () => {
  let mockConfig: ParsedConfig;
  let mockInput: ParsedInput;

  beforeEach(() => {
    mockConfig = {
      version: "1.0.0",
      agents: [
        {
          id: "code",
          name: "Code Assistant",
          description: "Helps with coding",
          systemPromptFile: "code.md",
          keywords: ["code", "programming"],
          commands: ["code", "dev", "debug"],
          model: "claude-sonnet-4",
          temperature: 0.7,
          maxTokens: 8192,
        },
        {
          id: "travel",
          name: "Travel Assistant",
          description: "Helps with travel",
          systemPromptFile: "travel.md",
          keywords: ["travel", "trip"],
          commands: ["travel", "trip", "vacation"],
          model: "claude-haiku",
          temperature: 0.8,
          maxTokens: 4096,
        },
        {
          id: "general",
          name: "General Assistant",
          description: "General help",
          systemPromptFile: "general.md",
          keywords: [],
          commands: [],
          model: "claude-sonnet-4",
          temperature: 0.7,
          maxTokens: 4096,
          isDefault: true,
        },
      ],
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
      defaultAgent: {
        id: "general",
        name: "General Assistant",
        description: "General help",
        systemPromptFile: "general.md",
        keywords: [],
        commands: [],
        model: "claude-sonnet-4",
        temperature: 0.7,
        maxTokens: 4096,
        isDefault: true,
      },
    };

    mockInput = {
      sender: "+5561983297558",
      message: "/code How do I sort an array in JavaScript?",
      timestamp: new Date(),
    };
  });

  it("should classify messages with /code command to code agent", async () => {
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("code");
    expect(result?.confidence).toBe(1.0);
    expect(result?.method).toBe("command");
  });

  it("should classify messages with /travel command to travel agent", async () => {
    mockInput.message = "/travel Best hotels in Paris";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("travel");
    expect(result?.confidence).toBe(1.0);
  });

  it("should return null for messages without commands", async () => {
    mockInput.message = "How do I sort an array in JavaScript?";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result).toBeNull();
  });

  it("should return null for unknown commands", async () => {
    mockInput.message = "/unknown Some message";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result).toBeNull();
  });

  it("should handle commands at the start only", async () => {
    mockInput.message = "Please /code help me";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result).toBeNull();
  });

  it("should be case-insensitive for commands", async () => {
    mockInput.message = "/CODE How do I sort an array?";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
  });

  it("should handle commands with no following text", async () => {
    mockInput.message = "/code";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
  });

  it("should handle commands with leading whitespace", async () => {
    mockInput.message = "  /code How do I sort?";
    const result = await commandClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
  });
});

describe("stripCommand", () => {
  it("should strip command from message", () => {
    expect(stripCommand("/code How do I sort?")).toBe("How do I sort?");
  });

  it("should handle command with no following text", () => {
    expect(stripCommand("/code")).toBe("");
  });

  it("should handle command with extra whitespace", () => {
    expect(stripCommand("/code   How do I sort?")).toBe("How do I sort?");
  });

  it("should return original message if no command", () => {
    expect(stripCommand("How do I sort?")).toBe("How do I sort?");
  });
});
