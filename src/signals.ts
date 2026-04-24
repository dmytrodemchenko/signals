/**
 * Zero-dependency reactive Signals.
 *
 * Push-pull engine: writes mark dependents dirty (push); reads validate
 * lazily by walking dependency versions (pull). Effects are scheduled and
 * flushed once per microtask / batch end, so updates are glitch-free.
 */

const SIGNAL_BRAND: unique symbol = Symbol('sigil.signal');

interface SignalBrand {
  readonly [SIGNAL_BRAND]: true;
}

export type ReadSignal<T> = {
  (): T;
} & SignalBrand;

export type WriteSignal<T> = ReadSignal<T> & {
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  mutate(mutator: (current: T) => void): void;
  asReadonly(): ReadSignal<T>;
};

export type ValueEqualityFn<T> = (a: T, b: T) => boolean;

export interface SignalOptions<T> {
  /**
   * Custom equality used by `set()` and `update()` to decide whether a write
   * should notify dependents. Defaults to `Object.is`.
   */
  equal?: ValueEqualityFn<T>;
}

export interface EffectOptions {
  /**
   * When false, signal writes performed by this effect or its cleanup throw.
   * Defaults to true.
   */
  allowSignalWrites?: boolean;
  /**
   * Compatibility option for owner-scoped effect APIs. Effects in this library
   * are always disposed manually via the function returned from `effect()`.
   */
  manualCleanup?: boolean;
  /**
   * Custom rerun scheduler. The initial run is still synchronous; the
   * scheduler only controls invalidated reruns.
   */
  scheduler?: (run: () => void) => void;
}

export const NodeState = {
  Clean: 0,
  Check: 1,
  Dirty: 2,
} as const;

export type NodeState = (typeof NodeState)[keyof typeof NodeState];

type Subscriber = ComputedNode<unknown> | EffectNode;
type Producer = SignalNode<unknown> | ComputedNode<unknown>;

interface SignalNode<T> {
  kind: 'signal';
  value: T;
  version: number;
  subscribers: Set<Subscriber>;
}

interface ComputedNode<T> {
  kind: 'computed';
  fn: () => T;
  value: T | undefined;
  version: number;
  state: NodeState;
  computing: boolean;
  dependencies: Map<Producer, number>;
  subscribers: Set<Subscriber>;
}

interface EffectNode {
  kind: 'effect';
  fn: () => void | (() => void);
  cleanup: void | (() => void);
  dependencies: Map<Producer, number>;
  state: NodeState;
  scheduled: boolean;
  disposed: boolean;
  allowSignalWrites: boolean;
  scheduler?: (run: () => void) => void;
}

let activeSubscriber: Subscriber | null = null;
let activeSignalWritesAllowed = true;
let batchDepth = 0;
const pendingEffects = new Set<EffectNode>();

function brand<T extends (...args: never[]) => unknown>(target: T): T & SignalBrand {
  Object.defineProperty(target, SIGNAL_BRAND, { value: true });
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
      dispatchEffect(e);
    }
  }
}

function dispatchEffect(node: EffectNode) {
  if (node.disposed || !node.scheduled) {
    return;
  }
  if (node.scheduler) {
    node.scheduler(() => {
      if (node.disposed || !node.scheduled) {
        return;
      }
      node.scheduled = false;
      runEffect(node);
      if (batchDepth === 0) {
        flushEffects();
      }
    });
    return;
  }
  node.scheduled = false;
  runEffect(node);
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
    notifySubscriber(sub, node.kind === 'signal' ? NodeState.Dirty : NodeState.Check);
  }
}

function notifySubscriber(sub: Subscriber, state: NodeState) {
  if (sub.state >= state) {
    return;
  }

  sub.state = state;

  if (sub.kind === 'computed') {
    for (const dependent of Array.from(sub.subscribers)) {
      notifySubscriber(dependent, NodeState.Check);
    }
  } else {
    scheduleEffect(sub);
  }
}

function clearDependencies(sub: ComputedNode<unknown> | EffectNode) {
  for (const dep of sub.dependencies.keys()) {
    dep.subscribers.delete(sub);
  }
  sub.dependencies.clear();
}

function assertSignalWritesAllowed() {
  if (!activeSignalWritesAllowed) {
    throw new Error('Signal writes are not allowed in this effect.');
  }
}

function withSignalWritesAllowed<T>(allowed: boolean, fn: () => T): T {
  const prev = activeSignalWritesAllowed;
  activeSignalWritesAllowed = allowed;
  try {
    return fn();
  } finally {
    activeSignalWritesAllowed = prev;
  }
}

