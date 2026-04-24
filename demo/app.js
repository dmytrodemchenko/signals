import { batch, computed, effect, isSignal, linkedSignal, optimistic, resource, signal, untracked } from "../dist/index.js";

const linkedConsole = document.querySelector("#linked-console");
const runTestsButton = document.querySelector("#run-tests");
const testResults = document.querySelector("#test-results");
const pokemonSprite = document.querySelector("#pokemon-sprite");
const pokemonStatus = document.querySelector("#pokemon-status");
const pokemonConsole = document.querySelector("#pokemon-console");
const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const optimisticServer = document.querySelector("#optimistic-server");
const optimisticOverlayValue = document.querySelector("#optimistic-overlay");
const optimisticPending = document.querySelector("#optimistic-pending");
const optimisticConsole = document.querySelector("#optimistic-console");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectTab(name) {
  for (const button of tabButtons) {
    const isActive = button.dataset.tabTarget === name;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.tabPanel !== name;
  }

  runTestsButton.hidden = name !== "demo";
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    selectTab(button.dataset.tabTarget);
  });
}

selectTab("demo");

const base = signal(100);
const draft = linkedSignal(() => base());

effect(() => {
  linkedConsole.textContent = `base() = ${base()}\ndraft() = ${draft()}`;
});

document.querySelector("#draft-up").addEventListener("click", () => {
  draft.update((value) => value + 1);
});

document.querySelector("#base-up").addEventListener("click", () => {
  base.update((value) => value + 100);
});

