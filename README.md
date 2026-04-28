# signals

Zero-dependency, glitch-free reactive signals for TypeScript and JavaScript. Built with a highly optimized Push/Pull architecture (inspired by Angular) that guarantees zero wasted computations.

Perfectly suited for **both Browser and Node.js** environments. Use it to drive UI frameworks, build reactive CLI tools, or manage complex server-side state machines.

Package: https://www.npmjs.com/package/@demchenko.di/signals

Demo: https://dmytrodemchenko.github.io/Signals/demo/

## Install

```bash
npm install @demchenko.di/signals
```

## Features

- **Glitch-free Push/Pull engine:** Guarantees effects only run when values actually change.
- **Node.js Ready:** Extremely lightweight, fast, and completely decoupled from the DOM.
- Small core API: `signal`, `computed`, `effect`, `batch`, `untracked`
- Extra primitives: `linkedSignal`, `resource`, `optimistic`, `debounceSignal`
- Dual build: Unminified for development, minified for production (`@demchenko.di/signals/min`).
- No runtime dependencies
- Typed public API with generated `.d.ts` files

## Benchmarks

**Performance Highlights:**
- ✅ **1.5x faster than RxJS** on diamond dependency graphs (glitch-free)
- ✅ **1.4x faster than RxJS** for NestJS WebSocket simulation (1000 concurrent effects)
- ✅ **Faster than @preact/signals-core** on heavy graph updates

> Measured on Node.js v24.15.0 · Apple Silicon · April 2026
> 
> Source: [`benchmarks/`](./benchmarks) — run `cd benchmarks && npm start` to reproduce.

### 1. Basic Reads & Writes

| Library | ops/sec |
|---|---|
| RxJS `BehaviorSubject` + `getValue()` | 16,662,329 |
| **@demchenko.di/signals** `signal()` + `set()` | **4,715,875** |

### 2. Diamond Problem (Derived State)

| Library | ops/sec |
|---|---|
| RxJS `BehaviorSubject` + `combineLatest` | 871,323 |
| **@demchenko.di/signals** `signal` + `computed` | **1,228,103** ✅ 1.4× faster |

### 3. Dependency Graph Update (vs Competitors)

The main benchmark: create a diamond-shaped dependency graph (`a → b, c → d`) and batch 100 updates through it.

| Library | ops/sec | vs us |
|---|---|---|
| `@preact/signals-core` | 1,677,734 | 1.26× slower |
| `alien-signals` | 2,503,989 | 1.19× faster |
| **@demchenko.di/signals** | **2,105,284** | — |

### 4. NestJS WebSocket Simulation (1000 Subscriptions)

Simulates 1000 concurrent WebSocket connections reacting to a single signal update — a realistic server-side workload.

| Library | ops/sec |
|---|---|
| RxJS (1000 Subscriptions) | 39,527 |
| **@demchenko.di/signals** (1000 Effects) | **47,944** ✅ 1.2× faster |

### Architecture

The engine uses a **doubly-linked list** of `Link` nodes for dependency tracking instead of `Set`/`Map`. Each `Link` exists in two lists simultaneously (the producer's subscriber list and the consumer's dependency list), enabling O(1) subscribe/unsubscribe with **near-zero GC pressure**. During re-evaluation, existing link nodes are **reused** when the dependency graph is stable — making steady-state updates allocation-free.

## Usage

```ts
import { signal, computed, effect, batch } from "@demchenko.di/signals";

const count = signal(0);
const doubled = computed(() => count() * 2);
const readonlyCount = count.asReadonly();

const stop = effect(() => {
  console.log("count:", readonlyCount(), "doubled:", doubled());
});

batch(() => {
  count.set(1);
  count.update((value) => value + 1);
});

stop();
```

### Custom equality

```ts
import { signal } from "@demchenko.di/signals";

const user = signal({ id: 1, name: "Ada" }, {
  equal: (a, b) => a.id === b.id,
});

user.set({ id: 1, name: "Ada Lovelace" }); // skipped
user.set({ id: 2, name: "Grace" }); // notifies
```

### `linkedSignal`

```ts
import { signal, linkedSignal } from "@demchenko.di/signals";

const items = signal(["a", "b", "c"]);

const selection = linkedSignal<string[], string>({
  source: () => items(),
  computation: (nextItems, previous) => {
    if (previous && nextItems.includes(previous.value)) {
      return previous.value;
    }
    return nextItems[0];
  },
});
```

### `resource`

```ts
import { signal, resource } from "@demchenko.di/signals";

const userId = signal(1);

const user = resource({
  request: () => userId(),
  loader: async ({ request, abortSignal }) => {
    const response = await fetch(`https://example.com/users/${request}`, {
      signal: abortSignal,
    });
    return response.json();
  },
});

