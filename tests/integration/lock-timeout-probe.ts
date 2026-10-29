import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Prisma, PrismaClient } from "@prisma/client";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_tx_wait_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_tx_wait_20261028");
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: `${process.env.DATABASE_URL}&connection_limit=1` } } });
  const holder = new PrismaClient();
  const other = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_tx_wait_20261028", host: "127.0.0.1", port: 55432 });
    const mesa = await db.mesa.findFirstOrThrow({ orderBy: { id: "asc" } });
    const rollbackMesa = await db.mesa.findFirstOrThrow({ where: { id: { not: mesa.id } } });
    const results = [];
    for (const timeoutMs of [1000, 2000, 3000]) {
      let ready!: () => void;
      const locked = new Promise<void>((resolve) => { ready = resolve; });
      const holding = holder.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesa.id} FOR UPDATE`;
        ready();
        await new Promise((resolve) => setTimeout(resolve, 4100));
      }, { timeout: 10000 });
      await locked;
      const started = performance.now();
      let reachedAfterLock = false;
      let errorInfo: { name: string; code?: string; meta?: unknown } | null = null;
      try {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${timeoutMs}ms`}, true)`;
          const [inside] = await tx.$queryRaw<Array<{ value: string }>>`SELECT current_setting('lock_timeout') AS value`;
          assert.notEqual(inside.value, "0");
          const [outside] = await other.$queryRaw<Array<{ value: string }>>`SELECT current_setting('lock_timeout') AS value`;
          assert.equal(outside.value, "0");
          await tx.mesa.update({ where: { id: rollbackMesa.id }, data: { descripcion: `ROLLBACK PROBE ${timeoutMs}` } });
          await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesa.id} FOR UPDATE`;
          reachedAfterLock = true;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          errorInfo = { name: error.name, code: error.code, meta: error.meta };
        } else {
          errorInfo = { name: error instanceof Error ? error.name : typeof error };
        }
      }
      const elapsedMs = Math.round(performance.now() - started);
      await holding;
      const [localSetting] = await db.$queryRaw<Array<{ lock_timeout: string }>>`SHOW lock_timeout`;
      const [otherSetting] = await other.$queryRaw<Array<{ lock_timeout: string }>>`SHOW lock_timeout`;
      assert.equal(reachedAfterLock, false);
      assert.equal((await db.mesa.findUniqueOrThrow({ where: { id: rollbackMesa.id } })).descripcion, rollbackMesa.descripcion);
      assert.equal(localSetting.lock_timeout, "0");
      assert.equal(otherSetting.lock_timeout, "0");
      results.push({ timeoutMs, elapsedMs, reachedAfterLock, errorInfo,
        localSetting: localSetting.lock_timeout, otherSetting: otherSetting.lock_timeout });
    }
    let ready!: () => void;
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const holding = holder.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesa.id} FOR UPDATE`;
      ready();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }, { timeout: 10000 });
    await locked;
    const started = performance.now();
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('lock_timeout', '2000ms', true)`;
      await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesa.id} FOR UPDATE`;
    });
    const shortWaitMs = Math.round(performance.now() - started);
    await holding;
    assert.ok(shortWaitMs < 2000);
    const evidence = { identity, mesaId: mesa.id, longWaits: results, shortWaitMs };
    await writeFile("tests/evidence/lock-timeout-probe-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await Promise.all([db.$disconnect(), holder.$disconnect(), other.$disconnect()]);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
