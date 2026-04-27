import fs from 'fs';
import path from 'path';
import { runSignalVsBehaviorSubject, runComputedVsCombineLatest } from './src/basic/rxjs-comparison.js';
import { runCompetitorBenchmark } from './src/competitors/competitors.js';
import { runNestJsSubscribers } from './src/nestjs/memory-subs.js';

async function main() {
  console.log('🚀 Running Signals Benchmark Suite...\n');

  const b1 = await runSignalVsBehaviorSubject();
  const b2 = await runComputedVsCombineLatest();
  const b3 = await runCompetitorBenchmark();
  const b4 = await runNestJsSubscribers();

  console.log('\n✅ Benchmarks complete. Generating report...');

  const date = new Date().toISOString().split('T')[0];
  const nodeVersion = process.version;

  let report = `# Benchmark Results\n\n`;
  report += `**Date:** ${date}\n`;
  report += `**Node.js:** ${nodeVersion}\n\n`;

  report += `## 1. Basic Reads & Writes (vs RxJS)\n`;
  report += `| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |\n`;
  report += `|---|---|---|---|---|\n`;
  b1.tasks.forEach(t => {
    report += `| ${t.name} | ${t.result?.hz.toFixed(2)} | ±${t.result?.moe.toFixed(2)}% | ${(t.result?.min !== undefined ? (t.result.min * 1e9).toFixed(2) : 'N/A')} | ${(t.result?.max !== undefined ? (t.result.max * 1e9).toFixed(2) : 'N/A')} |\n`;
  });

  report += `\n## 2. Diamond Problem (vs RxJS)\n`;
  report += `| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |\n`;
  report += `|---|---|---|---|---|\n`;
  b2.tasks.forEach(t => {
    report += `| ${t.name} | ${t.result?.hz.toFixed(2)} | ±${t.result?.moe.toFixed(2)}% | ${(t.result?.min !== undefined ? (t.result.min * 1e9).toFixed(2) : 'N/A')} | ${(t.result?.max !== undefined ? (t.result.max * 1e9).toFixed(2) : 'N/A')} |\n`;
  });

  report += `\n## 3. Creation & Bulk Updates (vs Competitors)\n`;
  report += `| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |\n`;
  report += `|---|---|---|---|---|\n`;
  b3.tasks.forEach(t => {
    report += `| ${t.name} | ${t.result?.hz.toFixed(2)} | ±${t.result?.moe.toFixed(2)}% | ${(t.result?.min !== undefined ? (t.result.min * 1e9).toFixed(2) : 'N/A')} | ${(t.result?.max !== undefined ? (t.result.max * 1e9).toFixed(2) : 'N/A')} |\n`;
  });

  report += `\n## 4. NestJS WebSocket Simulation (1000 Subscriptions)\n`;
  report += `| Task | ops/sec | Margin of Error | Min (ns) | Max (ns) |\n`;
  report += `|---|---|---|---|---|\n`;
  b4.tasks.forEach(t => {
    report += `| ${t.name} | ${t.result?.hz.toFixed(2)} | ±${t.result?.moe.toFixed(2)}% | ${(t.result?.min !== undefined ? (t.result.min * 1e9).toFixed(2) : 'N/A')} | ${(t.result?.max !== undefined ? (t.result.max * 1e9).toFixed(2) : 'N/A')} |\n`;
  });

  const filePath = path.resolve('results/latest.md');
  console.log(`Report preview:\n${report.substring(0, 200)}...`);
  console.log(`Writing to: ${filePath}`);
  fs.writeFileSync(filePath, report);
  console.log(`📄 Saved to results/latest.md`);
}

main().catch(console.error);
