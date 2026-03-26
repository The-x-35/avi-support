import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PERF_ENABLED = process.env.PERF_LOG !== "false";

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function colorMs(ms: number): string {
  if (ms < 100) return `\x1b[32m${ms.toFixed(1)}ms\x1b[0m`;
  if (ms < 500) return `\x1b[33m${ms.toFixed(1)}ms\x1b[0m`;
  return `\x1b[31m${ms.toFixed(1)}ms\x1b[0m`;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const start = performance.now();
          const result = await query(args);
          if (PERF_ENABLED) {
            const ms = performance.now() - start;
            process.stderr.write(`[DB]   ${pad(`${model}.${operation}`, 44)} ${colorMs(ms)}\n`);
          }
          return result;
        },
      },
    },
  });
}

type PrismaWithExtensions = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaWithExtensions | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
