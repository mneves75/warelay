# Changelog

All notable changes to the warelay multi-agent router will be documented in this file.

## [1.0.0] - 2025-11-26

### Added
- Initial release of the multi-agent router system
- **Classification Pipeline**:
  - Command-based classification (`/code`, `/travel`, etc.)
  - Session-based classification for conversation continuity
  - Keyword-based classification with fuzzy matching
  - AI-based classification using Claude API
  - Fallback to default agent
- **Agent Configuration**:
  - JSON-based agent definitions
  - Configurable models, temperature, max tokens
  - Custom system prompts per agent
  - Keyword and command mappings
- **Session Management**:
  - File-based session persistence
  - Configurable idle timeout
  - Per-sender session tracking
- **Executor**:
  - Claude CLI integration
  - Configurable timeout
  - Proper error handling
- **Logging**:
  - Structured JSON logging
  - Configurable log levels
  - Module-based logging
- **Testing**:
  - 52 comprehensive unit tests
  - Coverage for all classifiers
  - Session and config validation tests
- **Documentation**:
  - Engineering specification
  - README with architecture diagram
  - Inline code documentation

### Technical Details
- TypeScript with strict mode
- Node.js 22+ required
- ESM modules
- Zero runtime dependencies (except @anthropic-ai/sdk)
- Vitest for testing
