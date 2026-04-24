/**
 * Sigil — zero-dependency reactive Signals for JavaScript.
 *
 * Public entry point. Re-exports the full public API.
 */

export {
  signal,
  computed,
  effect,
  batch,
  untracked,
  isSignal,
  type EffectOptions,
  type ReadSignal,
  type SignalOptions,
  type ValueEqualityFn,
  type WriteSignal,
} from "./signals.js";

export { linkedSignal, type LinkedSignal, type LinkedSignalOptions } from "./linked-signal.js";

export {
  optimistic,
  type OptimisticPatch,
  type OptimisticSignal,
  type OptimisticTransaction,
} from "./optimistic.js";

export {
  resource,
  type Resource,
  type ResourceOptions,
  type ResourceStatus,
  type ResourceLoaderParams,
} from "./resource.js";
