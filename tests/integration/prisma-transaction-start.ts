import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_tx_wait_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_tx_wait_20261028");
}
target.searchParams.set("connection_limit", "1");

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_tx_wait_20261028", host: "127.0.0.1", port: 55432 });
    let signal!: () => void;
    const ready = new Promise<void>((resolve) => { signal = resolve; });
    const holding = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      signal();
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }, { timeout: 7000 });
    await ready;
    const start = performance.now();
    let outcome: { name: string; code?: string; meta?: unknown; message: string } | null = null;
    try {
      await db.$transaction(async (tx) => { await tx.$queryRaw`SELECT 1`; });
    } catch (error) {
      const candidate = error as { name: string; code?: string; meta?: unknown; message: string };
      outcome = { name: candidate.name, code: candidate.code, meta: candidate.meta, message: candidate.message };
    }
    const elapsedMs = Math.round(performance.now() - start);
    await holding;
    assert.equal(outcome?.code, "P2028");
    assert.match(outcome.message, /Unable to start a transaction in the given time/);
    const evidence = { target: identity, elapsedMs, outcome, holder: "committed" };
    await writeFile("tests/evidence/prisma-transaction-start-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
