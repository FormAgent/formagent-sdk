# Session Storage

Session storage enables persistent conversation state across process restarts. This is essential for applications that need to maintain conversation context over time.

## Overview

The SDK provides two built-in storage implementations:

| Storage Type | Persistence | Use Case |
|-------------|-------------|----------|
| `MemorySessionStorage` | Process lifetime only | Development, testing, single-use sessions |
| `FileSessionStorage` | Disk-based, survives restarts | Production, multi-session applications |

## Quick Start

### Using FileSessionStorage

```typescript
import { createSession, FileSessionStorage, builtinTools } from "formagent-sdk"

// Create a persistent storage instance
const storage = new FileSessionStorage("./sessions")

// Create session with persistent storage
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  sessionStorage: storage,
})

// Save the session ID for later resumption
const sessionId = session.id
console.log(`Session created: ${sessionId}`)

// ... use the session ...

await session.close()
```

### Resuming a Session

```typescript
import { createSession, FileSessionStorage, builtinTools } from "formagent-sdk"

const storage = new FileSessionStorage("./sessions")

// Resume from a previous session
const session = await createSession({
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
  sessionStorage: storage,
  resume: "previous-session-id",  // The session ID from before
})

// Continue the conversation with full context
await session.send("What were we discussing?")

for await (const event of session.receive()) {
  if (event.type === "text") {
    process.stdout.write(event.text)
  }
}
```

## Global Storage Configuration

For applications that use a single storage backend, you can set a default storage:

```typescript
import { setDefaultStorage, FileSessionStorage, createSession } from "formagent-sdk"

// Set once at application startup
setDefaultStorage(new FileSessionStorage("./sessions"))

// All sessions now use file storage by default
const session1 = await createSession({ model: "claude-sonnet-4-20250514" })
const session2 = await createSession({ model: "claude-sonnet-4-20250514" })

// Both sessions are persisted to ./sessions/
```

## Storage Interface

You can implement custom storage backends by implementing the `SessionStorage` interface:

```typescript
interface SessionStorage {
  /** Save session state */
  save(state: SessionState): Promise<void>

  /** Load session state by ID */
  load(sessionId: string): Promise<SessionState | undefined>

  /** Delete session state */
  delete(sessionId: string): Promise<void>

  /** List all stored session IDs */
  list(): Promise<string[]>
}
```

### SessionState Structure

```typescript
interface SessionState {
  /** Unique session identifier */
  id: string
  /** Conversation messages */
  messages: SDKMessage[]
  /** Accumulated usage statistics */
  usage: ExtendedUsageInfo
  /** Session metadata */
  metadata: Record<string, unknown>
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Parent session ID (if forked) */
  parentId?: string
}
```

## Built-in Implementations

### MemorySessionStorage

In-memory storage that exists only for the process lifetime.

```typescript
import { MemorySessionStorage } from "formagent-sdk"

const storage = new MemorySessionStorage()

// Additional methods
storage.clear()     // Clear all sessions
storage.size()      // Get number of stored sessions
```

### FileSessionStorage

File-based storage that persists sessions as JSON files.

```typescript
import { FileSessionStorage } from "formagent-sdk"

// Sessions stored as ./sessions/{session-id}.json
const storage = new FileSessionStorage("./sessions")
```

**File Structure:**
```
./sessions/
  ├── sess_abc123.json
  ├── sess_def456.json
  └── sess_ghi789.json
```

## Custom Storage Examples

### Redis Storage

```typescript
import { createClient } from "redis"
import type { SessionStorage, SessionState } from "formagent-sdk"

class RedisSessionStorage implements SessionStorage {
  private client: ReturnType<typeof createClient>
  private prefix: string

  constructor(redisUrl: string, prefix = "session:") {
    this.client = createClient({ url: redisUrl })
    this.prefix = prefix
  }

  async save(state: SessionState): Promise<void> {
    await this.client.set(
      this.prefix + state.id,
      JSON.stringify(state)
    )
  }

  async load(sessionId: string): Promise<SessionState | undefined> {
    const data = await this.client.get(this.prefix + sessionId)
    return data ? JSON.parse(data) : undefined
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.prefix + sessionId)
  }

  async list(): Promise<string[]> {
    const keys = await this.client.keys(this.prefix + "*")
    return keys.map(k => k.slice(this.prefix.length))
  }
}
```

### SQLite Storage

```typescript
import Database from "better-sqlite3"
import type { SessionStorage, SessionState } from "formagent-sdk"

class SQLiteSessionStorage implements SessionStorage {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  async save(state: SessionState): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, state, updated_at)
      VALUES (?, ?, ?)
    `).run(state.id, JSON.stringify(state), Date.now())
  }

  async load(sessionId: string): Promise<SessionState | undefined> {
    const row = this.db.prepare(
      "SELECT state FROM sessions WHERE id = ?"
    ).get(sessionId) as { state: string } | undefined
    return row ? JSON.parse(row.state) : undefined
  }

  async delete(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId)
  }

  async list(): Promise<string[]> {
    const rows = this.db.prepare("SELECT id FROM sessions").all() as { id: string }[]
    return rows.map(r => r.id)
  }
}
```

## Best Practices

### 1. Use Shared Storage Instance

Create a single storage instance and reuse it:

```typescript
// storage.ts
import { FileSessionStorage } from "formagent-sdk"

export const sessionStorage = new FileSessionStorage("./data/sessions")
```

```typescript
// app.ts
import { sessionStorage } from "./storage"
import { createSession } from "formagent-sdk"

const session = await createSession({
  sessionStorage,
  // ...
})
```

### 2. Handle Missing Sessions

When resuming, handle the case where the session doesn't exist:

```typescript
try {
  const session = await createSession({
    sessionStorage,
    resume: sessionId,
  })
} catch (error) {
  if (error.message.includes("Session not found")) {
    // Start a fresh session instead
    const session = await createSession({ sessionStorage })
  }
}
```

### 3. Clean Up Old Sessions

Implement session cleanup for long-running applications:

```typescript
async function cleanupOldSessions(storage: FileSessionStorage, maxAgeDays: number) {
  const sessionIds = await storage.list()
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000

  for (const id of sessionIds) {
    const state = await storage.load(id)
    if (state && Date.now() - state.updatedAt > maxAge) {
      await storage.delete(id)
    }
  }
}
```

## API Reference

### createSession Options

| Option | Type | Description |
|--------|------|-------------|
| `sessionStorage` | `SessionStorage` | Storage backend for persistence |
| `resume` | `string` | Session ID to resume from |
| `fork` | `string` | Session ID to fork (create branch) |

### Functions

| Function | Description |
|----------|-------------|
| `setDefaultStorage(storage)` | Set global default storage |
| `createSessionStorage(type, options)` | Create storage instance |
| `resumeSession(sessionId, options)` | Resume existing session |
| `forkSession(sessionId, options)` | Fork existing session |
