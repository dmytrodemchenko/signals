# Benchmark Results

**Date:** 2026-04-25
**Node.js:** v24.13.0

## 1. Basic Reads & Writes (vs RxJS)
| Task | ops/sec | Margin of Error |
|---|---|---|
| RxJS: BehaviorSubject + getValue() | 15016665.13 | ±0.00% |
| Sigil: signal() + set() | 3279469.38 | ±0.00% |

## 2. Diamond Problem (vs RxJS)
| Task | ops/sec | Margin of Error |
|---|---|---|
| RxJS: BehaviorSubject + combineLatest | 738622.49 | ±0.00% |
| Sigil: signal + computed | 565933.52 | ±0.00% |

## 3. Creation & Bulk Updates (vs Competitors)
| Task | ops/sec | Margin of Error |
|---|---|---|
| @preact/signals-core | 1151960.74 | ±0.00% |
| alien-signals | 7896035.56 | ±0.00% |
| Sigil (Our Library) | 372426.52 | ±0.00% |

## 4. NestJS WebSocket Simulation (1000 Subscriptions)
| Task | ops/sec | Margin of Error |
|---|---|---|
| RxJS (1000 Subscriptions) | 4556.48 | ±0.00% |
| Sigil (1000 Effects) | 2818.32 | ±0.02% |
