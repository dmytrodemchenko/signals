import { Bench } from 'tinybench';
import { signal, effect, batch } from '../../../src/signals.js';
import { BehaviorSubject, Subscription } from 'rxjs';

export async function runNestJsSubscribers() {
  const bench = new Bench({ time: 1000 });

  console.log('\n--- Test 4: NestJS WebSocket Simulation (1000 Subscribers) ---');

  bench
    .add('RxJS (1000 Subscriptions)', () => {
      const state = new BehaviorSubject(0);
      const subs: Subscription[] = [];
      let lastVal = 0;

      // Simulate 1000 connected clients
      for (let i = 0; i < 1000; i++) {
        subs.push(state.subscribe(v => {
          lastVal = v;
        }));
      }

      state.next(1);
      state.next(2);

      // Cleanup
      subs.forEach(s => s.unsubscribe());
    })
    .add('Sigil (1000 Effects)', () => {
      const state = signal(0);
      const disposers: (() => void)[] = [];
      let lastVal = 0;

      // Simulate 1000 connected clients
      for (let i = 0; i < 1000; i++) {
        disposers.push(effect(() => {
          lastVal = state();
        }));
      }

      batch(() => {
        state.set(1);
        state.set(2);
      });

      // Cleanup
      disposers.forEach(d => d());
    });

  await bench.run();
  console.table(bench.table());
  return bench;
}
