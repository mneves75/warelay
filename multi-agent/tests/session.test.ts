/**
 * Tests for the session manager.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSessionStore } from "../src/session.js";
import type { SessionConfig } from "../src/classifier/types.js";

describe("SessionStore", () => {
  let testDir: string;
  let sessionConfig: SessionConfig;

  beforeEach(() => {
    // Create a temporary directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-test-"));
    sessionConfig = {
      idleTimeoutMinutes: 30,
      maxSessionsPerSender: 3,
    };
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", () => {
      const store = createSessionStore(sessionConfig, testDir);
      const session = store.getSession("+5561983297558");

      expect(session).toBeNull();
    });

    it("should return session after creation", () => {
      const store = createSessionStore(sessionConfig, testDir);
      store.upsertSession("+5561983297558", "code");

      const session = store.getSession("+5561983297558");

      expect(session).not.toBeNull();
      expect(session?.senderId).toBe("+5561983297558");
      expect(session?.agentId).toBe("code");
      expect(session?.messageCount).toBe(1);
    });

    it("should return null for expired session", () => {
      const store = createSessionStore(
        { ...sessionConfig, idleTimeoutMinutes: 1 },
        testDir
      );

      // Create a session
      store.upsertSession("+5561983297558", "code");

      // Manually expire the session by modifying the file
      const files = fs.readdirSync(testDir);
      const sessionFile = files.find((f) => f.endsWith(".json"));
      if (sessionFile) {
        const filePath = path.join(testDir, sessionFile);
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        // Set lastActivityAt to 2 minutes ago (beyond 1 minute timeout)
        content.lastActivityAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        fs.writeFileSync(filePath, JSON.stringify(content));
      }

      // Session should now be expired
      const session = store.getSession("+5561983297558");

      expect(session).toBeNull();
    });
  });

  describe("upsertSession", () => {
    it("should create new session for new sender", () => {
      const store = createSessionStore(sessionConfig, testDir);
      const session = store.upsertSession("+5561983297558", "code");

      expect(session.senderId).toBe("+5561983297558");
      expect(session.agentId).toBe("code");
      expect(session.messageCount).toBe(1);
      expect(session.id).toBeDefined();
    });

    it("should update existing session", () => {
      const store = createSessionStore(sessionConfig, testDir);

      const first = store.upsertSession("+5561983297558", "code");
      const second = store.upsertSession("+5561983297558", "code");

      expect(second.id).toBe(first.id);
      expect(second.messageCount).toBe(2);
    });

    it("should update agent ID for existing session", () => {
      const store = createSessionStore(sessionConfig, testDir);

      store.upsertSession("+5561983297558", "code");
      const updated = store.upsertSession("+5561983297558", "travel");

      expect(updated.agentId).toBe("travel");
    });

    it("should create separate sessions for different senders", () => {
      const store = createSessionStore(sessionConfig, testDir);

      const session1 = store.upsertSession("+5561983297558", "code");
      const session2 = store.upsertSession("+14155552671", "travel");

      expect(session1.id).not.toBe(session2.id);
      expect(session1.agentId).toBe("code");
      expect(session2.agentId).toBe("travel");
    });
  });

  describe("touchSession", () => {
    it("should update lastActivityAt timestamp", () => {
      const store = createSessionStore(sessionConfig, testDir);
      const session = store.upsertSession("+5561983297558", "code");

      const originalActivity = session.lastActivityAt;

      // Wait a tiny bit
      const before = Date.now();
      store.touchSession(session.id);
      const after = Date.now();

      const updated = store.getSession("+5561983297558");
      const updatedTime = new Date(updated!.lastActivityAt).getTime();

      expect(updatedTime).toBeGreaterThanOrEqual(before);
      expect(updatedTime).toBeLessThanOrEqual(after);
    });
  });

  describe("cleanup", () => {
    it("should remove expired sessions", () => {
      // Create store with 1 minute timeout
      const store = createSessionStore(
        { ...sessionConfig, idleTimeoutMinutes: 1 },
        testDir
      );

      // Create a session
      store.upsertSession("+5561983297558", "code");

      // Manually expire the session by modifying the file
      const files = fs.readdirSync(testDir);
      const sessionFile = files.find((f) => f.endsWith(".json"));
      if (sessionFile) {
        const filePath = path.join(testDir, sessionFile);
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        content.lastActivityAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        fs.writeFileSync(filePath, JSON.stringify(content));
      }

      // Cleanup should remove the expired session
      const cleaned = store.cleanup();

      expect(cleaned).toBe(1);
      expect(store.getSession("+5561983297558")).toBeNull();
    });

    it("should not remove active sessions", () => {
      const store = createSessionStore(sessionConfig, testDir);

      store.upsertSession("+5561983297558", "code");
      const cleaned = store.cleanup();

      expect(cleaned).toBe(0);
      expect(store.getSession("+5561983297558")).not.toBeNull();
    });
  });
});
