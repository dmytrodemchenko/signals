/**
 * linkedSignal — writable signal derived from a source. Re-derives whenever
 * the source changes, discarding any local override. The object form exposes
 * the previous { source, value } so consumers can reconcile state across
 * source changes (e.g. preserve a selection when the underlying list mutates).
 */
import { signal, computed, effect, untracked } from "./signals.js";
export function linkedSignal(arg) {
    var _a;
    const opts = typeof arg === "function"
        ? { source: arg, computation: (s) => s }
        : arg;
    const equal = (_a = opts.equal) !== null && _a !== void 0 ? _a : Object.is;
    const sourceSignal = computed(opts.source);
    const initialSource = sourceSignal();
    const initialValue = opts.computation(initialSource, undefined);
    let prev = { source: initialSource, value: initialValue };
    const store = signal(initialValue);
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
//# sourceMappingURL=linked-signal.js.map