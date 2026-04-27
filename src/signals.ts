/**
 * Zero-dependency reactive Signals with linked-list dependency tracking.
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
  /** Custom equality for `set()` / `update()`. Defaults to `Object.is`. */
  equal?: ValueEqualityFn<T>;
}

export interface EffectOptions {
  allowSignalWrites?: boolean;
  manualCleanup?: boolean;
  scheduler?: (run: () => void) => void;
}

export const NodeState = {
  Clean: 0,
  Check: 1,
  Dirty: 2,
} as const;

export type NodeState = (typeof NodeState)[keyof typeof NodeState];

const NodeKind = {
  Signal: 'signal',
  Computed: 'computed',
  Effect: 'effect',
} as const;

type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

const CLEAN = 0;
const PENDING = 1;
const DIRTY = 2;
const COMPUTING = 4;

import { isFunction, isThenable } from './utils.js';

interface Link {
  dep: ProducerNode;
  sub: SubscriberNode;
  version: number;
  prevSub: Link | undefined;
  nextSub: Link | undefined;
  prevDep: Link | undefined;
  nextDep: Link | undefined;
}

type SubscriberNode = ComputedNode<unknown> | EffectNode;
type ProducerNode = SignalNode<unknown> | ComputedNode<unknown>;

interface SignalNode<T> {
  kind: typeof NodeKind.Signal;
  value: T;
  version: number;
  subs: Link | undefined;
  subsTail: Link | undefined;
}

interface ComputedNode<T> {
  kind: typeof NodeKind.Computed;
  fn: () => T;
  value: T | undefined;
  version: number;
  flags: number;
  deps: Link | undefined;
  depsTail: Link | undefined;
  subs: Link | undefined;
  subsTail: Link | undefined;
}

interface EffectNode {
  kind: typeof NodeKind.Effect;
  fn: () => void | (() => void);
  cleanup: void | (() => void);
  flags: number;
  deps: Link | undefined;
  depsTail: Link | undefined;
  scheduled: boolean;
  disposed: boolean;
  allowSignalWrites: boolean;
  scheduler?: (run: () => void) => void;
  nextPending: EffectNode | null;
}

let activeSubscriber: SubscriberNode | null = null;
let activeSignalWritesAllowed = true;
let batchDepth = 0;
let pendingHead: EffectNode | null = null;
let pendingTail: EffectNode | null = null;

function brand<T extends (...args: never[]) => unknown>(target: T): T & SignalBrand {
  Object.defineProperty(target, SIGNAL_BRAND, { value: true });
  return target as T & SignalBrand;
}

function linkDepSub(dep: ProducerNode, sub: SubscriberNode): void {
  const prevDep = sub.depsTail;

  if (prevDep !== undefined && prevDep.dep === dep) {
    return;
  }

  const nextDep = prevDep !== undefined ? prevDep.nextDep : sub.deps;
  if (nextDep !== undefined && nextDep.dep === dep) {
    nextDep.version = dep.version;
    sub.depsTail = nextDep;
    return;
  }

  const prevSub = dep.subsTail;
  const newLink: Link = {
    dep,
    sub,
    version: dep.version,
    prevSub,
    nextSub: undefined,
    prevDep,
    nextDep,
  };

  if (nextDep !== undefined) {
    nextDep.prevDep = newLink;
  }
  if (prevDep !== undefined) {
    prevDep.nextDep = newLink;
  } else {
    sub.deps = newLink;
  }
  sub.depsTail = newLink;

  if (prevSub !== undefined) {
    prevSub.nextSub = newLink;
  } else {
    dep.subs = newLink;
  }
  dep.subsTail = newLink;
}

function unlinkFromSubs(link: Link): void {
  const { dep, prevSub, nextSub } = link;

  if (prevSub !== undefined) {
    prevSub.nextSub = nextSub;
  } else {
    dep.subs = nextSub;
  }

  if (nextSub !== undefined) {
    nextSub.prevSub = prevSub;
  } else {
    dep.subsTail = prevSub;
  }
}

function purgeDeps(sub: SubscriberNode): void {
  const tail = sub.depsTail;
  let link = tail !== undefined ? tail.nextDep : sub.deps;

  while (link !== undefined) {
    const next = link.nextDep;
    unlinkFromSubs(link);
    link = next;
  }

  if (tail !== undefined) {
    tail.nextDep = undefined;
  } else {
    sub.deps = undefined;
  }
}

function scheduleEffect(e: EffectNode): void {
  if (e.disposed || e.scheduled) {
    return;
  }
  e.scheduled = true;
  e.nextPending = null;
  if (pendingTail !== null) {
    pendingTail.nextPending = e;
  } else {
    pendingHead = e;
  }
  pendingTail = e;
  if (batchDepth === 0) {
    flushEffects();
  }
}

function flushEffects(): void {
  while (pendingHead !== null) {
    const e = pendingHead;
    pendingHead = e.nextPending;
    if (pendingHead === null) {
      pendingTail = null;
    }
    e.nextPending = null;
    dispatchEffect(e);
  }
}

