/**
 * resource — reactive async loader. Re-runs whenever `request()` changes;
 * stale loads are aborted via AbortSignal. Exposes value/error/status as
 * read signals plus imperative set/update/reload/destroy.
 */
import { signal, computed, effect, untracked } from "./signals.js";
function isAbortError(err) {
    return (err === null || err === void 0 ? void 0 : err.name) === "AbortError";
}
export function resource(options) {
    var _a;
    const skipUndefined = (_a = options.skipUndefined) !== null && _a !== void 0 ? _a : true;
    const value = signal(undefined);
    const error = signal(undefined);
    const status = signal("idle");
    const hasValue = signal(false);
    const reloadTick = signal(0);
    let currentController = null;
    let requestId = 0;
    const dispose = effect(() => {
        const req = options.request();
        reloadTick();
        if (skipUndefined && req === undefined) {
            return;
        }
        currentController === null || currentController === void 0 ? void 0 : currentController.abort();
        const controller = new AbortController();
        currentController = controller;
        const myId = ++requestId;
        const prevStatus = untracked(status);
        status.set("loading");
        error.set(undefined);
        untracked(() => options.loader({
            request: req,
            abortSignal: controller.signal,
            previous: { status: prevStatus },
        })).then((result) => {
            if (myId !== requestId) {
                return;
            }
            value.set(result);
            hasValue.set(true);
            status.set("resolved");
        }, (err) => {
            if (myId !== requestId || isAbortError(err)) {
                return;
            }
            error.set(err);
            status.set("error");
        });
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
            currentController === null || currentController === void 0 ? void 0 : currentController.abort();
            dispose();
        },
    };
}
//# sourceMappingURL=resource.js.map