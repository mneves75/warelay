/**
 * Keyword-based classifier.
 * Matches messages against agent keywords using fuzzy matching.
 * Fast and cost-free, runs before AI classification.
 */

import { createLogger } from "../logger.js";
import type {
  AgentConfig,
  Classifier,
  ClassificationResult,
  ParsedConfig,
  ParsedInput,
  Session,
} from "./types.js";

const logger = createLogger("keyword-classifier");

/**
 * Normalize text for keyword matching.
 * Converts to lowercase and removes accents.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tokenize text into words.
 * Removes punctuation and splits on whitespace.
 */
function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Calculate keyword match score for an agent.
 * Returns a score from 0.0 to 1.0 based on keyword matches.
 */
function calculateAgentScore(
  messageTokens: Set<string>,
  messageText: string,
  agent: AgentConfig
): { score: number; matchedKeywords: string[] } {
  const matchedKeywords: string[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  const normalizedMessage = normalizeText(messageText);

  for (const keyword of agent.keywords) {
    const normalizedKeyword = normalizeText(keyword);
    const keywordTokens = tokenize(keyword);

    // Weight multi-word keywords higher (they're more specific)
    const weight = keywordTokens.length;
    totalWeight += weight;

    // Check for exact phrase match first (highest priority)
    if (normalizedMessage.includes(normalizedKeyword)) {
      matchedKeywords.push(keyword);
      matchedWeight += weight;
      continue;
    }

    // Check if all tokens of the keyword are present in the message
    const allTokensPresent = keywordTokens.every((token) =>
      messageTokens.has(token)
    );

    if (allTokensPresent && keywordTokens.length > 0) {
      matchedKeywords.push(keyword);
      matchedWeight += weight * 0.8; // Slightly lower score for non-exact matches
    }
  }

  // Avoid division by zero
  if (totalWeight === 0) {
    return { score: 0, matchedKeywords: [] };
  }

  const score = matchedWeight / totalWeight;
  return { score, matchedKeywords };
}

/**
 * Find the best matching agent based on keywords.
 */
function findBestMatch(
  input: ParsedInput,
  config: ParsedConfig
): {
  agent: AgentConfig;
  score: number;
  matchedKeywords: string[];
} | null {
  const messageTokens = new Set(tokenize(input.message));
  const messageText = input.message;

  let bestMatch: {
    agent: AgentConfig;
    score: number;
    matchedKeywords: string[];
  } | null = null;

  for (const agent of config.agents) {
    const { score, matchedKeywords } = calculateAgentScore(
      messageTokens,
      messageText,
      agent
    );

    logger.debug("Agent score calculated", {
      agentId: agent.id,
      score: score.toFixed(3),
      matchedKeywords,
    });

    if (
      score > 0 &&
      (bestMatch === null ||
        score > bestMatch.score ||
        // Prefer more specific matches (more matched keywords)
        (score === bestMatch.score &&
          matchedKeywords.length > bestMatch.matchedKeywords.length))
    ) {
      bestMatch = { agent, score, matchedKeywords };
    }
  }

  return bestMatch;
}

/**
 * Keyword-based classifier implementation.
 * Uses keyword matching to classify messages to agents.
 */
export const keywordClassifier: Classifier = {
  name: "keyword",

  async classify(
    input: ParsedInput,
    config: ParsedConfig,
    _session: Session | null
  ): Promise<ClassificationResult | null> {
    const startTime = performance.now();

    const match = findBestMatch(input, config);

    if (match === null) {
      logger.debug("No keyword match found", {
        messageStart: input.message.substring(0, 50),
      });
      return null;
    }

    // Check if score meets threshold
    if (match.score < config.classifier.keywordThreshold) {
      logger.debug("Keyword score below threshold", {
        score: match.score.toFixed(3),
        threshold: config.classifier.keywordThreshold,
        agentId: match.agent.id,
      });
      return null;
    }

    const endTime = performance.now();

    logger.info("Keyword match found", {
      agentId: match.agent.id,
      score: match.score.toFixed(3),
      matchedKeywords: match.matchedKeywords,
      timeMs: endTime - startTime,
    });

    return {
      agentId: match.agent.id,
      confidence: match.score,
      method: "keyword",
      reasoning: `Matched keywords: ${match.matchedKeywords.join(", ")}`,
      originalMessage: input.message,
      classificationTimeMs: endTime - startTime,
    };
  },
};
