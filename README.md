# signals

Zero-dependency reactive signals for TypeScript and JavaScript, with an API and mental model similar to Angular Signals: writable signals, computed values, effects, batching, and dependency tracking with lazy recomputation.

Package: https://www.npmjs.com/package/@demchenko.di/signals

Demo: https://dmytrodemchenko.github.io/Signals/demo/

## Install

```bash
npm install @demchenko.di/signals
```

## Features

- Small core API: `signal`, `computed`, `effect`, `batch`, `untracked`
- Extra primitives: `linkedSignal`, `resource`, `optimistic`
- No runtime dependencies
- Typed public API with generated `.d.ts` files

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
