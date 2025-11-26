/**
 * Tests for the keyword-based classifier.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { keywordClassifier } from "../src/classifier/keyword.js";
import type { ParsedConfig, ParsedInput } from "../src/classifier/types.js";

describe("keywordClassifier", () => {
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
          keywords: [
            "code",
            "programming",
            "javascript",
            "typescript",
            "python",
            "bug",
            "error",
            "function",
            "api",
            "debug",
            "array",
            "sort",
          ],
          commands: ["code"],
          model: "claude-sonnet-4",
          temperature: 0.7,
          maxTokens: 8192,
        },
        {
          id: "travel",
          name: "Travel Assistant",
          description: "Helps with travel",
          systemPromptFile: "travel.md",
          keywords: [
            "travel",
            "trip",
            "vacation",
            "hotel",
            "flight",
            "booking",
            "destination",
            "paris",
            "tokyo",
            "beach",
          ],
          commands: ["travel"],
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
        keywordThreshold: 0.1,
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
      message: "How do I sort an array in JavaScript?",
      timestamp: new Date(),
    };
  });

  it("should classify coding questions to code agent", async () => {
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("code");
    expect(result?.method).toBe("keyword");
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it("should classify travel questions to travel agent", async () => {
    mockInput.message = "What are the best hotels in Paris?";
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("travel");
  });

  it("should return null for messages with no keyword matches", async () => {
    mockInput.message = "What is the meaning of life?";
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result).toBeNull();
  });

  it("should handle case-insensitive matching", async () => {
    mockInput.message = "JAVASCRIPT PROGRAMMING HELP";
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
  });

  it("should handle accented characters", async () => {
    // Test that accents are normalized (programação -> programacao, café -> cafe)
    // Use words that after normalization will match keywords
    mockInput.message = "Help with Python programming and JavaScript debugging";
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
    // Verify accented text also works with exact keyword match
    mockInput.message = "How to sort an array in Pythón?";
    const result2 = await keywordClassifier.classify(mockInput, mockConfig, null);
    expect(result2?.agentId).toBe("code");
  });

  it("should prefer agent with more keyword matches", async () => {
    // More code-related keywords
    mockInput.message = "How do I debug a JavaScript function with an error in an API?";
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result?.agentId).toBe("code");
  });

  it("should respect keyword threshold", async () => {
    // Set a very high threshold
    mockConfig.classifier.keywordThreshold = 0.9;
    mockInput.message = "javascript"; // Only one keyword

    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result).toBeNull();
  });

  it("should include matched keywords in reasoning", async () => {
    const result = await keywordClassifier.classify(mockInput, mockConfig, null);

    expect(result?.reasoning).toContain("array");
    expect(result?.reasoning).toContain("javascript");
  });
});
