/**
 * Vitest tests for the signals library.
 */
import { describe, it, expect } from 'vitest';
import { signal, computed, effect, batch, untracked, isSignal } from './signals.js';
import { linkedSignal } from './linked-signal.js';
import { optimistic } from './optimistic.js';
import { resource } from './resource.js';
import { debounceSignal } from './debounce-signal.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('signal', () => {
  it('stores and updates', () => {
    const s = signal(1);
    expect(s()).toBe(1);
    s.set(2);
    expect(s()).toBe(2);
    s.update((v) => v + 10);
    expect(s()).toBe(12);
  });

  it('supports custom equality for set and update', () => {
    const s = signal(
      { id: 1, label: 'a' },
      {
        equal: (a, b) => a.id === b.id,
      }
    );
    const seen: string[] = [];
    const dispose = effect(() => {
      seen.push(s().label);
    });

    s.set({ id: 1, label: 'b' });
    s.update((value) => ({ ...value, label: 'c' }));
    expect(seen.join(',')).toBe('a');

    s.set({ id: 2, label: 'd' });
    expect(seen.join(',')).toBe('a,d');
    dispose();
  });

  it('mutate still notifies with custom equality', () => {
    const s = signal(
      { id: 1, count: 0 },
      {
        equal: (a, b) => a.id === b.id,
      }
    );
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(s().count);
    });

    s.mutate((value) => {
      value.count += 1;
    });

    expect(seen.join(',')).toBe('0,1');
    dispose();
  });

  it('exposes a stable readonly view', () => {
    const s = signal(1);
    const readonlyA = s.asReadonly();
    const readonlyB = s.asReadonly();

    expect(readonlyA).toBe(readonlyB);
    expect(readonlyA()).toBe(1);
    s.set(5);
    expect(readonlyA()).toBe(5);
    expect(isSignal(readonlyA)).toBe(true);
    expect('set' in (readonlyA as object)).toBe(false);
  });
});

describe('computed', () => {
  it('memoizes and invalidates', () => {
    const a = signal(2);
    const b = signal(3);
    let calls = 0;
    const sum = computed(() => {
      calls++;
      return a() + b();
    });
    expect(sum()).toBe(5);
    expect(calls).toBe(1);
    expect(sum()).toBe(5);
    expect(calls).toBe(1);
    a.set(10);
    expect(sum()).toBe(13);
    expect(calls).toBe(2);
  });

  it('of computed propagates', () => {
    const n = signal(2);
    const sq = computed(() => n() * n());
    const plus1 = computed(() => sq() + 1);
    expect(plus1()).toBe(5);
    n.set(3);
    expect(plus1()).toBe(10);
  });

  it('detects cycles and throws', () => {
    const a = signal(1);
    // eslint-disable-next-line prefer-const
    let c2: (() => number) | undefined;
    const c1: () => number = computed(() => a() + (c2 !== undefined ? c2() : 0));
    c2 = computed(() => c1() + 1);
    expect(() => c2()).toThrow();
  });

  it('glitch-free push/pull: does not run effects if computed value is unchanged', () => {
    const count = signal(1);
    const isPositive = computed(() => count() > 0);
    let effectRuns = 0;

    const dispose = effect(() => {
      isPositive();
      effectRuns++;
    });

    expect(effectRuns).toBe(1); // initial run

    count.set(2); // count changed, but isPositive is still true
    expect(effectRuns).toBe(1); // effect should NOT run again!
    dispose();
  });
});

describe('effect', () => {
  it('runs initially and on dep change', () => {
    const s = signal('hi');
    const log: string[] = [];
    const dispose = effect(() => {
      log.push(s());
    });
    s.set('there');
    s.set('world');
    dispose();
    s.set('ignored');
    expect(log.join(',')).toBe('hi,there,world');
  });

  it('cleanup runs before re-run and on dispose', () => {
    const s = signal(0);
    const log: string[] = [];
    const dispose = effect(() => {
      const v = s();
      log.push(`run:${v}`);
      return () => log.push(`clean:${v}`);
    });
    s.set(1);
    s.set(2);
    dispose();
    expect(log.join(',')).toBe('run:0,clean:0,run:1,clean:1,run:2,clean:2');
  });

  it('allows signal writes by default', () => {
    const source = signal(0);
    const target = signal(0);
    const dispose = effect(() => {
      const next = source();
      if (next > 0) {
        target.set(next * 10);
      }
    });
    source.set(3);
    expect(target()).toBe(30);
    dispose();
  });

  it('can disallow signal writes', () => {
    const source = signal(0);
    const target = signal(0);
    const dispose = effect(
      () => {
        const next = source();
        if (next > 0) {
          target.set(next);
        }
      },
      { allowSignalWrites: false }
    );

    expect(() => source.set(1)).toThrow('Signal writes are not allowed in this effect.');
    expect(target()).toBe(0);
    dispose();
  });

  it('scheduler defers and coalesces reruns', () => {
    const source = signal(0);
    const seen: number[] = [];
    const queue: Array<() => void> = [];
    const dispose = effect(
      () => {
        seen.push(source());
      },
      {
        scheduler: (run) => {
          queue.push(run);
        },
      }
    );

    expect(seen.join(',')).toBe('0');
    source.set(1);
    source.set(2);
    expect(queue.length).toBe(1);
    expect(seen.join(',')).toBe('0');

    const run = queue.shift();
    expect(typeof run).toBe('function');
    run?.();

    expect(seen.join(',')).toBe('0,2');
    dispose();
  });

  it('accepts manualCleanup option without changing disposal', () => {
    const s = signal(0);
    const log: string[] = [];
    const dispose = effect(
      () => {
        const v = s();
        log.push(`run:${v}`);
        return () => log.push(`clean:${v}`);
      },
      { manualCleanup: true }
    );

    s.set(1);
    dispose();

    expect(log.join(',')).toBe('run:0,clean:0,run:1,clean:1');
  });
});

