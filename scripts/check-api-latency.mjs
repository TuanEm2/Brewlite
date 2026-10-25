// Run with an existing backend + sample PostgreSQL dataset. No load generation.
import { performance } from 'node:perf_hooks';
const target = process.env.API_URL ?? 'http://localhost:4000/api/health';
const durations = [];
try {
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
    await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (i >= 5) durations.push(performance.now() - start); // 5 warm-up calls
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  const average = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`${target}: avg=${average.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, max=${durations.at(-1).toFixed(1)}ms (n=${durations.length})`);
  if (p95 >= 500) process.exitCode = 1;
} catch (error) {
  console.error('Unable to measure API latency:', error);
  process.exitCode = 1;
}