effect(() => {
  if (user.isLoading() && !user.hasValue()) {
    console.log("Loading initial user...");
    return;
  }

  if (user.isRefreshing()) {
    console.log("Refreshing user while keeping stale data visible");
  }
});
```

### `optimistic`

```ts
import { optimistic, signal } from "@demchenko.di/signals";

const serverLikes = signal(10);
const optimisticLikes = optimistic(serverLikes);

const tx = optimisticLikes.apply((value) => value + 1);

try {
  await api.like();
  tx.commit((value) => value + 1);
} catch {
  tx.rollback();
}
```

Use `optimistic()` for async writes that should feel immediate in the UI without mutating committed base state too early. It is especially useful for reactions, toggles, reordering, inline edits, and other mutation-heavy flows where rollback matters.

### `debounceSignal`

```ts
import { signal, effect, debounceSignal } from "@demchenko.di/signals";

const query = signal("");
const debouncedQuery = debounceSignal(query, 300);

effect(() => {
  // Only fires once the user stops typing for 300ms
  console.log("Search:", debouncedQuery());
});

query.set("h");
query.set("he");
query.set("hel");
query.set("hello");
// effect runs once with "hello" after 300ms of inactivity
```

`debounceSignal(source, ms)` returns a read-only signal that mirrors the source with a delay. The output only updates once the source has been stable (no new emissions) for `ms` milliseconds. This is useful for search inputs, resize/scroll handlers, and any scenario where you want to rate-limit reactive computations.

`hasPending()` and `pendingCount()` are regular read signals, so they can be used directly inside `computed()` and `effect()` for UI state:

```ts
import { computed, optimistic, signal } from "@demchenko.di/signals";

const serverLikes = signal(10);
const optimisticLikes = optimistic(serverLikes);

const canLike = computed(() => !optimisticLikes.hasPending());
const pendingLabel = computed(() =>
  optimisticLikes.hasPending()
    ? `Saving (${optimisticLikes.pendingCount()})...`
    : "Like",
);
```

### Read-only view

```ts
import { signal } from "@demchenko.di/signals";

const count = signal(0);
const readonlyCount = count.asReadonly();

readonlyCount(); // 0
count.set(1);
readonlyCount(); // 1
```

## Usage in Node.js & NestJS

While signals are typically associated with frontend frameworks, they are incredibly powerful for backend state management, particularly in Node.js and frameworks like NestJS. 

In a backend context, you often need to manage state *at a specific point in time* (e.g., "What is the current game score?", "Is maintenance mode active right now?"). While RxJS `BehaviorSubject` chains can handle this, they can become complex and prone to memory leaks if not unsubscribed carefully. Signals offer a much simpler, synchronous, and glitch-free alternative.

### Example 1: Real-Time Game Server (WebSockets)

If you are building a WebSocket gateway in NestJS, you need to manage complex, rapidly changing room or game state. Signals ensure that derived state is calculated efficiently and side-effects (like broadcasting to players) only happen when the underlying data *actually* changes.

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { signal, computed, effect } from '@demchenko.di/signals';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway()
export class GameRoomService implements OnModuleDestroy {
  @WebSocketServer() server: Server;

  private players = signal<Record<string, { name: string; score: number }>>({});
  private timeRemaining = signal(60);

  public isGameOver = computed(() => this.timeRemaining() <= 0);
  
  public leader = computed(() => {
    const p = this.players();
    return Object.values(p).sort((a, b) => b.score - a.score)[0]?.name;
  });

  private stopEffect: () => void;
  private timer: NodeJS.Timeout;

  constructor() {
    this.stopEffect = effect(() => {
      if (this.isGameOver()) {
        this.server.emit('game_over', { 
          winner: this.leader(),
          finalScores: this.players() 
        });
      }
    });

    this.timer = setInterval(() => {
      this.timeRemaining.update(time => Math.max(0, time - 1));
    }, 1000);
  }

  onModuleDestroy() {
    this.stopEffect();
    clearInterval(this.timer);
  }

  addScore(playerId: string, points: number) {
    this.players.update(p => ({
      ...p,
      [playerId]: { 
        ...p[playerId], 
        score: (p[playerId]?.score || 0) + points 
      }
    }));
  }
}
```

### Example 2: Reactive Database Configuration (Mongoose Change Streams)

Instead of writing complex polling loops, you can combine signals with MongoDB Change Streams. When a document updates in the database, the signal updates, dependent computations re-run lazily, and side-effects trigger automatically. Other NestJS services simply read the `computed` signals synchronously and always get the freshest value.

