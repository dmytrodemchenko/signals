# Benchmark Results

**Date:** 2026-04-27
**Node.js:** v24.15.0

## 1. Basic Reads & Writes (vs RxJS)
| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |
|---|---|---|---|---|
| RxJS: BehaviorSubject + getValue() | 16404921.05 | ±0.00% | 0.00 | 1546625000.00 |
| @demchenko.di/signals: signal() + set() | 4776133.84 | ±0.00% | 125000.00 | 2528084000.00 |

## 2. Diamond Problem (vs RxJS)
| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |
|---|---|---|---|---|
| RxJS: BehaviorSubject + combineLatest | 854170.75 | ±0.00% | 916000.00 | 255292000.00 |
| @demchenko.di/signals: signal + computed | 1280790.23 | ±0.00% | 500000.00 | 10952875000.00 |

## 3. Creation & Bulk Updates (vs Competitors)
| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |
|---|---|---|---|---|
| @preact/signals-core: graph update | 1489811.77 | ±0.00% | 458000.00 | 1871375000.00 |
| alien-signals: graph update | 2239124.48 | ±0.00% | 291000.00 | 6670958000.00 |
| @demchenko.di/signals: graph update | 1903116.98 | ±0.00% | 375000.00 | 7784166000.00 |

## 4. NestJS WebSocket Simulation (1000 Subscriptions)
| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |
|---|---|---|---|---|
| RxJS (1000 Subscriptions) | 30077.66 | ±0.00% | 25208000.00 | 1025125000.00 |
| @demchenko.di/signals (1000 Effects) | 43831.18 | ±0.00% | 19375000.00 | 1062583000.00 |
