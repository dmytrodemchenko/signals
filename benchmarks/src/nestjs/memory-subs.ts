import { Bench } from 'tinybench';
import { signal, effect, batch } from '../../../src/index.js';
import { BehaviorSubject, Subscription } from 'rxjs';

export async function runNestJsSubscribers() {
  const bench = new Bench({ time: 1000, warmupTime: 500, warmupIterations: 100 });

  console.log('\n--- Test 4: NestJS WebSocket Simulation (1000 Subscribers) ---');

  // RxJS setup
  const rxjsState = new BehaviorSubject(0);
  const rxjsSubs: Subscription[] = [];
  for (let i = 0; i < 1000; i++) {
    rxjsSubs.push(rxjsState.subscribe(v => {}));
  }

  // Signals setup
  const signalsState = signal(0);
  const signalsDisposers: (() => void)[] = [];
  for (let i = 0; i < 1000; i++) {
    signalsDisposers.push(effect(() => {
      const val = signalsState();
    }));
  }

  bench
    .add('RxJS (1000 Subscriptions)', () => {
      rxjsState.next(1);
      rxjsState.next(2);
    })
    .add('@demchenko.di/signals (1000 Effects)', () => {
      batch(() => {
        signalsState.set(1);
        signalsState.set(2);
      });
    });

  await bench.run();

  // Cleanup
  rxjsSubs.forEach(s => s.unsubscribe());
  rxjsState.complete();
  signalsDisposers.forEach(d => d());

  console.table(bench.table());
  return bench;
}