```typescript
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { signal, computed, effect } from '@demchenko.di/signals';
import { Config, ConfigDocument } from './config.schema';

@Injectable()
export class ConfigService implements OnModuleDestroy {
  private readonly logger = new Logger(ConfigService.name);

  private rawConfig = signal({ maintenanceMode: false, rateLimit: 100 });

  public isMaintenanceMode = computed(() => this.rawConfig().maintenanceMode);
  public currentRateLimit = computed(() => this.rawConfig().rateLimit);

  private stopEffect: () => void;

  constructor(
    @InjectModel(Config.name) private configModel: Model<ConfigDocument>
  ) {
    this.stopEffect = effect(() => {
      if (this.isMaintenanceMode()) {
        this.logger.warn('⚠️ SYSTEM ENTERED MAINTENANCE MODE ⚠️');
      } else {
        this.logger.log('✅ System operating normally.');
      }
    });

    this.watchDatabaseChanges();
  }

  onModuleDestroy() {
    this.stopEffect();
  }

  private async watchDatabaseChanges() {
    const initialConfig = await this.configModel.findOne().lean();
    if (initialConfig) {
      this.rawConfig.set({ 
        maintenanceMode: initialConfig.maintenanceMode, 
        rateLimit: initialConfig.rateLimit 
      });
    }

    this.configModel.watch().on('change', async (change) => {
      if (change.operationType === 'update' || change.operationType === 'replace') {
        const updatedConfig = await this.configModel.findOne().lean();
        if (updatedConfig) {
          this.rawConfig.set({ 
            maintenanceMode: updatedConfig.maintenanceMode, 
            rateLimit: updatedConfig.rateLimit 
          });
        }
      }
    });
  }
}
```

### Example 3: Express / Fastify Request Caching

You can use signals to memoize expensive operations across HTTP requests in standard Node.js applications.

```typescript
import express from 'express';
import { signal, computed } from '@demchenko.di/signals';

const app = express();

const databaseRecords = signal([{ id: 1, value: 100 }, { id: 2, value: 250 }]);

const expensiveTotal = computed(() => {
  console.log("Running expensive calculation...");
  return databaseRecords().reduce((sum, record) => sum + record.value, 0);
});

app.get('/api/total', (req, res) => {
  res.json({ total: expensiveTotal() });
});
```

## API

The package exports:

- `signal`
- `computed`
- `effect`
- `EffectOptions`
- `batch`
- `untracked`
- `isSignal`
- `linkedSignal`
- `optimistic`
- `resource`
- `debounceSignal`

### `batch()` and Async Execution

**Important:** `batch()` is strictly synchronous. It works by temporarily pausing effect execution and flushing them once the provided function completes. 

You should **never** use `await` inside a `batch()` block.

**❌ Incorrect:**
```typescript
batch(async () => {
  state.set('loading');
  await fetch('/api/data'); // ⚠️ The batch ends immediately here!
  state.set('success');     // This executes outside the batch.
});
```

**✅ Correct:**
```typescript
state.set('loading');
await fetch('/api/data');

// Batch only the synchronous mutations
batch(() => {
  state.set('success');
  data.set(newData);
});
```
*Note: The library will now throw a `console.warn` if you accidentally return a Promise from inside a `batch()`.*

### `optimistic` helpers

- `optimistic(source)` creates a projected signal layered on top of a writable base signal.
- `apply(patch)` adds a pending optimistic layer and returns a transaction with `commit()` and `rollback()`.
- `hasPending()` is `true` while one or more optimistic layers are active.
- `pendingCount()` is the number of active optimistic layers.
- `clear()` removes all optimistic layers.
- `commit(nextBase?)` removes the layer and optionally writes a final value or updater into the base signal.
- `rollback()` removes the layer without touching the base signal.

Because `hasPending()` and `pendingCount()` are read signals, they compose naturally with `computed()` for disabled buttons, loading labels, and mutation-aware UI state.

Optimistic layers always rebase on top of the latest base signal value. If the server updates the underlying state while a mutation is pending, the optimistic projection recalculates from the new base value automatically.

### `resource` state helpers

- `hasValue()` is `true` after the resource has produced or been assigned a value, even if that value is `undefined`.
- `isLoading()` is `true` whenever a request is in flight.
- `isRefreshing()` is `true` when a request is in flight and the resource is still holding a previous value.

### `effect` options

```ts
import { effect } from "@demchenko.di/signals";

const stop = effect(() => {
  // ...
}, {
  allowSignalWrites: true,
  manualCleanup: true,
  scheduler: (run) => queueMicrotask(run),
});
```

- `allowSignalWrites` defaults to `true`. Set it to `false` to throw on signal writes from the effect or its cleanup.
- `manualCleanup` is accepted for compatibility with owner-scoped effect APIs. In this library, effects are always disposed manually via the function returned from `effect()`.
- `scheduler` customizes reruns after invalidation. The first effect run still happens synchronously.

## Development

```bash
npm install
npm run check
npm run build
```
