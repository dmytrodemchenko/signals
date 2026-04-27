import { Bench } from 'tinybench';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { signal, computed } from '../../../src/index.js';

export async function runSignalVsBehaviorSubject() {
  const bench = new Bench({ time: 500, warmupTime: 500, warmupIterations: 100 });

  console.log('--- Test 1: Basic Reads & Writes ---');

  bench
    .add('RxJS: BehaviorSubject + getValue()', () => {
      const sub = new BehaviorSubject(0);
      sub.next(1);
      sub.next(2);
      const val = sub.getValue();
    })
    .add('@demchenko.di/signals: signal() + set()', () => {
      const s = signal(0);
      s.set(1);
      s.set(2);
      const val = s();
    });

  await bench.run();
  console.table(bench.table());
  return bench;
}

export async function runComputedVsCombineLatest() {
  const bench = new Bench({ time: 1000, warmupTime: 500, warmupIterations: 100 });

  console.log('\n--- Test 2: Diamond Problem (Derived State) ---');

  // Profiling single run for signals
  console.log('Profiling single run for @demchenko.di/signals:');
  const profA = signal(1);
  const profB = computed(() => profA() * 2);
  const profC = computed(() => profA() * 3);
  const profD = computed(() => profB() + profC());
  const start = performance.now();
  profA.set(2);
  profD();
  console.log('Single run time:', performance.now() - start, 'ms');

  bench
    .add('RxJS: BehaviorSubject + combineLatest', () => {
      const a = new BehaviorSubject(1);

      const b = new BehaviorSubject(0);
      a.pipe(map(v => v * 2)).subscribe(b);

      const c = new BehaviorSubject(0);
      a.pipe(map(v => v * 3)).subscribe(c);

      let finalVal = 0;
      let runs = 0;

      const sub = combineLatest([b, c]).pipe(
        map(([bv, cv]) => {
          runs++;
          return bv + cv;
        })
      ).subscribe(v => finalVal = v);

      a.next(2);
      // combineLatest often emits multiple times (glitch)
      // if not scheduled perfectly via synchronous logic

      sub.unsubscribe();
    })
    .add('@demchenko.di/signals: signal + computed', () => {
      const a = signal(1);
      const b = computed(() => a() * 2);
      const c = computed(() => a() * 3);

      let finalVal = 0;
      let runs = 0;

      const d = computed(() => {
        runs++;
        return b() + c();
      });

      finalVal = d(); // Initial read
      a.set(2);       // Dirty marking (Push)
      finalVal = d(); // Re-evaluates (Pull), runs === 2 (Glitch-free)
    });

  await bench.run();
  console.table(bench.table());
  return bench;
}
