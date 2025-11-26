# Multi-Agent Router Engineering Specification

**Version:** 1.0.0
**Author:** Claude (Anthropic)
**Date:** 2025-11-26
**Review:** John Carmack Standards

---

## 1. Executive Summary

This specification defines a multi-agent routing system for warelay that enables intelligent message routing to specialized AI agents based on message content analysis.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WARELAY PROCESS                                 │
│                                                                             │
│  warelay.json: command = ["node", "multi-agent/dist/router.js", "{{Body}}"]│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-AGENT ROUTER                                 │
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐│
│  │   Input     │───▶│    Classifier    │───▶│      Agent Executor         ││
│  │   Parser    │    │    Pipeline      │    │                             ││
│  │             │    │                  │    │  ┌───────────────────────┐  ││
│  │ • Message   │    │ 1. Command Check │    │  │   Claude CLI Call     │  ││
│  │ • Sender    │    │ 2. Keyword Match │    │  │                       │  ││
│  │ • Context   │    │ 3. AI Classify   │    │  │ • System Prompt       │  ││
│  └─────────────┘    │ 4. Fallback      │    │  │ • User Message        │  ││
│                     └──────────────────┘    │  │ • Session Context     │  ││
│                              │              │  └───────────────────────┘  ││
│                              ▼              └─────────────────────────────┘│
│                     ┌──────────────────┐                                   │
│                     │  Session Manager │                                   │
│                     │                  │                                   │
│                     │ • Per-agent      │                                   │
│                     │ • Per-sender     │                                   │
│                     │ • Idle timeout   │                                   │
│                     └──────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 Input Parser (`src/parser.ts`)

**Responsibility:** Parse and normalize incoming message data.

```typescript
interface ParsedInput {
  message: string;           // Raw message text
  sender: string;            // E.164 phone number
  timestamp: Date;           // Message timestamp
  hasMedia: boolean;         // Whether message has attachments
  mediaPath?: string;        // Path to media file if present
}
```

**Design Decisions:**
- Immutable data structure (readonly properties)
- Validation at boundary (fail fast)
- No business logic in parser

### 3.2 Classifier Pipeline (`src/classifier/`)

**Responsibility:** Determine which agent should handle the message.

**Pipeline Order (by cost/latency):**

1. **Command Detector** - O(1), 0 API calls
2. **Keyword Matcher** - O(n), 0 API calls
3. **Session Continuity** - O(1), 0 API calls
4. **AI Classifier** - O(1), 1 API call
5. **Fallback** - O(1), 0 API calls

```typescript
interface ClassificationResult {
  agentId: string;           // Selected agent identifier
  confidence: number;        // 0.0 to 1.0
  method: ClassificationMethod;
  reasoning?: string;        // For debugging/logging
}

type ClassificationMethod =
  | 'command'      // Explicit /command
  | 'keyword'      // Keyword match
  | 'session'      // Continuing previous conversation
  | 'ai'           // AI classification
  | 'fallback';    // Default agent
```

### 3.3 Session Manager (`src/session.ts`)

**Responsibility:** Track conversation state per agent per sender.

```typescript
interface Session {
  id: string;                // UUID v4
  senderId: string;          // E.164 phone
  agentId: string;           // Agent that owns this session
  createdAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  metadata: Record<string, unknown>;
}
```

**Storage:** JSON files in `~/.warelay/multi-agent/sessions/`

**Design Decisions:**
- File-based storage (simple, no dependencies)
- Atomic writes (write to temp, rename)
- Session expiry via idle timeout

### 3.4 Agent Executor (`src/executor.ts`)

**Responsibility:** Execute Claude CLI with agent-specific configuration.

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  keywords: string[];
  commands: string[];
  model: 'claude-sonnet-4' | 'claude-haiku' | 'claude-opus-4';
  temperature: number;
  maxTokens: number;
  isDefault?: boolean;
}
```

---

## 4. Data Flow

```
1. warelay receives WhatsApp message
2. warelay spawns: node router.js "message" "+sender"
3. router.js:
   a. Parse input
   b. Load agent configs
   c. Run classifier pipeline
   d. Get/create session for selected agent
   e. Build Claude CLI command with system prompt
   f. Execute Claude CLI
   g. Output response to stdout
