/**
 * linkedSignal — writable signal derived from a source. Re-derives whenever
 * the source changes, discarding any local override. The object form exposes
 * the previous { source, value } so consumers can reconcile state across
 * source changes (e.g. preserve a selection when the underlying list mutates).
 */
import { signal, computed, effect, untracked, type WriteSignal } from "./signals.js";

export type LinkedSignal<T> = WriteSignal<T>;

export interface LinkedSignalOptions<S, T> {
  source: () => S;
  computation: (source: S, previous?: { source: S; value: T }) => T;
  equal?: (a: T, b: T) => boolean;
}

export function linkedSignal<T>(computation: () => T): LinkedSignal<T>;
export function linkedSignal<S, T>(options: LinkedSignalOptions<S, T>): LinkedSignal<T>;
export function linkedSignal<S, T>(
  arg: (() => T) | LinkedSignalOptions<S, T>,
): LinkedSignal<T> {
  const opts: LinkedSignalOptions<unknown, T> =
    typeof arg === "function"
      ? { source: arg as () => unknown, computation: (s) => s as unknown as T }
      : (arg as LinkedSignalOptions<unknown, T>);

  const equal = opts.equal ?? Object.is;
  const sourceSignal = computed(opts.source);

  const initialSource = sourceSignal();
  const initialValue = opts.computation(initialSource, undefined);
  let prev: { source: unknown; value: T } = { source: initialSource, value: initialValue };

  const store = signal<T>(initialValue);

  let firstRun = true;
  effect(() => {
    const s = sourceSignal();
    if (firstRun) {
      firstRun = false;
      return;
    }
    const next = untracked(() => opts.computation(s, prev));
    prev = { source: s, value: next };
    if (!equal(next, untracked(store))) {
      store.set(next);
    }
  });

  const originalSet = store.set;
  const originalUpdate = store.update;

  store.set = (next) => {
    prev = { source: prev.source, value: next };
    originalSet(next);
  };
  store.update = (updater) => {
    originalUpdate((curr) => {
      const next = updater(curr);
      prev = { source: prev.source, value: next };
      return next;
    });
  };

  return store;
}
