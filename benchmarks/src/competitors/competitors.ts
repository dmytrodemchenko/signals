import { Bench } from 'tinybench';
import { signal as preactSignal, computed as preactComputed, batch as preactBatch } from '@preact/signals-core';
import { signal as alienSignal, computed as alienComputed, effect as alienEffect, startBatch, endBatch } from 'alien-signals';
import { signal, computed, batch } from '../../../src/index.js';

export async function runCompetitorBenchmark() {
  const bench = new Bench({ time: 1000, warmupTime: 500, warmupIterations: 100 });

  console.log('\n--- Test 3: Creation & Bulk Updates vs Competitors ---');

  // Preact signals
  const preactA = preactSignal(1);
  const preactB = preactComputed(() => preactA.value * 2);
  const preactC = preactComputed(() => preactA.value * 3);
  const preactD = preactComputed(() => preactB.value + preactC.value);

  // Alien signals
  const alienA = alienSignal(1);
  const alienB = alienComputed(() => alienA.get() * 2);
  const alienC = alienComputed(() => alienA.get() * 3);
  const alienD = alienComputed(() => alienB.get() + alienC.get());

  // Our signals
  const a = signal(1);
  const b = computed(() => a() * 2);
  const c = computed(() => a() * 3);
  const d = computed(() => b() + c());

  // Profiling single run
  console.log('Profiling single run for @demchenko.di/signals:');
  const start = performance.now();
  batch(() => {
    for (let i = 0; i < 100; i++) a.set(i);
  });
  d();
  console.log('Single run time:', performance.now() - start, 'ms');

  bench
    .add('@preact/signals-core: graph update', () => {
      preactBatch(() => {
        for (let i = 0; i < 100; i++) {
          preactA.value = i;
        }
      });
      const final = preactD.value;
    })
    .add('alien-signals: graph update', () => {
      startBatch();
      for (let i = 0; i < 100; i++) {
        alienA.set(i);
      }
      endBatch();
      const final = alienD.get();
    })
    .add('@demchenko.di/signals: graph update', () => {
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
