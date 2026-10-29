import type { Prisma, PrismaClient } from "@prisma/client";
import { CODES } from "@/lib/normalized";
import { accountInclude, type AccountListFilter } from "./account.types";

type AccountDb = PrismaClient | Prisma.TransactionClient;

export const accountRepository = {
  findClosedResultForUser(db: AccountDb, atencionToken: string, usuarioCierreId: number) {
    return db.cuenta.findFirst({
      where: { atencionToken, usuarioCierreId, estado: { esCerrada: true } },
      select: {
        id: true, mesaId: true, atencionToken: true, fechaCierre: true, total: true,
        mesa: { select: { numero: true } },
        metodoPago: { select: { nombre: true } },
        estado: { select: { nombre: true } }
      }
    });
  },

  list(db: AccountDb, filter: AccountListFilter) {
    return db.cuenta.findMany({
      where: {
        mesaId: filter.mesaId,
        fechaCierre: filter.hasDateFilter ? {
          gte: filter.fromDate,
          lte: filter.toDate
        } : undefined
      },
      orderBy: { fechaCierre: "desc" },
      include: accountInclude
    });
  },

  findPaymentMethod(db: AccountDb, value: string) {
    return db.metodoPago.findFirst({
      where: value
        ? { estado: { habilitado: true }, OR: [{ codigo: value }, { nombre: { equals: value, mode: "insensitive" } }] }
        : { codigo: CODES.pago.efectivo, estado: { habilitado: true } }
    });
  },

  findClosedState(db: AccountDb) {
    return db.cuentaEstado.findUniqueOrThrow({ where: { codigo: CODES.cuenta.cerrada } });
  },

  create(db: AccountDb, data: Prisma.CuentaUncheckedCreateInput) {
    return db.cuenta.create({ data, include: accountInclude });
  }
};
