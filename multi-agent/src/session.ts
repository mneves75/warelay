/**
 * Session manager for the multi-agent router.
 * Persists session state to disk for continuity across invocations.
 */

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";
import type { Session, SessionConfig } from "./classifier/types.js";

const logger = createLogger("session");

/**
 * Default session storage directory.
 */
const SESSION_DIR = path.join(
  process.env["HOME"] ?? "~",
  ".warelay",
  "multi-agent",
  "sessions"
);

/**
 * Session store interface for managing session persistence.
 */
export interface SessionStore {
  /**
   * Get active session for a sender.
   * Returns null if no active session exists.
   */
  getSession(senderId: string): Session | null;

  /**
   * Create or update a session for a sender.
   */
  upsertSession(senderId: string, agentId: string): Session;

  /**
   * Touch a session to update its last activity timestamp.
   */
  touchSession(sessionId: string): void;

  /**
   * Clean up expired sessions.
   */
  cleanup(): number;
}

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Get the file path for a session.
 */
function getSessionPath(sessionDir: string, senderId: string): string {
  // Hash the sender ID to create a safe filename
  const safeId = Buffer.from(senderId).toString("base64url");
  return path.join(sessionDir, `${safeId}.json`);
}

/**
 * Check if a session is expired.
 */
function isSessionExpired(session: Session, config: SessionConfig): boolean {
  const lastActivity = new Date(session.lastActivityAt).getTime();
  const now = Date.now();
  const timeoutMs = config.idleTimeoutMinutes * 60 * 1000;
  return now - lastActivity > timeoutMs;
}

/**
 * Read a session from disk.
 */
function readSession(filePath: string): Session | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Session;
  } catch (err) {
    logger.warn("Failed to read session file", { filePath, error: String(err) });
    return null;
  }
}

/**
 * Write a session to disk.
 */
function writeSession(filePath: string, session: Session): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  } catch (err) {
    logger.error("Failed to write session file", { filePath, error: String(err) });
    throw err;
  }
}

/**
 * Create a file-based session store.
 */
export function createSessionStore(
  config: SessionConfig,
  sessionDir: string = SESSION_DIR
): SessionStore {
  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    logger.info("Created session directory", { path: sessionDir });
  }

  return {
    getSession(senderId: string): Session | null {
      const filePath = getSessionPath(sessionDir, senderId);
      const session = readSession(filePath);

      if (session === null) {
        logger.debug("No session found for sender", { senderId });
        return null;
      }

      // Check if session is expired
      if (isSessionExpired(session, config)) {
        logger.info("Session expired", {
          sessionId: session.id,
          senderId,
          lastActivity: session.lastActivityAt,
        });
        // Remove expired session file
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore deletion errors
        }
        return null;
      }

      logger.debug("Session found", {
        sessionId: session.id,
        agentId: session.agentId,
        messageCount: session.messageCount,
      });

      return session;
    },

    upsertSession(senderId: string, agentId: string): Session {
      const filePath = getSessionPath(sessionDir, senderId);
      const existing = readSession(filePath);
      const now = new Date().toISOString();

      let session: Session;

      if (existing !== null && !isSessionExpired(existing, config)) {
        // Update existing session
        session = {
          ...existing,
          agentId, // May have changed
          lastActivityAt: now,
          messageCount: existing.messageCount + 1,
        };
        logger.debug("Updating existing session", {
          sessionId: session.id,
          messageCount: session.messageCount,
        });
      } else {
        // Create new session
        session = {
          id: generateSessionId(),
          senderId,
          agentId,
          createdAt: now,
          lastActivityAt: now,
          messageCount: 1,
        };
        logger.info("Created new session", {
          sessionId: session.id,
          senderId,
          agentId,
        });
      }

      writeSession(filePath, session);
      return session;
    },

    touchSession(sessionId: string): void {
      // Find session by ID (need to scan directory)
      const files = fs.readdirSync(sessionDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(sessionDir, file);
        const session = readSession(filePath);

        if (session?.id === sessionId) {
          const updated: Session = {
            ...session,
            lastActivityAt: new Date().toISOString(),
          };
          writeSession(filePath, updated);
          logger.debug("Touched session", { sessionId });
          return;
        }
      }
      logger.warn("Session not found for touch", { sessionId });
    },

    cleanup(): number {
      let cleaned = 0;
      const files = fs.readdirSync(sessionDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(sessionDir, file);
        const session = readSession(filePath);

        if (session !== null && isSessionExpired(session, config)) {
          try {
            fs.unlinkSync(filePath);
            cleaned++;
            logger.debug("Cleaned up expired session", { sessionId: session.id });
          } catch {
            // Ignore deletion errors
          }
        }
      }

      if (cleaned > 0) {
        logger.info("Cleaned up expired sessions", { count: cleaned });
      }

      return cleaned;
    },
  };
}
