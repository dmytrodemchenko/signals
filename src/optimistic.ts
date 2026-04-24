import { batch, computed, signal, type ReadSignal, type WriteSignal } from "./signals.js";

export type OptimisticPatch<T> = T | ((current: T) => T);

export interface OptimisticTransaction<T> {
  readonly id: number;
  commit(nextBase?: OptimisticPatch<T>): void;
  rollback(): void;
}

export interface OptimisticSignal<T> extends ReadSignal<T> {
  readonly hasPending: ReadSignal<boolean>;
  readonly pendingCount: ReadSignal<number>;
  apply(patch: OptimisticPatch<T>): OptimisticTransaction<T>;
  clear(): void;
}

interface OptimisticLayer<T> {
  id: number;
  apply: (current: T) => T;
}

function toUpdater<T>(patch: OptimisticPatch<T>): (current: T) => T {
  return typeof patch === "function" ? (patch as (current: T) => T) : () => patch;
}

function applyToSignal<T>(target: WriteSignal<T>, patch: OptimisticPatch<T>) {
  if (typeof patch === "function") {
    target.update(patch as (current: T) => T);
    return;
  }
  target.set(patch);
}

export function optimistic<T>(source: WriteSignal<T>): OptimisticSignal<T> {
  const layers = signal<OptimisticLayer<T>[]>([]);
  const hasPending = computed(() => layers().length > 0);
  const pendingCount = computed(() => layers().length);

  let nextId = 1;

  const value = computed(() => {
    let current = source();
    for (const layer of layers()) {
      current = layer.apply(current);
    }
    return current;
  });

  const removeLayer = (id: number): boolean => {
    const before = layers();
    const next = before.filter((layer) => layer.id !== id);
    if (next.length === before.length) {
      return false;
    }
    layers.set(next);
    return true;
  };

  const read = value as OptimisticSignal<T>;

  Object.defineProperties(read, {
    hasPending: {
      value: hasPending,
      enumerable: true,
    },
    pendingCount: {
      value: pendingCount,
      enumerable: true,
    },
  });
  read.apply = (patch) => {
    const id = nextId++;
    const layer: OptimisticLayer<T> = { id, apply: toUpdater(patch) };

    layers.update((current) => [...current, layer]);

    let settled = false;

    return {
      id,
      commit(...args) {
        if (settled) {
          return;
        }
        settled = true;

        batch(() => {
          const removed = removeLayer(id);
          if (removed && args.length > 0) {
            applyToSignal(source, args[0] as OptimisticPatch<T>);
          }
        });
      },
      rollback() {
        if (settled) {
          return;
        }
        settled = true;
        removeLayer(id);
      },
    };
  };
  read.clear = () => {
    layers.set([]);
  };

  return read;
}
