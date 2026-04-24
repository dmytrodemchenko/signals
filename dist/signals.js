/**
 * Zero-dependency reactive Signals.
 *
 * Push-pull engine: writes mark dependents dirty (push); reads validate
 * lazily by walking dependency versions (pull). Effects are scheduled and
 * flushed once per microtask / batch end, so updates are glitch-free.
 */
const SIGNAL_BRAND = Symbol("sigil.signal");
let activeSubscriber = null;
let activeSignalWritesAllowed = true;
let batchDepth = 0;
const pendingEffects = new Set();
function brand(target) {
    Object.defineProperty(target, SIGNAL_BRAND, { value: true });
    return target;
}
function scheduleEffect(e) {
    if (e.disposed || e.scheduled) {
        return;
    }
    e.scheduled = true;
    pendingEffects.add(e);
    if (batchDepth === 0) {
        flushEffects();
    }
}
function flushEffects() {
    while (pendingEffects.size > 0) {
        const batch = Array.from(pendingEffects);
        pendingEffects.clear();
        for (const e of batch) {
            dispatchEffect(e);
        }
    }
}
function dispatchEffect(node) {
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
function trackRead(node) {
    if (!activeSubscriber) {
        return;
    }
    activeSubscriber.dependencies.set(node, node.version);
    node.subscribers.add(activeSubscriber);
}
function notifySubscribers(node) {
    for (const sub of Array.from(node.subscribers)) {
        if (sub.kind === "computed") {
            if (!sub.dirty) {
                sub.dirty = true;
                notifySubscribers(sub);
            }
        }
        else {
            scheduleEffect(sub);
        }
    }
}
function clearDependencies(sub) {
    for (const dep of sub.dependencies.keys()) {
        dep.subscribers.delete(sub);
    }
    sub.dependencies.clear();
}
function assertSignalWritesAllowed() {
    if (!activeSignalWritesAllowed) {
        throw new Error("Signal writes are not allowed in this effect.");
    }
}
function withSignalWritesAllowed(allowed, fn) {
    const prev = activeSignalWritesAllowed;
    activeSignalWritesAllowed = allowed;
    try {
        return fn();
    }
    finally {
        activeSignalWritesAllowed = prev;
    }
}
export function signal(initial, options = {}) {
    var _a;
    const node = {
        kind: "signal",
        value: initial,
        version: 0,
        subscribers: new Set(),
    };
    const isEqual = (_a = options.equal) !== null && _a !== void 0 ? _a : Object.is;
    const read = brand(function read() {
        trackRead(node);
        return node.value;
    });
    const readonlyView = brand(function readonlyView() {
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
export function computed(fn) {
    const node = {
        kind: "computed",
        fn,
        value: undefined,
        version: 0,
        dirty: true,
        computing: false,
        dependencies: new Map(),
        subscribers: new Set(),
    };
    return brand(function read() {
        if (node.computing) {
            throw new Error("Detected cycle in computed signal.");
        }
        if (node.dirty || !depsAreFresh(node)) {
            recompute(node);
        }
        trackRead(node);
        return node.value;
    });
}
function depsAreFresh(node) {
    for (const [dep, seenVersion] of node.dependencies) {
        if (dep.kind === "computed" && (dep.dirty || !depsAreFresh(dep))) {
            recompute(dep);
        }
        if (dep.version !== seenVersion) {
            return false;
        }
    }
    return true;
}
function recompute(node) {
    const prev = activeSubscriber;
    clearDependencies(node);
    activeSubscriber = node;
    node.computing = true;
    try {
        const next = node.fn();
        if (node.version === 0 || !Object.is(next, node.value)) {
            node.value = next;
            node.version++;
        }
    }
    finally {
        node.computing = false;
        node.dirty = false;
        activeSubscriber = prev;
    }
}
export function effect(fn, options = {}) {
    var _a;
    const node = {
        kind: "effect",
        fn,
        cleanup: undefined,
        dependencies: new Map(),
        scheduled: false,
        disposed: false,
        allowSignalWrites: (_a = options.allowSignalWrites) !== null && _a !== void 0 ? _a : true,
        scheduler: options.scheduler,
    };
    runEffect(node);
    return () => {
        if (node.disposed)
            return;
        node.disposed = true;
        runCleanup(node);
        clearDependencies(node);
        pendingEffects.delete(node);
    };
}
function runCleanup(node) {
    if (typeof node.cleanup !== "function") {
        return;
    }
    try {
        withSignalWritesAllowed(node.allowSignalWrites, () => { var _a; return (_a = node.cleanup) === null || _a === void 0 ? void 0 : _a.call(node); });
    }
    catch (err) {
        console.error("[signals] effect cleanup threw:", err);
    }
    node.cleanup = undefined;
}
function runEffect(node) {
    runCleanup(node);
    const prev = activeSubscriber;
    clearDependencies(node);
    activeSubscriber = node;
    try {
        const result = withSignalWritesAllowed(node.allowSignalWrites, () => node.fn());
        if (typeof result === "function") {
            node.cleanup = result;
        }
    }
    finally {
        activeSubscriber = prev;
    }
}
export function batch(fn) {
    batchDepth++;
    try {
        return fn();
    }
    finally {
        batchDepth--;
        if (batchDepth === 0) {
            flushEffects();
        }
    }
}
export function untracked(fn) {
    const prev = activeSubscriber;
    activeSubscriber = null;
    try {
        return fn();
    }
    finally {
        activeSubscriber = prev;
    }
}
export function isSignal(value) {
    return typeof value === "function" && SIGNAL_BRAND in value;
}
//# sourceMappingURL=signals.js.map