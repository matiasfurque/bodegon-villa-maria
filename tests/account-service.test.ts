import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $transaction: vi.fn(), cuenta: { findMany: vi.fn() } }
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { accountService } from "@/modules/accounts/account.service";
import { serializeAccount } from "@/modules/accounts/account.serializer";
import { CODES } from "@/lib/normalized";

const token = "11111111-1111-4111-8111-111111111111";
const oldToken = "22222222-2222-4222-8222-222222222222";
const closeInput = { mesaId: 1, atencionToken: token, usuarioCierreId: 7, montoRecibido: 200 };

function closingTransaction() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    mesa: {
      findUnique: vi.fn().mockResolvedValue({ id: 1, atencionToken: token, estado: { codigo: CODES.mesa.ocupada } }),
      update: vi.fn().mockResolvedValue({ id: 1 })
    },
    pedido: {
      findMany: vi.fn().mockResolvedValue([{
        id: 10,
        atencionToken: token,
        estadoCocina: { nombre: "Entregado", visibleCocina: false },
        items: [
          { productoId: 5, producto: { nombre: "Plato", precio: 999 }, cantidad: 2,
            precioUnitario: 90, subtotal: 180, observacion: "Sin sal", estado: { esAnulado: false } },
          { productoId: 6, producto: { nombre: "Bebida", precio: 500 }, cantidad: 1,
            precioUnitario: 50, subtotal: 50, observacion: null, estado: { esAnulado: true } }
        ]
      }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    metodoPago: { findFirst: vi.fn().mockResolvedValue({ id: 3, requiereMontoRecibido: true }) },
    pedidoEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 2 }) },
    mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
    cuentaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
    cuenta: { create: vi.fn().mockResolvedValue({ id: 80 }) }
  };
  prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return tx;
}

beforeEach(() => {
  prismaMock.$transaction.mockReset();
  prismaMock.cuenta.findMany.mockReset();
});

describe("AccountService", () => {
  it("bloquea Mesa, Pedidos e Ítems en orden y factura el precio histórico", async () => {
    const tx = closingTransaction();
    const result = await accountService.close(closeInput);
    expect(result).toEqual({ id: 80 });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
    expect(tx.$queryRaw.mock.calls.map((call) => call[0].join(""))).toEqual([
      expect.stringContaining("set_config('lock_timeout', '2000ms', true)"),
      expect.stringContaining('FROM "Mesa"'),
      expect.stringContaining('FROM "Pedido"'),
      expect.stringContaining('FROM "PedidoItem"')
    ]);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[1]);
    expect(tx.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(tx.pedido.findMany.mock.invocationCallOrder[0]);
    expect(tx.pedido.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.cuenta.create.mock.invocationCallOrder[0]);
    expect(tx.cuenta.create.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
    expect(tx.cuenta.create.mock.calls[0][0].data).toMatchObject({
      atencionToken: token,
      total: 180,
      montoRecibido: 200,
      vuelto: 20,
      detalles: { create: [{ pedidoId: 10, productoId: 5, productoNombre: "Plato",
        cantidad: 2, precioUnitario: 90, subtotal: 180, observacion: "Sin sal" }] }
    });
    expect(tx.pedido.updateMany.mock.calls[0][0].where.atencionToken).toBe(token);
    expect(tx.mesa.update.mock.calls[0][0].data).toMatchObject({
      atencionToken: null, revision: { increment: 1 }, abiertaAt: null, abiertaPor: null
    });
  });

  it("rechaza un token ausente o mal formado antes de escribir", async () => {
    for (const atencionToken of [undefined, null, "invalido"]) {
      await expect(accountService.close({ ...closeInput, atencionToken })).rejects.toMatchObject({ status: 400 });
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza una atención anterior después de bloquear Mesa", async () => {
    const tx = closingTransaction();
    await expect(accountService.close({ ...closeInput, atencionToken: oldToken })).rejects.toMatchObject({ status: 409 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.pedido.findMany).not.toHaveBeenCalled();
    expect(tx.cuenta.create).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("no mezcla pedidos de otra atención ni pedidos históricos sin token", async () => {
    for (const atencionToken of [oldToken, null]) {
      const tx = closingTransaction();
      tx.pedido.findMany.mockResolvedValueOnce([{ atencionToken, estadoCocina: { visibleCocina: false }, items: [] }]);
      await expect(accountService.close(closeInput)).rejects.toMatchObject({ status: 409 });
      expect(tx.pedido.updateMany).not.toHaveBeenCalled();
      expect(tx.cuenta.create).not.toHaveBeenCalled();
      expect(tx.mesa.update).not.toHaveBeenCalled();
    }
  });

  it("rechaza mesas históricas sin token y un cierre antiguo tras reocupar", async () => {
    for (const atencionToken of [null, oldToken]) {
      const tx = closingTransaction();
      tx.mesa.findUnique.mockResolvedValueOnce({ id: 1, atencionToken, estado: { codigo: CODES.mesa.ocupada } });
      await expect(accountService.close(closeInput)).rejects.toMatchObject({ status: 409 });
      expect(tx.cuenta.create).not.toHaveBeenCalled();
    }
  });

  it("propaga el fallo de persistencia para que Prisma revierta la transacción", async () => {
    const tx = closingTransaction();
    tx.cuenta.create.mockRejectedValueOnce(new Error("Fallo de persistencia"));
    await expect(accountService.close(closeInput))
      .rejects.toThrow("Fallo de persistencia");
    expect(tx.pedido.updateMany).toHaveBeenCalledOnce();
    expect(tx.mesa.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it("no inicia una segunda transacción ni incrementa revisión si falla la liberación", async () => {
    const tx = closingTransaction();
    tx.mesa.update.mockRejectedValueOnce(new Error("Fallo al liberar"));
    await expect(accountService.close(closeInput)).rejects.toThrow("Fallo al liberar");
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(tx.cuenta.create).toHaveBeenCalledOnce();
    expect(tx.mesa.update).toHaveBeenCalledOnce();
  });

  it("lista el historial con filtros y orden de cierre existentes", async () => {
    const fromDate = new Date(2026, 9, 1);
    const toDate = new Date(2026, 9, 31);
    prismaMock.cuenta.findMany.mockResolvedValue([{ id: 80 }]);
    const rows = await accountService.list({ mesaId: 1, fromDate, toDate, hasDateFilter: true });
    expect(rows).toEqual([{ id: 80 }]);
    expect(prismaMock.cuenta.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { mesaId: 1, fechaCierre: { gte: fromDate, lte: toDate } },
      orderBy: { fechaCierre: "desc" },
      include: expect.objectContaining({ detalles: true, metodoPago: true, estado: true })
    }));
  });

  it("serializa cuentas actuales e históricas conservando campos del historial", () => {
    const base = {
      id: 80, atencionToken: token, detalles: [{ id: 1, subtotal: 180 }],
      mesa: { id: 1, estado: { nombre: "Libre", codigo: CODES.mesa.libre, permitePedido: false, liberaMesa: true } },
      metodoPago: { nombre: "Efectivo", codigo: CODES.pago.efectivo, requiereMontoRecibido: true },
      estado: { nombre: "Cerrada", codigo: CODES.cuenta.cerrada }
    };
    for (const atencionToken of [token, null]) {
      const result = serializeAccount({ ...base, atencionToken } as unknown as Parameters<typeof serializeAccount>[0]);
      expect(result).toMatchObject({ id: 80, atencionToken, metodoPago: "Efectivo", estado: "Cerrada" });
      expect(JSON.parse(result.detalleJson)).toEqual(base.detalles);
    }
  });
});
