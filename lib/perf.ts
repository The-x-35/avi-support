/**
 * Lightweight performance timer.
 * All output goes to stderr so it doesn't pollute JSON API responses.
 *
 * Usage:
 *   const t = perf("getConversations");
 *   // ... work ...
 *   t.end();               // prints: [PERF] getConversations  123.45ms
 *
 *   // Or inline async:
 *   const result = await perf.wrap("fetchUser", () => prisma.user.findUnique(...));
 */

const ENABLED = process.env.PERF_LOG !== "false"; // disable with PERF_LOG=false

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function colorMs(ms: number): string {
  if (ms < 100) return `\x1b[32m${ms.toFixed(1)}ms\x1b[0m`;   // green
  if (ms < 500) return `\x1b[33m${ms.toFixed(1)}ms\x1b[0m`;   // yellow
  return `\x1b[31m${ms.toFixed(1)}ms\x1b[0m`;                  // red
}

export function perf(label: string) {
  const start = performance.now();
  return {
    end(): number {
      const ms = performance.now() - start;
      if (ENABLED) {
        process.stderr.write(`[PERF] ${pad(label, 48)} ${colorMs(ms)}\n`);
      }
      return ms;
    },
    split(sublabel: string): void {
      const ms = performance.now() - start;
      if (ENABLED) {
        process.stderr.write(`[PERF] ${pad(`${label} → ${sublabel}`, 48)} ${colorMs(ms)}\n`);
      }
    },
  };
}

perf.wrap = async function wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = perf(label);
  try {
    return await fn();
  } finally {
    t.end();
  }
};

/** Wraps a Next.js App Router route handler with request timing. */
export function withTiming<Args extends unknown[]>(
  label: string,
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const t = perf(label);
    const res = await handler(...args);
    t.end();
    return res;
  };
}
