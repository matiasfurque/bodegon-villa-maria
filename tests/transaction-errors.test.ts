import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableMock, orderMock, accountMock } = vi.hoisted(() => ({
  tableMock: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  orderMock: { create: vi.fn(), addItem: vi.fn(), update: vi.fn(), cancelItem: vi.fn() },
  accountMock: { close: vi.fn() }
}));

vi.mock("@/lib/api", () => ({
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  requirePermission: async () => ({ error: null, session: { userId: 7 } }),
  requireAnyPermission: async () => ({ error: null, session: { userId: 7 } })
}));
vi.mock("@/modules/tables/table.service", () => ({ tableService: tableMock }));
vi.mock("@/modules/orders/order.service", () => ({ orderService: orderMock }));
vi.mock("@/modules/accounts/account.service", () => ({
  accountService: accountMock,
  CloseAccountError: class CloseAccountError extends Error { status = 400; }
}));

import { transactionErrorResponse } from "@/lib/transaction-error";
import { POST as createMesa } from "@/app/api/mesas/route";
import { PATCH as updateMesa } from "@/app/api/mesas/[id]/route";
import { POST as createPedido } from "@/app/api/pedidos/route";
import { POST as addItem } from "@/app/api/pedidos/[id]/items/route";
import { POST as closeAccount } from "@/app/api/cuentas/route";

const request = (body: Record<string, unknown>) => ({ json: async () => body }) as NextRequest;
const params = { params: Promise.resolve({ id: "1" }) };
const prismaError = (code: string, detail?: string) => new Prisma.PrismaClientKnownRequestError("raw Prisma detail", {
  code, clientVersion: "6.19.3", meta: detail ? { error: detail } : undefined
});
const expired = prismaError("P2028", "Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 7000 ms passed since the start of the transaction.");
const startTimeout = prismaError("P2028", "Unable to start a transaction in the given time.");
const lockTimeout = new Prisma.PrismaClientKnownRequestError("raw Prisma detail", {
  code: "P2010", clientVersion: "6.19.3",
  meta: { code: "55P03", message: "ERROR: canceling statement due to lock timeout" }
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const mock of Object.values({ ...tableMock, ...orderMock, ...accountMock })) mock.mockReset();
});

describe("errores de transacción operativa", () => {
  it.each([expired, startTimeout, prismaError("P2034"), lockTimeout])("solo traduce errores transitorios identificados a 503", async (error) => {
    const response = transactionErrorResponse(error, "pedido");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatch(/no se pudo confirmar/i);
    expect(JSON.stringify(body)).not.toMatch(/Prisma|P2028|P2034|Transaction/);
  });

  it.each([
    prismaError("P2028", "Transaction already closed for another reason"),
    new Prisma.PrismaClientKnownRequestError("raw Prisma detail", {
      code: "P2010", clientVersion: "6.19.3", meta: { code: "55P03", message: "otro error de bloqueo" }
    }),
    new Prisma.PrismaClientKnownRequestError("raw Prisma detail", {
      code: "P2010", clientVersion: "6.19.3", meta: { code: "99999", message: "ERROR: canceling statement due to lock timeout" }
    }),
    new Error("unexpected")
  ])(
    "no clasifica un error desconocido como timeout ni conflicto de negocio", async (error) => {
      const response = transactionErrorResponse(error, "mesa");
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("raw Prisma detail");
    }
  );

  it("Mesa devuelve 503 sin llamar dos veces al Service", async () => {
    tableMock.create.mockRejectedValue(startTimeout);
    const response = await createMesa(request({ numero: 99, capacidad: 4 }));
    expect(response.status).toBe(503);
    expect(tableMock.create).toHaveBeenCalledOnce();
  });

  it("conserva 409 para una revisión de Mesa desactualizada", async () => {
    tableMock.update.mockResolvedValue({ error: "La mesa cambió", status: 409 });
    const response = await updateMesa(request({ revisionEsperada: 0, atencionTokenEsperado: null }), params);
    expect(response.status).toBe(409);
  });

  it("Pedido devuelve 503 y conserva el solicitudId recibido sin reintentar", async () => {
    orderMock.create.mockRejectedValue(expired);
    const body = { mesaId: 1, atencionToken: "11111111-1111-4111-8111-111111111111",
      solicitudId: "22222222-2222-4222-8222-222222222222", items: [{ productoId: 5, cantidad: 1 }] };
    const response = await createPedido(request(body));
    expect(response.status).toBe(503);
    expect(orderMock.create).toHaveBeenCalledOnce();
    expect(orderMock.create.mock.calls[0][0].solicitudId).toBe(body.solicitudId);
  });

  it("agregado de ítem devuelve 503 sin reintento automático", async () => {
    orderMock.addItem.mockRejectedValue(expired);
    const response = await addItem(request({ productoId: 5, solicitudId: "22222222-2222-4222-8222-222222222222" }), params);
    expect(response.status).toBe(503);
    expect(orderMock.addItem).toHaveBeenCalledOnce();
  });

  it("Cuentas trata P2034 como transitorio y no como conflicto de atención", async () => {
    accountMock.close.mockRejectedValue(prismaError("P2034"));
    const response = await closeAccount(request({ mesaId: 1, atencionToken: "11111111-1111-4111-8111-111111111111" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Verificar resultado del cobro/);
    expect(accountMock.close).toHaveBeenCalledOnce();
  });

  it("las cuatro rutas críticas devuelven 503 ante el lock_timeout observado, sin repetir la acción", async () => {
    tableMock.update.mockRejectedValue(lockTimeout);
    orderMock.create.mockRejectedValue(lockTimeout);
    orderMock.addItem.mockRejectedValue(lockTimeout);
    accountMock.close.mockRejectedValue(lockTimeout);
    const results = await Promise.all([
      updateMesa(request({ revisionEsperada: 0, atencionTokenEsperado: null }), params),
      createPedido(request({ mesaId: 1, atencionToken: "11111111-1111-4111-8111-111111111111",
        solicitudId: "22222222-2222-4222-8222-222222222222", items: [{ productoId: 5, cantidad: 1 }] })),
      addItem(request({ productoId: 5, solicitudId: "22222222-2222-4222-8222-222222222222" }), params),
      closeAccount(request({ mesaId: 1, atencionToken: "11111111-1111-4111-8111-111111111111" }))
    ]);
    expect(results.map((result) => result.status)).toEqual([503, 503, 503, 503]);
    expect(tableMock.update).toHaveBeenCalledOnce();
    expect(orderMock.create).toHaveBeenCalledOnce();
    expect(orderMock.addItem).toHaveBeenCalledOnce();
    expect(accountMock.close).toHaveBeenCalledOnce();
    expect((await results[3].json()).error).toMatch(/Verificar resultado del cobro/);
  });
});
