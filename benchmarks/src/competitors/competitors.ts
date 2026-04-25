import { Bench } from 'tinybench';
import { signal as preactSignal, computed as preactComputed, batch as preactBatch } from '@preact/signals-core';
import { signal as alienSignal, computed as alienComputed, effect as alienEffect } from 'alien-signals';
import { signal, computed, batch } from '../../../src/signals.js';

export async function runCompetitorBenchmark() {
  const bench = new Bench({ time: 1000 });

  console.log('\n--- Test 3: Creation & Bulk Updates vs Competitors ---');

  bench
    .add('@preact/signals-core', () => {
      const a = preactSignal(1);
      const b = preactComputed(() => a.value * 2);
      const c = preactComputed(() => a.value * 3);
      const d = preactComputed(() => b.value + c.value);

      preactBatch(() => {
        for (let i = 0; i < 100; i++) {
          a.value = i;
        }
      });
      const final = d.value;
    })
    .add('alien-signals', () => {
      const a = alienSignal(1);
      const b = alienComputed(() => a.get() * 2);
      const c = alienComputed(() => a.get() * 3);
      const d = alienComputed(() => b.get() + c.get());

      for (let i = 0; i < 100; i++) {
        a.set(i);
      }
      const final = d.get();
    })
    .add('Sigil (Our Library)', () => {
      const a = signal(1);
      const b = computed(() => a() * 2);
      const c = computed(() => a() * 3);
      const d = computed(() => b() + c());

      batch(() => {
        for (let i = 0; i < 100; i++) {
          a.set(i);
        }
      });
      const final = d();
    });

  await bench.run();
  console.table(bench.table());
  return bench;
}
