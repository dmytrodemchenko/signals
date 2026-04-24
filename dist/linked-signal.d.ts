/**
 * linkedSignal — writable signal derived from a source. Re-derives whenever
 * the source changes, discarding any local override. The object form exposes
 * the previous { source, value } so consumers can reconcile state across
 * source changes (e.g. preserve a selection when the underlying list mutates).
 */
import { type WriteSignal } from "./signals.js";
export type LinkedSignal<T> = WriteSignal<T>;
export interface LinkedSignalOptions<S, T> {
    source: () => S;
    computation: (source: S, previous?: {
        source: S;
        value: T;
    }) => T;
    equal?: (a: T, b: T) => boolean;
}
export declare function linkedSignal<T>(computation: () => T): LinkedSignal<T>;
export declare function linkedSignal<S, T>(options: LinkedSignalOptions<S, T>): LinkedSignal<T>;
//# sourceMappingURL=linked-signal.d.ts.map