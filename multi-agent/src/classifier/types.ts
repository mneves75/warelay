/**
 * Classification types for the multi-agent router.
 * These types define the contract between classifier components.
 */

/**
 * Method used to classify a message.
 * Ordered by preference/cost (command is best, fallback is worst).
 */
export type ClassificationMethod =
  | "command" // Explicit /command in message
  | "keyword" // Keyword pattern match
  | "session" // Continuing existing conversation
  | "ai" // AI-based classification
  | "fallback"; // Default agent when nothing else matches

/**
 * Result of classifying a message.
 * Immutable - create new instances rather than mutating.
 */
export interface ClassificationResult {
  /** Identifier of the selected agent */
  readonly agentId: string;
  /** Confidence score from 0.0 to 1.0 */
  readonly confidence: number;
  /** Method used to make this classification */
  readonly method: ClassificationMethod;
  /** Optional explanation for debugging */
  readonly reasoning?: string;
  /** Original message that was classified */
  readonly originalMessage: string;
  /** Time taken to classify in milliseconds */
  readonly classificationTimeMs: number;
}

/**
 * Agent configuration loaded from agents.json.
 */
export interface AgentConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly systemPromptFile: string;
  readonly keywords: readonly string[];
  readonly commands: readonly string[];
  readonly model: "claude-sonnet-4" | "claude-haiku" | "claude-opus-4";
  readonly temperature: number;
  readonly maxTokens: number;
  readonly isDefault?: boolean;
}

/**
 * Classifier configuration from agents.json.
 */
export interface ClassifierConfig {
  readonly keywordThreshold: number;
  readonly aiThreshold: number;
  readonly aiModel: "claude-haiku" | "claude-sonnet-4";
  readonly enableAI: boolean;
}

/**
 * Session configuration from agents.json.
 */
export interface SessionConfig {
  readonly idleTimeoutMinutes: number;
  readonly maxSessionsPerSender: number;
}

/**
 * Root configuration structure.
 */
export interface RootConfig {
  readonly version: string;
  readonly agents: Record<string, Omit<AgentConfig, "id">>;
  readonly classifier: ClassifierConfig;
  readonly session: SessionConfig;
}

/**
 * Parsed and validated configuration with agent IDs injected.
 */
export interface ParsedConfig {
  readonly version: string;
  readonly agents: readonly AgentConfig[];
  readonly classifier: ClassifierConfig;
  readonly session: SessionConfig;
  readonly defaultAgent: AgentConfig;
}

/**
 * Session data persisted to disk.
 */
export interface Session {
  readonly id: string;
  readonly senderId: string;
  readonly agentId: string;
  readonly createdAt: string; // ISO 8601
  readonly lastActivityAt: string; // ISO 8601
  readonly messageCount: number;
}

/**
 * Input parsed from command line arguments.
 */
export interface ParsedInput {
  readonly message: string;
  readonly sender: string;
  readonly timestamp: Date;
}

/**
 * A single classifier in the pipeline.
 */
export interface Classifier {
  readonly name: string;
  classify(
    input: ParsedInput,
    config: ParsedConfig,
    session: Session | null
  ): Promise<ClassificationResult | null>;
}
