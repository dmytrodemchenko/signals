/**
 * Lightweight self-tests for the signals library.
 * Run from the demo page; results are returned as an array.
 */
import { signal, computed, effect, batch, untracked, isSignal } from "./signals.js";
import { linkedSignal } from "./linked-signal.js";
import { resource } from "./resource.js";

export type TestResult = { name: string; passed: boolean; error?: string };

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function test(name: string, fn: () => void, results: TestResult[]) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: (e as Error).message });
  }
}

export function runTests(): TestResult[] {
  const results: TestResult[] = [];

  test("signal stores and updates", () => {
    const s = signal(1);
    assert(s() === 1, "initial");
    s.set(2);
    assert(s() === 2, "after set");
    s.update((v) => v + 10);
    assert(s() === 12, "after update");
  }, results);

  test("computed memoizes and invalidates", () => {
    const a = signal(2);
    const b = signal(3);
    let calls = 0;
    const sum = computed(() => {
      calls++;
      return a() + b();
    });
    assert(sum() === 5 && calls === 1, "first eval");
    assert(sum() === 5 && calls === 1, "memoized");
    a.set(10);
    assert(sum() === 13 && calls === 2, "recomputes after change");
  }, results);

  test("effect runs initially and on dep change", () => {
    const s = signal("hi");
    const log: string[] = [];
    const dispose = effect(() => {
      log.push(s());
    });
    s.set("there");
    s.set("world");
    dispose();
    s.set("ignored");
    assert(log.join(",") === "hi,there,world", `got ${log.join(",")}`);
  }, results);

  test("batch coalesces updates", () => {
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
    assert(runs === 1, `expected 1 batched run, got ${runs}`);
    dispose();
  }, results);

  test("untracked does not subscribe", () => {
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
    assert(runs === 0, "should not re-run on untracked change");
    tracked.set(2);
    assert(runs === 1, "should re-run on tracked change");
    dispose();
  }, results);

  test("computed of computed propagates", () => {
    const n = signal(2);
    const sq = computed(() => n() * n());
    const plus1 = computed(() => sq() + 1);
    assert(plus1() === 5, "initial");
    n.set(3);
    assert(plus1() === 10, "propagates");
  }, results);

  test("cycle detection in computed", () => {
    const a = signal(1);
    let threw = false;
    // eslint-disable-next-line prefer-const
    let c2: () => number;
    const c1: () => number = computed(() => a() + (c2 ? c2() : 0));
    c2 = computed(() => c1() + 1);
    try {
      c2();
    } catch {
      threw = true;
    }
    assert(threw, "expected cycle to throw");
  }, results);

  test("isSignal type guard", () => {
    assert(isSignal(signal(0)), "writable is signal");
    assert(isSignal(computed(() => 1)), "computed is signal");
    assert(!isSignal(42), "number is not signal");
    assert(!isSignal(() => 1), "plain fn is not signal");
  }, results);

  test("effect cleanup runs before re-run and on dispose", () => {
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
    assert(
      log.join(",") === "run:0,clean:0,run:1,clean:1,run:2,clean:2",
      `got ${log.join(",")}`,
    );
  }, results);

  test("linkedSignal derives from source and is writable", () => {
    const source = signal(1);
    const linked = linkedSignal(() => source() * 10);
    assert(linked() === 10, "initial derivation");
    linked.set(999);
    assert(linked() === 999, "local override");
    source.set(2);
    assert(linked() === 20, "resets when source changes");
  }, results);

  test("linkedSignal computation receives previous state", () => {
    const list = signal(["a", "b", "c"]);
    const selection = linkedSignal<string[], string>({
      source: () => list(),
      computation: (items, prev) => {
        if (prev && items.includes(prev.value)) return prev.value;
        return items[0];
      },
    });
    assert(selection() === "a", "initial");
    selection.set("b");
    list.set(["a", "b", "c", "d"]);
    assert(selection() === "b", "preserved when still valid");
    list.set(["x", "y"]);
    assert(selection() === "x", "reset when invalid");
  }, results);

  return results;
}

export async function runAsyncTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // resource: basic load
  try {
    const id = signal(1);
    const r = resource({
      request: () => id(),
      loader: async ({ request }) => {
        await wait(10);
        return `data-${request}`;
      },
    });
    assert(r.status() === "loading", "starts loading");
    await wait(40);
    assert(r.status() === "resolved", `resolves; got ${r.status()}`);
    assert(r.value() === "data-1", `value=${r.value()}`);
    id.set(2);
    await wait(40);
    assert(r.value() === "data-2", "reacts to request change");
    r.destroy();
    results.push({ name: "resource loads and reacts to request", passed: true });
  } catch (e) {
    results.push({
      name: "resource loads and reacts to request",
      passed: false,
      error: (e as Error).message,
    });
  }

  // resource: error path
  try {
    const r = resource({
      request: () => 1,
      loader: async () => {
        throw new Error("boom");
      },
    });
    await wait(20);
    assert(r.status() === "error", `status=${r.status()}`);
    assert((r.error() as Error).message === "boom", "captures error");
    r.destroy();
    results.push({ name: "resource captures errors", passed: true });
  } catch (e) {
    results.push({
      name: "resource captures errors",
      passed: false,
      error: (e as Error).message,
    });
  }

  // resource: aborts stale requests
  try {
    const id = signal(1);
    const seen: number[] = [];
    const r = resource({
      request: () => id(),
      loader: async ({ request, abortSignal }) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 30);
          abortSignal.addEventListener("abort", () => {
            clearTimeout(t);
            const err = new Error("aborted");
            err.name = "AbortError";
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
    assert(r.value() === 3, `final value=${r.value()}`);
    assert(seen.length === 1 && seen[0] === 3, `only latest resolved, got ${seen.join(",")}`);
    r.destroy();
    results.push({ name: "resource aborts stale requests", passed: true });
  } catch (e) {
    results.push({
      name: "resource aborts stale requests",
      passed: false,
      error: (e as Error).message,
    });
  }

  return results;
}