describe('batch', () => {
  it('coalesces updates', () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const dispose = effect(() => {
      a();
      b();
      runs++;
    });
    runs = 0;
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(runs).toBe(1);
    dispose();
  });
});

describe('untracked', () => {
  it('does not subscribe', () => {
    const tracked = signal(1);
    const hidden = signal(100);
    let runs = 0;
    const dispose = effect(() => {
      tracked();
      untracked(() => hidden());
      runs++;
    });
    runs = 0;
    hidden.set(200);
    expect(runs).toBe(0);
    tracked.set(2);
    expect(runs).toBe(1);
    dispose();
  });
});

describe('isSignal', () => {
  it('type guard works', () => {
    expect(isSignal(signal(0))).toBe(true);
    expect(isSignal(computed(() => 1))).toBe(true);
    expect(isSignal(42)).toBe(false);
    expect(isSignal(() => 1)).toBe(false);
  });
});

describe('linkedSignal', () => {
  it('derives from source and is writable', () => {
    const source = signal(1);
    const linked = linkedSignal(() => source() * 10);
    expect(linked()).toBe(10);
    linked.set(999);
    expect(linked()).toBe(999);
    source.set(2);
    expect(linked()).toBe(20);
  });

  it('computation receives previous state', () => {
    const list = signal(['a', 'b', 'c']);
    const selection = linkedSignal<string[], string>({
      source: () => list(),
      computation: (items, prev) => {
        if (prev && items.includes(prev.value)) return prev.value;
        return items[0];
      },
    });
    expect(selection()).toBe('a');
    selection.set('b');
    list.set(['a', 'b', 'c', 'd']);
    expect(selection()).toBe('b');
    list.set(['x', 'y']);
    expect(selection()).toBe('x');
  });
});

describe('optimistic', () => {
  it('overlays source and tracks pending state', () => {
    const base = signal(1);
    const overlay = optimistic(base);

    expect(overlay()).toBe(1);
    expect(overlay.hasPending()).toBe(false);
    expect(overlay.pendingCount()).toBe(0);

    const tx = overlay.apply((value) => value + 2);
    expect(overlay()).toBe(3);
    expect(overlay.hasPending()).toBe(true);
    expect(overlay.pendingCount()).toBe(1);

    tx.rollback();
    expect(overlay()).toBe(1);
    expect(overlay.hasPending()).toBe(false);
  });

  it('rebases on source updates while pending', () => {
    const base = signal(10);
    const overlay = optimistic(base);

    overlay.apply((value) => value + 1);
    expect(overlay()).toBe(11);

    base.set(20);
    expect(overlay()).toBe(21);
  });

  it('supports overlapping layers and selective rollback', () => {
    const base = signal(0);
    const overlay = optimistic(base);

    const first = overlay.apply((value) => value + 1);
    const second = overlay.apply((value) => value + 10);

    expect(overlay()).toBe(11);
    expect(overlay.pendingCount()).toBe(2);

    first.rollback();
    expect(overlay()).toBe(10);
    expect(overlay.pendingCount()).toBe(1);

    second.rollback();
    expect(overlay()).toBe(0);
  });

  it('commit can update the base signal without a transient rollback', () => {
    const base = signal(0);
    const overlay = optimistic(base);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(overlay());
    });

    const tx = overlay.apply((value) => value + 1);
    tx.commit(5);

    expect(base()).toBe(5);
    expect(overlay()).toBe(5);
    expect(seen.join(',')).toBe('0,1,5');
    dispose();
  });

  it('rollback preserves other committed transactions', () => {
    const base = signal(42);
    const overlay = optimistic(base);

    const committed = overlay.apply((value) => value + 1);
    const rejected = overlay.apply((value) => value + 1);

    expect(overlay()).toBe(44);

    committed.commit((value) => value + 1);
    expect(base()).toBe(43);
    expect(overlay()).toBe(44);

    rejected.rollback();
    expect(base()).toBe(43);
    expect(overlay()).toBe(43);
  });

  it('clear removes layers and invalidates stale transactions', () => {
    const base = signal(2);
    const overlay = optimistic(base);
    const tx = overlay.apply((value) => value + 5);

    overlay.clear();
    expect(overlay()).toBe(2);
    expect(overlay.pendingCount()).toBe(0);

    tx.commit(9);
    expect(base()).toBe(2);
  });
});

