/**
 * resource — reactive async loader. Re-runs whenever `request()` changes;
 * stale loads are aborted via AbortSignal. Exposes value/error/status as
 * read signals plus imperative set/update/reload/destroy.
 */
import { signal, computed, effect, untracked, type ReadSignal } from "./signals.js";

export type ResourceStatus = "idle" | "loading" | "resolved" | "error";

export interface ResourceLoaderParams<R> {
  request: R;
  abortSignal: AbortSignal;
  previous: { status: ResourceStatus };
}

export interface ResourceOptions<R, T> {
  request: () => R;
  loader: (params: ResourceLoaderParams<R>) => Promise<T>;
  skipUndefined?: boolean;
}

export interface Resource<T> {
  value: ReadSignal<T | undefined>;
  error: ReadSignal<unknown>;
  status: ReadSignal<ResourceStatus>;
  hasValue: ReadSignal<boolean>;
  isLoading: ReadSignal<boolean>;
  isRefreshing: ReadSignal<boolean>;
  set(value: T | undefined): void;
  update(updater: (v: T | undefined) => T | undefined): void;
  reload(): void;
  destroy(): void;
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

export function resource<R, T>(options: ResourceOptions<R, T>): Resource<T> {
  const skipUndefined = options.skipUndefined ?? true;

  const value = signal<T | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const status = signal<ResourceStatus>("idle");
  const hasValue = signal(false);
  const reloadTick = signal(0);

  let currentController: AbortController | null = null;
  let requestId = 0;

  const dispose = effect(() => {
    const req = options.request();
    reloadTick();

    if (skipUndefined && req === undefined) {
      return;
    }

    currentController?.abort();
    const controller = new AbortController();
    currentController = controller;
    const myId = ++requestId;

    const prevStatus = untracked(status);
    status.set("loading");
    error.set(undefined);

    untracked(() =>
      options.loader({
        request: req,
        abortSignal: controller.signal,
        previous: { status: prevStatus },
      }),
    ).then(
      (result) => {
        if (myId !== requestId) {
          return;
        }
        value.set(result);
        hasValue.set(true);
        status.set("resolved");
      },
      (err) => {
        if (myId !== requestId || isAbortError(err)) {
          return;
        }
        error.set(err);
        status.set("error");
      },
    );

    return () => controller.abort();
  });

  const isLoading = computed(() => status() === "loading");
  const isRefreshing = computed(() => isLoading() && hasValue());

  return {
    value,
    error,
    status,
    hasValue,
    isLoading,
    isRefreshing,
    set: (v) => {
      value.set(v);
      hasValue.set(true);
    },
    update: (fn) => {
      value.update(fn);
      hasValue.set(true);
    },
    reload: () => reloadTick.update((n) => n + 1),
    destroy: () => {
      currentController?.abort();
      dispose();
    },
  };
}
