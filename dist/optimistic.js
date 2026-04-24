import { batch, computed, signal } from "./signals.js";
function toUpdater(patch) {
    return typeof patch === "function" ? patch : () => patch;
}
function applyToSignal(target, patch) {
    if (typeof patch === "function") {
        target.update(patch);
        return;
    }
    target.set(patch);
}
export function optimistic(source) {
    const layers = signal([]);
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
    const removeLayer = (id) => {
        const before = layers();
        const next = before.filter((layer) => layer.id !== id);
        if (next.length === before.length) {
            return false;
        }
        layers.set(next);
        return true;
    };
    const read = value;
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
        const layer = { id, apply: toUpdater(patch) };
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
                        applyToSignal(source, args[0]);
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
//# sourceMappingURL=optimistic.js.map