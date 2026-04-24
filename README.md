# signals

Zero-dependency reactive signals for TypeScript and JavaScript, with an API and mental model similar to Angular Signals: writable signals, computed values, effects, batching, and dependency tracking with lazy recomputation.

Package: https://www.npmjs.com/package/@demchenko.di/signals

## Install

```bash
npm install @demchenko.di/signals
```

## Features

- Small core API: `signal`, `computed`, `effect`, `batch`, `untracked`
- Extra primitives: `linkedSignal`, `resource`
- No runtime dependencies
- Typed public API with generated `.d.ts` files

## Usage

```ts
import { signal, computed, effect, batch } from "@demchenko.di/signals";

const count = signal(0);
const doubled = computed(() => count() * 2);

const stop = effect(() => {
  console.log("count:", count(), "doubled:", doubled());
});

batch(() => {
  count.set(1);
  count.update((value) => value + 1);
});

stop();
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
- `resource`

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
