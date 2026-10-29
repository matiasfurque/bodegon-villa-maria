import type { Prisma } from "@prisma/client";

// Two seconds is shorter than Prisma's 5s transaction timeout; scope is this transaction only.
export async function setOperationLockTimeout(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('lock_timeout', '2000ms', true)`;
}
