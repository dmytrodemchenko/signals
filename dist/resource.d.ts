/**
 * resource — reactive async loader. Re-runs whenever `request()` changes;
 * stale loads are aborted via AbortSignal. Exposes value/error/status as
 * read signals plus imperative set/update/reload/destroy.
 */
import { type ReadSignal } from "./signals.js";
export type ResourceStatus = "idle" | "loading" | "resolved" | "error";
export interface ResourceLoaderParams<R> {
    request: R;
    abortSignal: AbortSignal;
    previous: {
        status: ResourceStatus;
    };
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
export declare function resource<R, T>(options: ResourceOptions<R, T>): Resource<T>;
//# sourceMappingURL=resource.d.ts.map