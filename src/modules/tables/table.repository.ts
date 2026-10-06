import type { Prisma, PrismaClient } from "@prisma/client";
import { CODES } from "@/lib/normalized";

type TableDb = PrismaClient | Prisma.TransactionClient;

const withRelations = { estado: true, sector: true } as const;

export const tableRepository = {
  list(db: TableDb) {
    return db.mesa.findMany({ orderBy: { numero: "asc" }, include: withRelations });
  },

  findByNumber(db: TableDb, numero: number) {
    return db.mesa.findUnique({ where: { numero }, include: withRelations });
  },

  findByIdOrThrow(db: TableDb, id: number) {
    return db.mesa.findUniqueOrThrow({ where: { id }, include: { estado: true } });
  },

  lock(db: TableDb, id: number) {
    return db.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${id} FOR UPDATE`;
  },

  countActiveOrders(db: TableDb, mesaId: number) {
    return db.pedido.count({ where: { mesaId, estado: { esActivo: true } } });
  },

  findState(db: TableDb, text: string, fallbackCodigo: string) {
    return db.mesaEstado.findFirstOrThrow({
      where: text
        ? { OR: [{ codigo: text }, { nombre: { equals: text, mode: "insensitive" } }] }
        : { codigo: fallbackCodigo }
    });
  },

  findStateByCode(db: TableDb, codigo: string) {
    return db.mesaEstado.findUniqueOrThrow({ where: { codigo } });
  },

  async upsertSector(db: TableDb, nombre: string) {
    const estado = await db.sectorMesaEstado.findUniqueOrThrow({ where: { codigo: CODES.sector.activo } });
    return db.sectorMesa.upsert({
      where: { nombre },
      update: { estadoId: estado.id },
      create: { nombre, estadoId: estado.id }
    });
  },

  create(db: TableDb, data: Prisma.MesaUncheckedCreateInput) {
    return db.mesa.create({ data, include: withRelations });
  },

  update(db: TableDb, id: number, data: Prisma.MesaUncheckedUpdateInput) {
    return db.mesa.update({ where: { id }, data, include: withRelations });
  }
};
