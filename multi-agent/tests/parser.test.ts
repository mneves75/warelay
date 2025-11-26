/**
 * Tests for the input parser.
 */

import { describe, it, expect } from "vitest";
import { parseInput } from "../src/parser.js";

describe("parseInput", () => {
  it("should parse valid command line arguments", () => {
    const args = ["node", "script.js", "+5561983297558", "Hello", "world"];
    const result = parseInput(args);

    expect(result.sender).toBe("+5561983297558");
    expect(result.message).toBe("Hello world");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should handle single word messages", () => {
    const args = ["node", "script.js", "+5561983297558", "Hello"];
    const result = parseInput(args);

    expect(result.message).toBe("Hello");
  });

  it("should trim whitespace from sender and message", () => {
    const args = ["node", "script.js", "  +5561983297558  ", "  Hello  world  "];
    const result = parseInput(args);

    expect(result.sender).toBe("+5561983297558");
    expect(result.message).toBe("Hello  world");
  });

  it("should throw error when sender is missing", () => {
    const args = ["node", "script.js"];

    expect(() => parseInput(args)).toThrow("Missing required argument: sender");
  });

  it("should throw error when sender is empty", () => {
    const args = ["node", "script.js", "   "];

    expect(() => parseInput(args)).toThrow("Missing required argument: sender");
  });

  it("should throw error when message is missing", () => {
    const args = ["node", "script.js", "+5561983297558"];

    expect(() => parseInput(args)).toThrow("Missing required argument: message");
  });

  it("should throw error when message is empty", () => {
    const args = ["node", "script.js", "+5561983297558", "   "];

    expect(() => parseInput(args)).toThrow("Missing required argument: message");
  });

  it("should handle messages with special characters", () => {
    const args = ["node", "script.js", "+5561983297558", "/code", "console.log('hello')"];
    const result = parseInput(args);

    expect(result.message).toBe("/code console.log('hello')");
  });

  it("should handle international phone numbers", () => {
    const args = ["node", "script.js", "+14155552671", "Test message"];
    const result = parseInput(args);

    expect(result.sender).toBe("+14155552671");
  });
});
