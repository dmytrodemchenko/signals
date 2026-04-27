import { computed, effect, resource, signal, untracked } from "../dist/index.js";

export function initResourceDemo() {
  const pokemonSprite = document.querySelector("#pokemon-sprite");
  const pokemonStatus = document.querySelector("#pokemon-status");
  const pokemonConsole = document.querySelector("#pokemon-console");

  if (!pokemonSprite || !pokemonStatus || !pokemonConsole) return;

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

  document.querySelector("#prev")?.addEventListener("click", () => {
    pokemonId.update((value) => (value > 1 ? value - 1 : 151));
  });

  document.querySelector("#next")?.addEventListener("click", () => {
    pokemonId.update((value) => (value % 151) + 1);
  });

  document.querySelector("#reload")?.addEventListener("click", () => {
    pokemonResource.reload();
  });

   document.querySelector("#random")?.addEventListener("click", () => {
     pokemonId.set(Math.floor(Math.random() * 151) + 1);
   });
}
