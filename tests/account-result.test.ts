import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: { cuenta: { findFirst: vi.fn(), create: vi.fn() }, $transaction: vi.fn() },
  authMock: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api", () => ({
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  requirePermission: authMock
}));

import { GET } from "@/app/api/cuentas/resultado/route";

const token = "11111111-1111-4111-8111-111111111111";
const nextToken = "22222222-2222-4222-8222-222222222222";
const request = (value: string) => new NextRequest(`http://localhost/api/cuentas/resultado?atencionToken=${value}`);
const confirmed = {
  id: 80, mesaId: 4, atencionToken: token, fechaCierre: new Date("2026-10-28T15:00:00Z"),
  total: 12000, mesa: { numero: 4 }, metodoPago: { nombre: "Efectivo" },
  estado: { nombre: "Cerrada" }, detalles: [{ productoNombre: "No exponer" }]
};

beforeEach(() => {
  prismaMock.cuenta.findFirst.mockReset();
  prismaMock.cuenta.create.mockReset();
  prismaMock.$transaction.mockReset();
  authMock.mockReset().mockResolvedValue({ error: null, session: { userId: 7 } });
});

describe("GET /api/cuentas/resultado", () => {
  it("devuelve solo la Cuenta cerrada del usuario autorizado y la atención solicitada", async () => {
    prismaMock.cuenta.findFirst.mockResolvedValue(confirmed);
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmado: true, cuenta: {
      id: 80, mesaId: 4, mesaNumero: 4, atencionToken: token,
      fechaCierre: "2026-10-28T15:00:00.000Z", total: 12000,
      metodoPago: "Efectivo", estado: "Cerrada"
    } });
    expect(authMock).toHaveBeenCalledWith(expect.anything(), "operaciones.gestionar");
    expect(prismaMock.cuenta.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { atencionToken: token, usuarioCierreId: 7, estado: { esCerrada: true } }
    }));
    expect(prismaMock.cuenta.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("no afirma fallo ni autoriza un nuevo cobro cuando aún no encuentra Cuenta", async () => {
    prismaMock.cuenta.findFirst.mockResolvedValue(null);
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ confirmado: false });
  });

  it("rechaza token inválido sin consultar la base", async () => {
    const response = await GET(request("incorrecto"));
    expect(response.status).toBe(400);
    expect(prismaMock.cuenta.findFirst).not.toHaveBeenCalled();
  });

  it.each([401, 403])("respeta rechazo de autenticación o permiso %i", async (status) => {
    authMock.mockResolvedValue({ error: Response.json({ error: "Rechazado" }, { status }), session: null });
    const response = await GET(request(token));
    expect(response.status).toBe(status);
    expect(prismaMock.cuenta.findFirst).not.toHaveBeenCalled();
  });

  it("oculta cierres de otro empleado sin enumerar cuentas", async () => {
    prismaMock.cuenta.findFirst.mockResolvedValue(null);
    const response = await GET(request(token));
    expect(await response.json()).toMatchObject({ confirmado: false });
    expect(prismaMock.cuenta.findFirst.mock.calls[0][0].where.usuarioCierreId).toBe(7);
  });

  it("conserva la atención original aunque la mesa ya esté libre o reocupada", async () => {
    prismaMock.cuenta.findFirst.mockResolvedValue(confirmed);
    const response = await GET(request(token));
    expect((await response.json()).cuenta.atencionToken).toBe(token);
    expect(prismaMock.cuenta.findFirst.mock.calls[0][0].where.atencionToken).not.toBe(nextToken);
  });

  it("las cuentas históricas con token NULL no aparecen", async () => {
    prismaMock.cuenta.findFirst.mockResolvedValue(null);
    const response = await GET(request(token));
    expect((await response.json()).confirmado).toBe(false);
    expect(prismaMock.cuenta.findFirst.mock.calls[0][0].where.atencionToken).toBe(token);
  });

  it("una falla de lectura se propaga y no produce confirmación falsa", async () => {
    prismaMock.cuenta.findFirst.mockRejectedValue(new Error("timeout"));
    await expect(GET(request(token))).rejects.toThrow("timeout");
  });
});