describe('resource', () => {
  it('loads and reacts to request', async () => {
    const id = signal(1);
    const r = resource({
      request: () => id(),
      loader: async ({ request }) => {
        await wait(10);
        return `data-${request}`;
      },
    });
    expect(r.hasValue()).toBe(false);
    expect(r.status()).toBe('loading');
    expect(r.isLoading()).toBe(true);
    expect(r.isRefreshing()).toBe(false);
    await wait(40);
    expect(r.status()).toBe('resolved');
    expect(r.value()).toBe('data-1');
    expect(r.hasValue()).toBe(true);
    expect(r.isLoading()).toBe(false);
    id.set(2);
    expect(r.status()).toBe('loading');
    expect(r.value()).toBe('data-1');
    expect(r.isRefreshing()).toBe(true);
    await wait(40);
    expect(r.value()).toBe('data-2');
    expect(r.isRefreshing()).toBe(false);
    r.destroy();
  });

  it('captures errors', async () => {
    const r = resource({
      request: () => 1,
      // eslint-disable-next-line @typescript-eslint/require-await
      loader: async () => {
        throw new Error('boom');
      },
    });
    await wait(20);
    expect(r.status()).toBe('error');
    expect((r.error() as Error).message).toBe('boom');
    expect(r.hasValue()).toBe(false);
    expect(r.isRefreshing()).toBe(false);
    r.destroy();
  });

  it('aborts stale requests', async () => {
    const id = signal(1);
    const seen: number[] = [];
    const r = resource({
      request: () => id(),
      loader: async ({ request, abortSignal }) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 30);
          abortSignal.addEventListener('abort', () => {
            clearTimeout(t);
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
        seen.push(request);
        return request;
      },
    });
    id.set(2);
    id.set(3);
    await wait(80);
    expect(r.value()).toBe(3);
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(3);
    r.destroy();
  });

  it('keeps stale value during and after failed refresh', async () => {
    const id = signal(1);
    let shouldFail = false;
    const r = resource({
      request: () => id(),
      loader: async ({ request }) => {
        await wait(10);
        if (shouldFail) {
          throw new Error(`boom-${request}`);
        }
        return `data-${request}`;
      },
    });

    await wait(30);
    expect(r.value()).toBe('data-1');
    expect(r.hasValue()).toBe(true);

    shouldFail = true;
    id.set(2);
    expect(r.isRefreshing()).toBe(true);
    expect(r.value()).toBe('data-1');
    await wait(30);

    expect(r.status()).toBe('error');
    expect(r.value()).toBe('data-1');
    expect(r.hasValue()).toBe(true);
    expect((r.error() as Error).message).toBe('boom-2');
    expect(r.isRefreshing()).toBe(false);
    r.destroy();
  });

  it('hasValue tracks manual writes independently of value contents', () => {
    const r = resource<undefined, string>({
      request: () => undefined,
      // eslint-disable-next-line @typescript-eslint/require-await
      loader: async () => '',
    });

    expect(r.hasValue()).toBe(false);
    r.set(undefined);
    expect(r.hasValue()).toBe(true);
    expect(r.isRefreshing()).toBe(false);
    r.destroy();
  });
});

describe('debounceSignal', () => {
  it('starts with the current source value', () => {
    const source = signal(42);
    const debounced = debounceSignal(source, 50);
    expect(debounced()).toBe(42);
  });

  it('delays propagation by the specified time', async () => {
    const source = signal('a');
    const debounced = debounceSignal(source, 50);

    source.set('b');
    expect(debounced()).toBe('a'); // not yet updated

    await wait(80);
    expect(debounced()).toBe('b');
  });

  it('coalesces rapid updates', async () => {
    const source = signal(0);
    const debounced = debounceSignal(source, 50);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(debounced());
    });

    source.set(1);
    source.set(2);
    source.set(3);

    await wait(80);
    // Should only see initial (0) and final debounced (3)
    expect(seen).toEqual([0, 3]);
    dispose();
  });

  it('reacts to multiple separate bursts', async () => {
    const source = signal(0);
    const debounced = debounceSignal(source, 30);

    source.set(1);
    await wait(60);
    expect(debounced()).toBe(1);

    source.set(2);
    await wait(60);
    expect(debounced()).toBe(2);
  });

  it('resets timer on each new emission', async () => {
    const source = signal(0);
    const debounced = debounceSignal(source, 50);

    source.set(1);
    await wait(30); // 30ms in, timer not yet fired
    source.set(2); // resets timer
    await wait(30); // 60ms total, but only 30ms since last change
    expect(debounced()).toBe(0); // still waiting

    await wait(40); // 100ms total, 70ms since last change — should have fired
    expect(debounced()).toBe(2);
  });
});