export function signal<T>(initial: T, options: SignalOptions<T> = {}): WriteSignal<T> {
  const node: SignalNode<T> = {
    kind: 'signal',
    value: initial,
    version: 0,
    subscribers: new Set(),
  };
  const isEqual = options.equal ?? (Object.is as ValueEqualityFn<T>);

  const read = brand<() => T>(() => {
    trackRead(node);
    return node.value;
  }) as WriteSignal<T>;
  const readonlyView = brand<() => T>(() => {
    trackRead(node);
    return node.value;
  });

  read.set = (next) => {
    assertSignalWritesAllowed();
    if (isEqual(next, node.value)) {
      return;
    }
    node.value = next;
    node.version++;
    notifySubscribers(node);
    if (batchDepth === 0) {
      flushEffects();
    }
  };

  read.update = (updater) => {
    assertSignalWritesAllowed();
    const next = updater(node.value);
    if (isEqual(next, node.value)) {
      return;
    }
    node.value = next;
    node.version++;
    notifySubscribers(node);
    if (batchDepth === 0) {
      flushEffects();
    }
  };

  read.mutate = (mutator) => {
    assertSignalWritesAllowed();
    mutator(node.value);
    node.version++;
    notifySubscribers(node);
    if (batchDepth === 0) {
      flushEffects();
    }
  };

  read.asReadonly = () => readonlyView;

  return read;
}

export function computed<T>(fn: () => T): ReadSignal<T> {
  const node: ComputedNode<T> = {
    kind: 'computed',
    fn,
    value: undefined,
    version: 0,
    state: NodeState.Dirty,
    computing: false,
    dependencies: new Map(),
    subscribers: new Set(),
  };

  return brand<() => T>(() => {
    if (node.computing) {
      throw new Error('Detected cycle in computed signal.');
    }

    if (node.state === NodeState.Check) {
      if (depsAreFresh(node)) {
        node.state = NodeState.Clean;
      } else {
        node.state = NodeState.Dirty;
      }
    }

    if (node.state === NodeState.Dirty) {
      recompute(node);
    }

    trackRead(node);
    return node.value as T;
  });
}

function depsAreFresh(node: ComputedNode<unknown> | EffectNode): boolean {
  for (const [dep, seenVersion] of node.dependencies) {
    if (dep.kind === 'computed') {
      if (dep.state === NodeState.Check) {
        if (depsAreFresh(dep)) {
          dep.state = NodeState.Clean;
        } else {
          dep.state = NodeState.Dirty;
        }
      }

      if (dep.state === NodeState.Dirty) {
        recompute(dep);
      }
    }

    if (dep.version !== seenVersion) {
      return false;
    }
  }
  return true;
}

function recompute<T>(node: ComputedNode<T>) {
  const prev = activeSubscriber;
  clearDependencies(node);
  activeSubscriber = node;
  node.computing = true;
  try {
    const next = node.fn();
    if (node.version === 0 || !Object.is(next, node.value)) {
      node.value = next;
      node.version++;
    }
  } finally {
    node.computing = false;
    node.state = NodeState.Clean;
    activeSubscriber = prev;
  }
}

export function effect(fn: () => void | (() => void), options: EffectOptions = {}): () => void {
  const node: EffectNode = {
    kind: 'effect',
    fn,
    cleanup: undefined,
    dependencies: new Map(),
    state: NodeState.Dirty,
    scheduled: false,
    disposed: false,
    allowSignalWrites: options.allowSignalWrites ?? true,
    scheduler: options.scheduler,
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
  if (typeof node.cleanup !== 'function') {
    return;
  }
  try {
    withSignalWritesAllowed(node.allowSignalWrites, () => node.cleanup?.());
  } catch (err) {
    console.error('[signals] effect cleanup threw:', err);
  }
  node.cleanup = undefined;
}

function runEffect(node: EffectNode) {
  if (node.state === NodeState.Clean) {
    return;
  }

  if (node.state === NodeState.Check) {
    if (depsAreFresh(node)) {
      node.state = NodeState.Clean;
      return;
    } else {
      node.state = NodeState.Dirty;
    }
  }

  if (node.state !== NodeState.Dirty) {
    return;
  }

  runCleanup(node);
  const prev = activeSubscriber;
  clearDependencies(node);
  activeSubscriber = node;
  try {
    const result = withSignalWritesAllowed(node.allowSignalWrites, () => node.fn());
    if (typeof result === 'function') {
      node.cleanup = result;
    }
  } finally {
    node.state = NodeState.Clean;
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
  return typeof value === 'function' && SIGNAL_BRAND in value;
}
