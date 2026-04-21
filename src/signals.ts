/**
 * Zero-dependency reactive Signals.
 *
 * Push-pull engine: writes mark dependents dirty (push); reads validate
 * lazily by walking dependency versions (pull). Effects are scheduled and
 * flushed once per microtask / batch end, so updates are glitch-free.
 */

const SIGNAL_BRAND: unique symbol = Symbol("sigil.signal");

type SignalBrand = { readonly [SIGNAL_BRAND]: true };

export type ReadSignal<T> = {
  (): T;
} & SignalBrand;

export type WriteSignal<T> = ReadSignal<T> & {
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  mutate(mutator: (current: T) => void): void;
};

type Subscriber = ComputedNode<unknown> | EffectNode;
type Producer = SignalNode<unknown> | ComputedNode<unknown>;

interface SignalNode<T> {
  kind: "signal";
  value: T;
  version: number;
  subscribers: Set<Subscriber>;
}

interface ComputedNode<T> {
  kind: "computed";
  fn: () => T;
  value: T | undefined;
  version: number;
  dirty: boolean;
  computing: boolean;
  dependencies: Map<Producer, number>;
  subscribers: Set<Subscriber>;
}

interface EffectNode {
  kind: "effect";
  fn: () => void | (() => void);
  cleanup: void | (() => void);
  dependencies: Map<Producer, number>;
  scheduled: boolean;
  disposed: boolean;
}

let activeSubscriber: Subscriber | null = null;
let batchDepth = 0;
const pendingEffects = new Set<EffectNode>();

function brand<T extends (...args: never[]) => unknown>(target: T): T & SignalBrand {
  Object.defineProperty(target, SIGNAL_BRAND, {value: true});
  return target as T & SignalBrand;
}

function scheduleEffect(e: EffectNode) {
  if (e.disposed || e.scheduled) {
    return;
  }
  e.scheduled = true;
  pendingEffects.add(e);
  if (batchDepth === 0) {
    flushEffects();
  }
}

function flushEffects() {
  while (pendingEffects.size > 0) {
    const batch = Array.from(pendingEffects);
    pendingEffects.clear();
    for (const e of batch) {
      e.scheduled = false;
      if (!e.disposed) {
        runEffect(e);
      }
    }
  }
}

function trackRead(node: Producer) {
  if (!activeSubscriber) {
    return;
  }
  activeSubscriber.dependencies.set(node, node.version);
  node.subscribers.add(activeSubscriber);
}

function notifySubscribers(node: Producer) {
  for (const sub of Array.from(node.subscribers)) {
    if (sub.kind === "computed") {
      if (!sub.dirty) {
        sub.dirty = true;
        notifySubscribers(sub);
      }
    } else {
      scheduleEffect(sub);
    }
  }
}

function clearDependencies(sub: ComputedNode<unknown> | EffectNode) {
  for (const dep of sub.dependencies.keys()) {
    dep.subscribers.delete(sub);
  }
  sub.dependencies.clear();
}

export function signal<T>(initial: T): WriteSignal<T> {
  const node: SignalNode<T> = {
    kind: "signal",
    value: initial,
    version: 0,
    subscribers: new Set(),
  };

  const read = brand<() => T>(function read() {
    trackRead(node as SignalNode<unknown>);
    return node.value;
  }) as WriteSignal<T>;

  read.set = (next) => {
    if (Object.is(next, node.value)) {
      return;
    }
    node.value = next;
    node.version++;
    notifySubscribers(node as SignalNode<unknown>);
    if (batchDepth === 0) {
      flushEffects();
    }
  };

  read.update = (updater) => read.set(updater(node.value));

  read.mutate = (mutator) => {
    mutator(node.value);
    node.version++;
    notifySubscribers(node as SignalNode<unknown>);
    if (batchDepth === 0) {
      flushEffects();
    }
  };

  return read;
}

export function computed<T>(fn: () => T): ReadSignal<T> {
  const node: ComputedNode<T> = {
    kind: "computed",
    fn,
    value: undefined,
    version: 0,
    dirty: true,
    computing: false,
    dependencies: new Map(),
    subscribers: new Set(),
  };

  return brand<() => T>(function read() {
    if (node.computing) {
      throw new Error("Detected cycle in computed signal.");
    }
    if (node.dirty || !depsAreFresh(node)) {
      recompute(node);
    }
    trackRead(node as ComputedNode<unknown>);
    return node.value as T;
  }) as ReadSignal<T>;
}

function depsAreFresh(node: ComputedNode<unknown>): boolean {
  for (const [dep, seenVersion] of node.dependencies) {
    if (dep.kind === "computed" && (dep.dirty || !depsAreFresh(dep))) {
      recompute(dep);
    }
    if (dep.version !== seenVersion) {
      return false;
    }
  }
  return true;
}

function recompute<T>(node: ComputedNode<T>) {
  const prev = activeSubscriber;
  clearDependencies(node as ComputedNode<unknown>);
  activeSubscriber = node as ComputedNode<unknown>;
  node.computing = true;
  try {
    const next = node.fn();
    if (node.version === 0 || !Object.is(next, node.value)) {
      node.value = next;
      node.version++;
    }
  } finally {
    node.computing = false;
    node.dirty = false;
    activeSubscriber = prev;
  }
}

export function effect(fn: () => void | (() => void)): () => void {
  const node: EffectNode = {
    kind: "effect",
    fn,
    cleanup: undefined,
    dependencies: new Map(),
    scheduled: false,
    disposed: false,
  };
  runEffect(node);
  return () => {
    if (node.disposed) return;
    node.disposed = true;
    runCleanup(node);
    clearDependencies(node);
    pendingEffects.delete(node);
  };
}

function runCleanup(node: EffectNode) {
  if (typeof node.cleanup !== "function") {
    return;
  }
  try {
    node.cleanup();
  } catch (err) {
    console.error("[signals] effect cleanup threw:", err);
  }
  node.cleanup = undefined;
}

function runEffect(node: EffectNode) {
  runCleanup(node);
  const prev = activeSubscriber;
  clearDependencies(node);
  activeSubscriber = node;
  try {
    const result = node.fn();
    if (typeof result === "function") {
      node.cleanup = result;
    }
  } finally {
    activeSubscriber = prev;
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushEffects();
    }
  }
}

export function untracked<T>(fn: () => T): T {
  const prev = activeSubscriber;
  activeSubscriber = null;
  try {
    return fn();
  } finally {
    activeSubscriber = prev;
  }
}

export function isSignal<T = unknown>(value: unknown): value is ReadSignal<T> {
  return typeof value === "function" && SIGNAL_BRAND in value;
}
