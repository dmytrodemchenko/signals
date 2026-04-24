import { type ReadSignal, type WriteSignal } from "./signals.js";
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
export declare function optimistic<T>(source: WriteSignal<T>): OptimisticSignal<T>;
//# sourceMappingURL=optimistic.d.ts.map