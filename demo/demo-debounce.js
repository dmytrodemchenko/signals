import { debounceSignal, effect, signal } from "../dist/index.js";

export function initDebounceDemo() {
  const searchInput = document.querySelector("#debounce-input");
  const rawDisplay = document.querySelector("#debounce-raw");
  const debouncedDisplay = document.querySelector("#debounce-value");
  const timeline = document.querySelector("#debounce-timeline");
  const delaySlider = document.querySelector("#debounce-delay");
  const delayLabel = document.querySelector("#debounce-delay-label");

  if (!searchInput || !rawDisplay || !debouncedDisplay || !timeline || !delaySlider || !delayLabel) return;

  const query = signal("");
  const delayMs = signal(Number(delaySlider.value));
  let debounced = debounceSignal(query, delayMs());

  let disposeDebounceEffect = null;
  function setupDebouncedEffect() {
    if (disposeDebounceEffect) disposeDebounceEffect();
    debounced = debounceSignal(query, delayMs());
    disposeDebounceEffect = effect(() => {
      const val = debounced();
      debouncedDisplay.textContent = val || "(empty)";
      debouncedDisplay.classList.toggle("flash", true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => debouncedDisplay.classList.remove("flash"));
      });
      pushTimelineEvent("debounced", val);
    });
  }

  const events = signal([]);
  let startTime = Date.now();

  function pushTimelineEvent(type, value) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    events.update((list) => [
      { type, value, elapsed },
      ...list,
    ].slice(0, 20));
  }

  effect(() => {
    const val = query();
    rawDisplay.textContent = val || "(empty)";
    pushTimelineEvent("raw", val);
  });

  effect(() => {
    const list = events();
    timeline.innerHTML = list
      .map((entry) => {
        const badge = entry.type === "raw"
          ? `<span class="badge badge-raw">keystroke</span>`
          : `<span class="badge badge-debounced">debounced</span>`;
        const displayVal = entry.value || "(empty)";
        return `<div class="timeline-entry">${badge}<span class="timeline-time">${entry.elapsed}s</span><span class="timeline-value">${escapeHtml(displayVal)}</span></div>`;
      })
      .join("");
  });

  searchInput.addEventListener("input", () => {
    query.set(searchInput.value);
  });

  delaySlider.addEventListener("input", () => {
    const ms = Number(delaySlider.value);
    delayMs.set(ms);
    delayLabel.textContent = `${ms}ms`;
    startTime = Date.now();
    events.set([]);
    setupDebouncedEffect();
  });

  document.querySelector("#debounce-clear")?.addEventListener("click", () => {
    searchInput.value = "";
    query.set("");
    startTime = Date.now();
    events.set([]);
  });

  delayLabel.textContent = `${delayMs()}ms`;
  setupDebouncedEffect();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
