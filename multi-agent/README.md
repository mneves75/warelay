# Warelay Multi-Agent Router

A sophisticated message routing system for warelay WhatsApp automation that intelligently routes incoming messages to specialized AI agents based on content analysis.

## Features

- **Multi-Agent Support**: Route messages to different AI agents (Code, Travel, General, etc.)
- **Hybrid Classification**: Combines command detection, keyword matching, and AI-based classification
- **Session Management**: Maintains conversation context per sender per agent
- **Configurable Agents**: JSON-based configuration for easy customization
- **Production Ready**: Comprehensive test suite, strict TypeScript, and structured logging

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WARELAY ROUTER                           │
├─────────────────────────────────────────────────────────────────┤
│  Input Parser                                                   │
│  ├── CLI args: warelay-router <sender> <message>               │
│  └── Stdin: {"sender": "...", "message": "..."}                │
├─────────────────────────────────────────────────────────────────┤
│  Classification Pipeline (Priority Order)                       │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│  │  Command    │  Session    │  Keyword    │     AI      │     │
│  │  /code      │  Continue   │  Pattern    │  Claude     │     │
│  │  /travel    │  Existing   │  Matching   │  Analysis   │     │
│  │             │  Session    │             │             │     │
│  │  Conf: 1.0  │  Conf: 0.9  │  Conf: 0.6  │  Conf: 0.7  │     │
│  └─────────────┴─────────────┴─────────────┴─────────────┘     │
│                           │                                     │
│                           ▼                                     │
│                    ┌──────────────┐                            │
│                    │   Fallback   │                            │
│                    │   Default    │                            │
│                    │    Agent     │                            │
│                    └──────────────┘                            │
├─────────────────────────────────────────────────────────────────┤
│  Agent Executor                                                 │
│  ├── Load system prompt from file                              │
│  ├── Execute Claude CLI with agent config                      │
│  └── Return response to warelay                                │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd multi-agent
npm install
npm run build
```

## Configuration

Create `~/.warelay/multi-agent/config/agents.json`:

```json
{
  "version": "1.0.0",
  "agents": {
    "code": {
      "name": "Code Assistant",
      "description": "Expert software engineer",
      "systemPromptFile": "code.md",
      "keywords": ["code", "programming", "debug", "api"],
      "commands": ["code", "dev"],
      "model": "claude-sonnet-4",
      "temperature": 0.3,
      "maxTokens": 16384
    }
  },
  "classifier": {
    "keywordThreshold": 0.15,
    "aiThreshold": 0.6,
    "aiModel": "claude-haiku",
    "enableAI": true
  },
  "session": {
    "idleTimeoutMinutes": 30,
    "maxSessionsPerSender": 5
  }
}
```

Create agent prompts in `~/.warelay/multi-agent/prompts/`:
- `code.md` - System prompt for code agent
- `travel.md` - System prompt for travel agent
- `general.md` - System prompt for general agent

## Usage

### CLI Mode
```bash
node dist/index.js "+5561983297558" "How do I sort an array in JavaScript?"
```

### Stdin Mode
```bash
echo '{"sender": "+5561983297558", "message": "/code debug my function"}' | node dist/index.js
```

### With Warelay
Configure `~/.warelay/warelay.json`:
```json
{
  "inbound": {
    "reply": {
      "mode": "command",
      "command": ["node", "/path/to/multi-agent/dist/index.js", "{{From}}", "{{BodyStripped}}"],
      "timeoutSeconds": 180
    }
  }
}
```

## Classification Methods

1. **Command** (highest priority): Explicit `/command` at start of message
   - `/code` → Code Agent
   - `/travel` → Travel Agent

2. **Session**: Continue with agent from existing conversation

3. **Keyword**: Pattern matching against agent keywords
   - Threshold configurable (default: 0.15)
   - Case-insensitive with accent normalization

4. **AI**: Claude-based semantic classification
   - Uses claude-haiku for fast classification
   - Threshold configurable (default: 0.6)

5. **Fallback**: Default agent when nothing matches

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for AI classification
- `LOG_LEVEL` - DEBUG, INFO (default), WARN, ERROR

## License

MIT