const pokemonId = signal(1);
const pokemonResource = resource({
  request: () => pokemonId(),
  loader: async ({ request, abortSignal }) => {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${request}`, {
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return response.json();
  },
});

const pokemonName = computed(() => {
  const data = pokemonResource.value();
  return data ? data.name : "pending";
});

const pokemonSpriteUrl = computed(() => {
  const data = pokemonResource.value();
  return data?.sprites?.front_default ?? "";
});

effect(() => {
  const status = pokemonResource.status();
  const value = pokemonResource.value();
  const error = pokemonResource.error();

  pokemonStatus.textContent = status;
  pokemonConsole.textContent = `id() = ${pokemonId()}\nvalue() = ${value ? pokemonName() : "pending"}${status === "error" ? `\nerror() = ${error.message ?? String(error)}` : ""}`;

  const sprite = pokemonSpriteUrl();
  pokemonSprite.src = sprite;
  pokemonSprite.style.visibility = sprite ? "visible" : "hidden";
  pokemonSprite.alt = value ? value.name : "";
});

document.querySelector("#prev").addEventListener("click", () => {
  pokemonId.update((value) => (value > 1 ? value - 1 : 151));
});

document.querySelector("#next").addEventListener("click", () => {
  pokemonId.update((value) => (value % 151) + 1);
});

document.querySelector("#reload").addEventListener("click", () => {
  pokemonResource.reload();
});

document.querySelector("#random").addEventListener("click", () => {
  pokemonId.set(Math.floor(Math.random() * 151) + 1);
});

const serverLikes = signal(42);
const optimisticLikes = optimistic(serverLikes);
const optimisticFeed = signal([
  "Ready. Queue an optimistic like, then let it commit or roll back.",
]);

function pushOptimisticEvent(message) {
  optimisticFeed.update((entries) => [message, ...entries].slice(0, 8));
}

function scheduleOptimisticLike({ fail = false } = {}) {
  const tx = optimisticLikes.apply((value) => value + 1);
  pushOptimisticEvent(`tx#${tx.id}: queued +1 locally`);

  sleep(fail ? 1300 : 900).then(() => {
    if (fail) {
      tx.rollback();
      pushOptimisticEvent(`tx#${tx.id}: server rejected, rolled back`);
      return;
    }

    tx.commit((value) => value + 1);
    pushOptimisticEvent(`tx#${tx.id}: server committed +1 to base`);
  });
}

effect(() => {
  optimisticServer.textContent = String(serverLikes());
  optimisticOverlayValue.textContent = String(optimisticLikes());
  optimisticPending.textContent = String(optimisticLikes.pendingCount());
  optimisticConsole.textContent =
    `hasPending() = ${optimisticLikes.hasPending()}\n\n` +
    optimisticFeed().join("\n");
});

document.querySelector("#optimistic-like").addEventListener("click", () => {
  scheduleOptimisticLike();
});

document.querySelector("#optimistic-fail").addEventListener("click", () => {
  scheduleOptimisticLike({ fail: true });
});

document.querySelector("#optimistic-sync").addEventListener("click", () => {
  serverLikes.update((value) => value + 5);
  pushOptimisticEvent("server sync: base updated by +5");
});

async function runDemoTests() {
  const results = [];

  function record(name, passed, error) {
    results.push({ name, passed, error });
  }

  try {
    const count = signal(1);
    count.set(3);
    count.update((value) => value + 4);
    assert(count() === 7, "signal writes should update state");
    record("signal stores and updates values", true);
  } catch (error) {
    record("signal stores and updates values", false, error.message);
  }

  try {
    const count = signal(2);
    let calls = 0;
    const doubled = computed(() => {
      calls += 1;
      return count() * 2;
    });

    assert(doubled() === 4, "computed should evaluate");
    assert(doubled() === 4 && calls === 1, "computed should memoize");
    count.set(4);
    assert(doubled() === 8 && calls === 2, "computed should invalidate lazily");
    record("computed memoizes and invalidates lazily", true);
  } catch (error) {
    record("computed memoizes and invalidates lazily", false, error.message);
  }

  try {
    const left = signal(1);
    const right = signal(2);
    let runs = 0;
    const stop = effect(() => {
      left();
      right();
      runs += 1;
    });

    runs = 0;
    batch(() => {
      left.set(10);
      right.set(20);
    });

    stop();
    assert(runs === 1, "effect should only rerun once after batch");
    record("batch coalesces effect reruns", true);
  } catch (error) {
    record("batch coalesces effect reruns", false, error.message);
  }

  try {
    const baseSignal = signal(50);
    const draftSignal = linkedSignal(() => baseSignal());

    draftSignal.set(70);
    assert(draftSignal() === 70, "linked signal stays writable");
    baseSignal.set(90);
    assert(draftSignal() === 90, "linked signal should reset when source changes");
    record("linkedSignal preserves writability and resets from source", true);
  } catch (error) {
    record("linkedSignal preserves writability and resets from source", false, error.message);
  }

  try {
    assert(isSignal(signal(0)), "writable signal should be branded");
    assert(isSignal(computed(() => 1)), "computed signal should be branded");
    assert(!isSignal(() => 1), "plain function should not be branded");
    record("isSignal narrows branded signal functions", true);
  } catch (error) {
    record("isSignal narrows branded signal functions", false, error.message);
  }

  try {
    const committed = signal(10);
    const projected = optimistic(committed);
    const tx = projected.apply((value) => value + 2);

    assert(projected() === 12, "optimistic layer should apply immediately");
    committed.set(20);
    assert(projected() === 22, "optimistic value should rebase on source updates");
    tx.commit((value) => value + 2);
    assert(committed() === 22, "commit should update the base signal");
    record("optimistic rebases pending layers and commits cleanly", true);
  } catch (error) {
    record("optimistic rebases pending layers and commits cleanly", false, error.message);
  }

  try {
    const request = signal("alpha");
    const seen = [];
    const demoResource = resource({
      request: () => request(),
      loader: async ({ request: current, abortSignal }) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, current === "alpha" ? 60 : 10);
          abortSignal.addEventListener("abort", () => {
            clearTimeout(timeout);
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
        seen.push(current);
        return current;
      },
    });

    request.set("beta");
    await sleep(80);
    assert(demoResource.value() === "beta", "resource should keep latest value");
    assert(seen.length === 1 && seen[0] === "beta", "stale request should be aborted");
    demoResource.destroy();
    record("resource aborts stale async work", true);
  } catch (error) {
    record("resource aborts stale async work", false, error.message);
  }

  return results;
}

function renderResults(results) {
  testResults.replaceChildren();

  for (const result of results) {
    const item = document.createElement("li");
    item.className = result.passed ? "pass" : "fail";
    item.textContent = result.passed ? result.name : `${result.name}: ${result.error}`;
    testResults.appendChild(item);
  }
}

runTestsButton.addEventListener("click", async () => {
  runTestsButton.disabled = true;
  runTestsButton.textContent = "Running...";

  try {
    const results = await runDemoTests();
    renderResults(results);
  } finally {
    runTestsButton.disabled = false;
    runTestsButton.textContent = "Run tests";
  }
});

renderResults([
  {
    name: "No tests have been run yet.",
    passed: true,
  },
]);

untracked(() => pokemonResource.status());
