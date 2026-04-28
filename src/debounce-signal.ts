/**
 * debounceSignal — read-only signal that mirrors a source signal with
 * a configurable debounce delay. The output only updates once the source
 * has been stable (no new emissions) for `ms` milliseconds.
 */
import { signal, effect, type ReadSignal } from './signals.js';

export function debounceSignal<T>(source: ReadSignal<T>, ms: number): ReadSignal<T> {
  const debounced = signal<T>(source());
  let timer: ReturnType<typeof setTimeout> | null = null;

  effect(() => {
    const next = source();
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      debounced.set(next);
    }, ms);
  });

  return debounced.asReadonly();
}
