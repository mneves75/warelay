/**
 * AI-based classifier using Anthropic API.
 * Uses Claude to classify messages when keyword matching is insufficient.
 * This is the most expensive but most accurate classifier.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../logger.js";
import type {
  AgentConfig,
  Classifier,
  ClassificationResult,
  ParsedConfig,
  ParsedInput,
  Session,
} from "./types.js";

const logger = createLogger("ai-classifier");

/**
 * Build the classification prompt for Claude.
 */
function buildClassificationPrompt(
  message: string,
  agents: readonly AgentConfig[]
): string {
  const agentDescriptions = agents
    .map(
      (agent) =>
        `- ${agent.id}: ${agent.name}\n  Description: ${agent.description}\n  Keywords: ${agent.keywords.join(", ")}`
    )
    .join("\n\n");

  return `You are a message classifier. Your task is to determine which agent should handle the following message.

Available agents:
${agentDescriptions}

Message to classify:
"${message}"

Respond with a JSON object containing:
- "agentId": the ID of the most appropriate agent
- "confidence": a number from 0.0 to 1.0 indicating how confident you are
- "reasoning": a brief explanation of why you chose this agent

IMPORTANT:
- Only respond with the JSON object, no other text
- The agentId must exactly match one of the agent IDs listed above
- Be conservative with confidence scores:
  - 0.9-1.0: Message clearly matches the agent's domain
  - 0.7-0.9: Message likely belongs to this agent
  - 0.5-0.7: Message might belong to this agent but is ambiguous
  - Below 0.5: Very uncertain, probably should use default agent`;
}

/**
 * Parse the AI response into a structured result.
 */
function parseAIResponse(
  response: string,
  validAgentIds: Set<string>
): { agentId: string; confidence: number; reasoning: string } | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("No JSON found in AI response", { response });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      logger.warn("Parsed response is not an object", { parsed });
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    const agentId = obj["agentId"];
    const confidence = obj["confidence"];
    const reasoning = obj["reasoning"];

    if (typeof agentId !== "string" || !validAgentIds.has(agentId)) {
      logger.warn("Invalid or unknown agentId in AI response", {
        agentId,
        validIds: Array.from(validAgentIds),
      });
      return null;
    }

    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      logger.warn("Invalid confidence in AI response", { confidence });
      return null;
    }

    const reasoningStr =
      typeof reasoning === "string" ? reasoning : "No reasoning provided";

    return {
      agentId,
      confidence,
      reasoning: reasoningStr,
    };
  } catch (err) {
    logger.error("Failed to parse AI response", { error: String(err), response });
    return null;
  }
}

/**
 * Map model config name to Anthropic model ID.
 */
function getModelId(model: "claude-haiku" | "claude-sonnet-4"): string {
  const modelMap: Record<string, string> = {
    "claude-haiku": "claude-3-5-haiku-latest",
    "claude-sonnet-4": "claude-sonnet-4-20250514",
  };
  return modelMap[model] ?? "claude-3-5-haiku-latest";
}

/**
 * AI-based classifier implementation.
 * Uses Claude to classify messages based on semantic understanding.
 */
export const aiClassifier: Classifier = {
  name: "ai",

  async classify(
    input: ParsedInput,
    config: ParsedConfig,
    _session: Session | null
  ): Promise<ClassificationResult | null> {
    // Check if AI classification is enabled
    if (!config.classifier.enableAI) {
      logger.debug("AI classification is disabled");
      return null;
    }

    const startTime = performance.now();

    // Check for API key
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      logger.warn("ANTHROPIC_API_KEY not set, skipping AI classification");
      return null;
    }

    const client = new Anthropic({ apiKey });
    const prompt = buildClassificationPrompt(input.message, config.agents);
    const validAgentIds = new Set(config.agents.map((a) => a.id));

    try {
      logger.debug("Sending classification request to AI", {
        model: config.classifier.aiModel,
        messageLength: input.message.length,
      });

      const response = await client.messages.create({
        model: getModelId(config.classifier.aiModel),
        max_tokens: 256,
        temperature: 0.0, // Deterministic for classification
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const contentBlock = response.content[0];
      if (!contentBlock || contentBlock.type !== "text") {
        logger.warn("Unexpected response format from AI", { response });
        return null;
      }

      const parsed = parseAIResponse(contentBlock.text, validAgentIds);

      if (parsed === null) {
        return null;
      }

      // Check if confidence meets threshold
      if (parsed.confidence < config.classifier.aiThreshold) {
        logger.debug("AI confidence below threshold", {
          confidence: parsed.confidence.toFixed(3),
          threshold: config.classifier.aiThreshold,
          agentId: parsed.agentId,
        });
        return null;
      }

      const endTime = performance.now();

      logger.info("AI classification successful", {
        agentId: parsed.agentId,
        confidence: parsed.confidence.toFixed(3),
        reasoning: parsed.reasoning,
        timeMs: endTime - startTime,
      });

      return {
        agentId: parsed.agentId,
        confidence: parsed.confidence,
        method: "ai",
        reasoning: parsed.reasoning,
        originalMessage: input.message,
        classificationTimeMs: endTime - startTime,
      };
    } catch (err) {
      const endTime = performance.now();
      logger.error("AI classification failed", {
        error: String(err),
        timeMs: endTime - startTime,
      });
      return null;
    }
  },
};