function dispatchEffect(node: EffectNode): void {
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

function trackRead(node: ProducerNode): void {
  if (activeSubscriber === null) {
    return;
  }
  linkDepSub(node, activeSubscriber);
}

function notifySubscribers(node: ProducerNode): void {
  let link = node.subs;
  while (link !== undefined) {
    notifySubscriber(
      link.sub,
      node.kind === NodeKind.Signal ? DIRTY : PENDING,
    );
    link = link.nextSub;
  }
}

function notifySubscriber(sub: SubscriberNode, flag: number): void {
  if (sub.flags >= flag) {
    return;
  }

  sub.flags = flag;

  if (sub.kind === NodeKind.Computed) {
    let link = sub.subs;
    while (link !== undefined) {
      notifySubscriber(link.sub, PENDING);
      link = link.nextSub;
    }
  } else {
    scheduleEffect(sub);
  }
}

function clearDependencies(sub: SubscriberNode): void {
  let link = sub.deps;
  while (link !== undefined) {
    const next = link.nextDep;
    unlinkFromSubs(link);
    link = next;
  }
  sub.deps = undefined;
  sub.depsTail = undefined;
}

function assertSignalWritesAllowed(): void {
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
    kind: NodeKind.Signal,
    value: initial,
    version: 0,
    subs: undefined,
    subsTail: undefined,
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
    kind: NodeKind.Computed,
    fn,
    value: undefined,
    version: 0,
    flags: DIRTY,
    deps: undefined,
    depsTail: undefined,
    subs: undefined,
    subsTail: undefined,
  };

  return brand<() => T>(() => {
    if (node.flags & COMPUTING) {
      throw new Error('Detected cycle in computed signal.');
    }

    if (node.flags === PENDING) {
      if (depsAreFresh(node)) {
        node.flags = CLEAN;
      } else {
        node.flags = DIRTY;
      }
    }

    if (node.flags & DIRTY) {
      recompute(node);
    }

    trackRead(node);
    return node.value as T;
  });
}

function depsAreFresh(node: ComputedNode<unknown> | EffectNode): boolean {
  let link = node.deps;
  while (link !== undefined) {
    const dep = link.dep;
    if (dep.kind === NodeKind.Computed) {
      if (dep.flags === PENDING) {
        if (depsAreFresh(dep)) {
          dep.flags = CLEAN;
        } else {
          dep.flags = DIRTY;
        }
      }

      if (dep.flags & DIRTY) {
        recompute(dep);
      }
    }

    if (dep.version !== link.version) {
      return false;
    }
    link = link.nextDep;
  }
  return true;
}

function recompute<T>(node: ComputedNode<T>): void {
  const prev = activeSubscriber;
  node.depsTail = undefined;
  activeSubscriber = node;
  node.flags = COMPUTING;
  try {
    const next = node.fn();
    if (node.version === 0 || !Object.is(next, node.value)) {
      node.value = next;
      node.version++;
    }
  } finally {
    node.flags = CLEAN;
    activeSubscriber = prev;
    purgeDeps(node);
  }
}

export function effect(fn: () => void | (() => void), options: EffectOptions = {}): () => void {
  const node: EffectNode = {
    kind: NodeKind.Effect,
    fn,
    cleanup: undefined,
    flags: DIRTY,
    deps: undefined,
    depsTail: undefined,
    scheduled: false,
    disposed: false,
    allowSignalWrites: options.allowSignalWrites ?? true,
    scheduler: options.scheduler,
    nextPending: null,
  };
  runEffect(node);
  return () => {
    if (node.disposed) return;
    node.disposed = true;
    runCleanup(node);
    clearDependencies(node);
    removeFromPendingQueue(node);
  };
}

function removeFromPendingQueue(node: EffectNode): void {
  if (!node.scheduled) return;
  node.scheduled = false;

  let prev: EffectNode | null = null;
  let cur = pendingHead;
  while (cur !== null) {
    if (cur === node) {
      if (prev !== null) {
        prev.nextPending = cur.nextPending;
      } else {
        pendingHead = cur.nextPending;
      }
      if (cur === pendingTail) {
        pendingTail = prev;
      }
      cur.nextPending = null;
      return;
    }
    prev = cur;
    cur = cur.nextPending;
  }
}

function runCleanup(node: EffectNode): void {
  if (!isFunction(node.cleanup)) {
    return;
  }
  try {
    withSignalWritesAllowed(node.allowSignalWrites, () => node.cleanup?.());
  } catch (err) {
    console.error('[signals] effect cleanup threw:', err);
  }
  node.cleanup = undefined;
}

function runEffect(node: EffectNode): void {
  if (node.flags === CLEAN) {
    return;
  }

  if (node.flags === PENDING) {
    if (depsAreFresh(node)) {
      node.flags = CLEAN;
      return;
    } else {
      node.flags = DIRTY;
    }
  }

  if (!(node.flags & DIRTY)) {
    return;
  }

  runCleanup(node);
  const prev = activeSubscriber;
  node.depsTail = undefined;
  activeSubscriber = node;
  try {
    const result = withSignalWritesAllowed(node.allowSignalWrites, () => node.fn());
    if (isFunction(result)) {
      node.cleanup = result;
    }
  } finally {
    node.flags = CLEAN;
    activeSubscriber = prev;
    purgeDeps(node);
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    const result = fn();
    if (isThenable(result)) {
      console.warn(
        '[signals] Warning: batch() was called with an async function. ' +
        'Batching is strictly synchronous. Any signal mutations after an "await" ' +
        'will not be batched.'
      );
    }
    return result;
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
  return isFunction(value) && SIGNAL_BRAND in value;
}
