/**
 * Zero-dependency reactive Signals.
 *
 * Push-pull engine: writes mark dependents dirty (push); reads validate
 * lazily by walking dependency versions (pull). Effects are scheduled and
 * flushed once per microtask / batch end, so updates are glitch-free.
 */
declare const SIGNAL_BRAND: unique symbol;
type SignalBrand = {
    readonly [SIGNAL_BRAND]: true;
};
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
export declare function signal<T>(initial: T, options?: SignalOptions<T>): WriteSignal<T>;
export declare function computed<T>(fn: () => T): ReadSignal<T>;
export declare function effect(fn: () => void | (() => void), options?: EffectOptions): () => void;
export declare function batch<T>(fn: () => T): T;
export declare function untracked<T>(fn: () => T): T;
export declare function isSignal<T = unknown>(value: unknown): value is ReadSignal<T>;
export {};
//# sourceMappingURL=signals.d.ts.map