4. warelay sends stdout back to WhatsApp
```

---

## 5. Configuration Schema

### 5.1 Agent Config (`agents.json`)

```json
{
  "$schema": "./agents.schema.json",
  "version": "1.0.0",
  "agents": {
    "code": {
      "name": "Code Assistant",
      "description": "Expert software engineer for programming questions",
      "systemPromptFile": "prompts/code.md",
      "keywords": [
        "code", "coding", "program", "programming",
        "bug", "debug", "error", "exception",
        "function", "class", "method", "variable",
        "typescript", "javascript", "python", "rust", "go",
        "api", "rest", "graphql", "database", "sql",
        "git", "github", "deploy", "docker", "kubernetes"
      ],
      "commands": ["/code", "/dev", "/debug"],
      "model": "claude-sonnet-4",
      "temperature": 0.3,
      "maxTokens": 4096
    },
    "travel": {
      "name": "Travel Expert",
      "description": "Travel planning and booking assistance",
      "systemPromptFile": "prompts/travel.md",
      "keywords": [
        "travel", "trip", "vacation", "holiday",
        "flight", "flights", "airplane", "airport",
        "hotel", "hotels", "hostel", "airbnb",
        "booking", "reservation", "itinerary",
        "visa", "passport", "customs",
        "destination", "tourism", "tourist"
      ],
      "commands": ["/travel", "/trip", "/vacation"],
      "model": "claude-haiku",
      "temperature": 0.7,
      "maxTokens": 2048
    },
    "general": {
      "name": "General Assistant",
      "description": "Helpful assistant for general questions",
      "systemPromptFile": "prompts/general.md",
      "keywords": [],
      "commands": ["/general", "/help"],
      "model": "claude-haiku",
      "temperature": 0.5,
      "maxTokens": 2048,
      "isDefault": true
    }
  },
  "classifier": {
    "keywordThreshold": 0.6,
    "aiThreshold": 0.5,
    "aiModel": "claude-haiku",
    "enableAI": true
  },
  "session": {
    "idleTimeoutMinutes": 30,
    "maxSessionsPerSender": 5
  }
}
```

---

## 6. Error Handling

| Error Type | Handling Strategy |
|------------|-------------------|
| Invalid input | Return error message to user |
| Agent not found | Use default agent |
| Claude CLI failure | Retry once, then error message |
| Session read error | Create new session |
| Config parse error | Exit with error code, log details |

---

## 7. Logging

**Log Levels:** ERROR, WARN, INFO, DEBUG

**Log Format:**
```
[2025-11-26T10:30:00.000Z] [INFO] [router] message="Classified message" agent="code" confidence=0.95 method="keyword"
```

**Log Location:** `~/.warelay/multi-agent/logs/router.log`

---

## 8. Testing Strategy

### Unit Tests
- Parser validation
- Keyword matching accuracy
- Session lifecycle
- Config loading

### Integration Tests
- Full classification pipeline
- Claude CLI integration
- End-to-end message flow

### Performance Tests
- Classification latency < 100ms (no AI)
- Classification latency < 2s (with AI)
- Memory usage < 50MB

---

## 9. Security Considerations

1. **Input Sanitization:** All user input escaped before CLI execution
2. **Path Traversal:** Session files validated to be within allowed directory
3. **API Key Protection:** ANTHROPIC_API_KEY from environment only
4. **No Eval:** Never eval/exec user-provided content

---

## 10. File Structure

```
multi-agent/
├── package.json
├── tsconfig.json
├── ENGINEERING_SPEC.md
├── CHANGELOG.md
├── README.md
├── src/
│   ├── index.ts              # Entry point
│   ├── parser.ts             # Input parsing
│   ├── config.ts             # Configuration loading
│   ├── classifier/
│   │   ├── index.ts          # Classifier pipeline
│   │   ├── command.ts        # Command detection
│   │   ├── keyword.ts        # Keyword matching
│   │   ├── ai.ts             # AI classification
│   │   └── types.ts          # Type definitions
│   ├── session.ts            # Session management
│   ├── executor.ts           # Agent execution
│   ├── logger.ts             # Logging utility
│   └── utils.ts              # Shared utilities
├── config/
│   ├── agents.json           # Agent configurations
│   └── agents.schema.json    # JSON schema
├── prompts/
│   ├── code.md               # Code agent prompt
│   ├── travel.md             # Travel agent prompt
│   └── general.md            # General agent prompt
├── tests/
│   ├── parser.test.ts
│   ├── classifier.test.ts
│   ├── session.test.ts
│   └── executor.test.ts
└── dist/                     # Compiled output
```

---

## 11. Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0"
  }
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
1. Project setup (package.json, tsconfig.json)
2. Logger implementation
3. Config loader with validation
4. Parser implementation

### Phase 2: Classification (Intelligence Layer)
5. Command detector
6. Keyword matcher
7. AI classifier
8. Classifier pipeline orchestrator

### Phase 3: Execution (Agent Layer)
9. Session manager
10. Agent executor
11. Main router entry point

### Phase 4: Quality (Testing & Polish)
12. Unit tests
13. Integration tests
14. Agent prompts refinement
15. Documentation

### Phase 5: Integration (Deployment)
16. Update warelay.json
17. End-to-end testing
18. Changelog update
19. Git commit and push
