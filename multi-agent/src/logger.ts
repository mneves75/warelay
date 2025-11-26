/**
 * Simple, zero-dependency logger for the multi-agent router.
 * Logs to stderr to keep stdout clean for the response.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Default to INFO, can be overridden via environment
const currentLevel: LogLevel =
  (process.env["LOG_LEVEL"] as LogLevel) || "INFO";

/**
 * Format a log message with timestamp, level, and module.
 */
function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
}

/**
 * Check if a log level should be output.
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Create a logger instance for a specific module.
 */
export function createLogger(module: string) {
  return {
    debug(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("DEBUG")) {
        console.error(formatMessage("DEBUG", module, message, data));
      }
    },

    info(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("INFO")) {
        console.error(formatMessage("INFO", module, message, data));
      }
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("WARN")) {
        console.error(formatMessage("WARN", module, message, data));
      }
    },

    error(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("ERROR")) {
        console.error(formatMessage("ERROR", module, message, data));
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
