import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    mesa: { findUnique: vi.fn(), create: vi.fn() },
    pedido: { findMany: vi.fn() },
    mesaEstado: { findFirstOrThrow: vi.fn() },
    sectorMesaEstado: { findUniqueOrThrow: vi.fn() },
    sectorMesa: { upsert: vi.fn() },
    pedidoItemEstado: { findUniqueOrThrow: vi.fn() },
    motivoAnulacion: { findUniqueOrThrow: vi.fn() }
  }
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api", () => ({
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  requirePermission: async () => ({ error: null, session: { userId: 7 } }),
  requireAnyPermission: async () => ({ error: null, session: { userId: 7 } }),
  requireSession: () => ({ error: null, session: { userId: 7 } })
}));

import { CODES } from "@/lib/normalized";
import { PATCH as changeKitchenStatus } from "@/app/api/pedidos/[id]/route";
import { DELETE as annulItem } from "@/app/api/pedidos/items/[id]/route";
import { PATCH as updateMesa, DELETE as closeMesa } from "@/app/api/mesas/[id]/route";
import { POST as createMesa } from "@/app/api/mesas/route";
import { POST as closeAccount } from "@/app/api/cuentas/route";
import { GET as listPedidos, POST as createPedido } from "@/app/api/pedidos/route";
import { GET as getConsumos } from "@/app/api/consumos/route";
import { POST as addItem } from "@/app/api/pedidos/[id]/items/route";
import { orderService } from "@/modules/orders/order.service";

const mesaOcupada = { id: 2, codigo: CODES.mesa.ocupada, nombre: "Ocupada", permitePedido: true, liberaMesa: false };
const mesaLibre = { id: 1, codigo: CODES.mesa.libre, nombre: "Libre", permitePedido: false, liberaMesa: true };
const mesaCerrada = { id: 3, codigo: CODES.mesa.cerrada, nombre: "Cerrada", permitePedido: false, liberaMesa: false };
const orderToken = "22222222-2222-4222-8222-222222222222";
const itemRequestId = "33333333-3333-4333-8333-333333333333";
const orderRequestId = "55555555-5555-4555-8555-555555555555";
const pedidoActivo = { id: 1, codigo: CODES.pedido.activo, nombre: "Activo", esActivo: true };
const kitchenStates = [
  { id: 1, codigo: CODES.cocina.pendiente, nombre: "Pendiente", permiteAgregarItems: true, visibleCocina: true, notificaMozo: false },
  { id: 2, codigo: CODES.cocina.enPreparacion, nombre: "En preparacion", permiteAgregarItems: true, visibleCocina: true, notificaMozo: false },
  { id: 3, codigo: CODES.cocina.listo, nombre: "Listo", permiteAgregarItems: false, visibleCocina: true, notificaMozo: true },
  { id: 4, codigo: CODES.cocina.entregado, nombre: "Entregado", permiteAgregarItems: false, visibleCocina: false, notificaMozo: false }
];

function kitchen(code: string) {
  const state = kitchenStates.find((item) => item.codigo === code);
  if (!state) throw new Error(`Estado de prueba desconocido: ${code}`);
  return state;
}

function request(body: Record<string, unknown>): NextRequest {
  const orderMutation = "estadoCocina" in body || "motivo" in body || "productoId" in body ||
    ("mesaId" in body && "items" in body);
  return { json: async () => orderMutation
    ? { atencionToken: orderToken,
      ...("productoId" in body ? { solicitudId: itemRequestId } : {}),
      ...("mesaId" in body && "items" in body ? { solicitudId: orderRequestId } : {}), ...body }
    : body } as unknown as NextRequest;
}

function params(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function useTransaction(tx: object) {
  prismaMock.$transaction.mockImplementation(async (callback: (client: object) => Promise<unknown>) => callback(tx));
}

beforeEach(() => {
  prismaMock.$transaction.mockReset();
  prismaMock.mesa.findUnique.mockReset();
  prismaMock.mesa.create.mockReset();
  prismaMock.pedido.findMany.mockReset();
  prismaMock.mesaEstado.findFirstOrThrow.mockReset();
  prismaMock.sectorMesaEstado.findUniqueOrThrow.mockReset();
  prismaMock.sectorMesa.upsert.mockReset();
  prismaMock.pedidoItemEstado.findUniqueOrThrow.mockReset();
  prismaMock.motivoAnulacion.findUniqueOrThrow.mockReset();
});

function kitchenTransaction(currentCode: string) {
  let pedido = {
    id: 10,
    mesaId: 1,
    observacion: null as string | null,
    estado: pedidoActivo,
    estadoCocina: kitchen(currentCode),
    revisionContenido: 0,
    atencionToken: orderToken,
    mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken },
    usuario: { id: 7, nombre: "Ana", apellido: "Perez", usuario: "ana" },
    items: []
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: {
      findUnique: vi.fn().mockImplementation(async () => pedido),
      update: vi.fn().mockImplementation(async ({ data }: { data: { estadoCocinaId?: number; observacion?: string | null; revisionContenido?: { increment: number } } }) => {
        const next = kitchenStates.find((state) => state.id === data.estadoCocinaId);
        pedido = { ...pedido, estadoCocina: next || pedido.estadoCocina, observacion: data.observacion ?? pedido.observacion,
          revisionContenido: pedido.revisionContenido + (data.revisionContenido?.increment || 0) };
        return pedido;
      })
    },
    cuentaDetalle: { findFirst: vi.fn().mockResolvedValue(null) },
    pedidoEstadoCocina: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { OR: [{ codigo: string }, { nombre: { equals: string } }] } }) =>
        kitchenStates.find((state) => state.codigo === where.OR[0].codigo || state.nombre.toLowerCase() === where.OR[1].nombre.equals.toLowerCase()) || null
      )
    }
  };
  useTransaction(tx);
  return tx;
}

describe("estados de cocina y estado esperado", () => {
  it.each([
    [CODES.cocina.pendiente, CODES.cocina.enPreparacion],
    [CODES.cocina.enPreparacion, CODES.cocina.listo],
    [CODES.cocina.listo, CODES.cocina.entregado]
  ])("acepta %s -> %s", async (from, to) => {
    const tx = kitchenTransaction(from);
    const response = await changeKitchenStatus(request({ estadoCocina: to, estadoCocinaEsperado: from,
      ...(to === CODES.cocina.listo ? { revisionContenidoEsperada: 0 } : {}) }), params(10));
    expect(response.status).toBe(200);
    expect(tx.pedido.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoCocinaId: kitchen(to).id }) }));
    expect(tx.$queryRaw.mock.calls[0][0].join("")).toContain("set_config('lock_timeout', '2000ms', true)");
    expect(tx.$queryRaw.mock.calls[1][0].join("")).toContain("FOR UPDATE OF m");
    expect(tx.$queryRaw.mock.calls[2][0].join("")).toContain('FROM "Pedido"');
  });

  it.each([
    [CODES.cocina.pendiente, CODES.cocina.listo],
    [CODES.cocina.pendiente, CODES.cocina.entregado],
    [CODES.cocina.listo, CODES.cocina.pendiente],
    [CODES.cocina.entregado, CODES.cocina.pendiente],
    [CODES.cocina.entregado, CODES.cocina.enPreparacion],
    [CODES.cocina.entregado, CODES.cocina.listo]
  ])("rechaza %s -> %s", async (from, to) => {
    const tx = kitchenTransaction(from);
    const response = await changeKitchenStatus(request({ estadoCocina: to, estadoCocinaEsperado: from }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("devuelve 409 cuando el cliente vio Pendiente pero el pedido ya esta En preparacion", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.pendiente
    }), params(10));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/cambi[oó]/i);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("mantiene el control de estado esperado en produccion", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const tx = kitchenTransaction(CODES.cocina.enPreparacion);
      const response = await changeKitchenStatus(request({
        estadoCocina: CODES.cocina.listo,
        estadoCocinaEsperado: CODES.cocina.pendiente
      }), params(10));
      expect(response.status).toBe(409);
      expect(tx.pedido.update).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("acepta Listo si el cliente vio el estado real En preparacion", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion,
      revisionContenidoEsperada: 0
    }), params(10));
    expect(response.status).toBe(200);
    expect(tx.pedido.update).toHaveBeenCalledOnce();
  });

  it("exige la revisión observada al marcar Listo", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion
    }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("devuelve 409 si el contenido cambió desde la revisión que vio Cocina", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const current = await tx.pedido.findUnique();
    tx.pedido.findUnique.mockResolvedValue({ ...current, revisionContenido: 1 });
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion,
      revisionContenidoEsperada: 0
    }), params(10));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/recibió cambios/);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("acepta Listo después de revisar el contenido actualizado", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const current = await tx.pedido.findUnique();
    tx.pedido.findUnique.mockResolvedValue({ ...current, revisionContenido: 1 });
    const response = await changeKitchenStatus(request({ estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion, revisionContenidoEsperada: 1 }), params(10));
    expect(response.status).toBe(200);
    expect(tx.pedido.update).toHaveBeenCalledOnce();
  });

  it("permite repetir el mismo estado solo con el esperado correcto", async () => {
    const tx = kitchenTransaction(CODES.cocina.listo);
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.listo
    }), params(10));
    expect(response.status).toBe(200);
    expect(tx.pedido.update).toHaveBeenCalledOnce();
  });

  it("exige estado esperado para un cambio de cocina", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    const response = await changeKitchenStatus(request({ estadoCocina: CODES.cocina.enPreparacion }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });
});

function annulTransaction(options: { anulado?: boolean; cuentaCerrada?: boolean } = {}) {
  let item = {
    id: 50,
    pedidoId: 10,
    estado: { esAnulado: options.anulado || false },
    pedido: { id: 10, mesaId: 1, atencionToken: orderToken, estado: pedidoActivo, mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken } },
    motivoAnulacionDetalle: options.anulado ? "Motivo original" : null as string | null,
    motivoAnulacion: { nombre: "Otro" },
    producto: { id: 5, nombre: "Producto" }
  };
  const tx = {
    $queryRaw: vi.fn().mockImplementation(async (sql: TemplateStringsArray) => {
      const query = sql.join("");
      if (query.includes('FROM "Mesa"')) return [{ id: 1 }];
      if (query.includes('FROM "Pedido"')) return [{ id: 10 }];
      return [{ id: 50 }];
    }),
    pedidoItem: {
      findUnique: vi.fn().mockImplementation(async () => item),
      update: vi.fn().mockImplementation(async ({ data }: { data: { motivoAnulacionDetalle: string } }) => {
        item = { ...item, estado: { esAnulado: true }, motivoAnulacionDetalle: data.motivoAnulacionDetalle };
        return item;
      })
    },
    pedido: { update: vi.fn().mockResolvedValue({ id: 10, revisionContenido: 1 }) },
    pedidoItemEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 2 }) },
    motivoAnulacion: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 3 }) },
    cuentaDetalle: { findFirst: vi.fn().mockResolvedValue(options.cuentaCerrada ? { id: 99 } : null) }
  };
  useTransaction(tx);
  return { tx, getItem: () => item };
}

describe("anulacion de items", () => {
  it("anula logicamente un item activo con su motivo", async () => {
    const { tx, getItem } = annulTransaction();
    const response = await annulItem(request({ motivo: "Sin stock" }), params(50));
    expect(response.status).toBe(200);
    expect(getItem().motivoAnulacionDetalle).toBe("Sin stock");
    expect(tx.pedidoItem.update).toHaveBeenCalledOnce();
    expect(tx.pedido.update).toHaveBeenCalledOnce();
    expect(tx.pedido.update.mock.calls[0][0].data).toEqual({ revisionContenido: { increment: 1 } });
    expect(tx.motivoAnulacion.findUniqueOrThrow).toHaveBeenCalledWith({ where: { codigo: CODES.motivoAnulacion.sinStock } });
    expect(prismaMock.pedidoItemEstado.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.motivoAnulacion.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map((call) => call[0].join(""))).toEqual([
      expect.stringContaining("set_config('lock_timeout', '2000ms', true)"),
      expect.stringContaining("FOR UPDATE OF m"),
      expect.stringContaining("FOR UPDATE OF p"),
      expect.stringContaining('FROM "PedidoItem"')
    ]);
  });

  it("rechaza un item ya anulado", async () => {
    const { tx } = annulTransaction({ anulado: true });
    const response = await annulItem(request({ motivo: "Otro motivo" }), params(50));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.update).not.toHaveBeenCalled();
  });

  it("una segunda anulacion no reemplaza el motivo original", async () => {
    const { tx, getItem } = annulTransaction();
    expect((await annulItem(request({ motivo: "Motivo original" }), params(50))).status).toBe(200);
    expect((await annulItem(request({ motivo: "Motivo nuevo" }), params(50))).status).toBe(400);
    expect(getItem().motivoAnulacionDetalle).toBe("Motivo original");
    expect(tx.pedidoItem.update).toHaveBeenCalledOnce();
    expect(tx.pedido.update).toHaveBeenCalledOnce();
  });

  it("rechaza la anulacion si el pedido ya esta en una cuenta cerrada", async () => {
    const { tx } = annulTransaction({ cuentaCerrada: true });
    const response = await annulItem(request({ motivo: "Sin stock" }), params(50));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.update).not.toHaveBeenCalled();
  });
});

const tableToken = "11111111-1111-4111-8111-111111111111";

function mesaRequest(body: object, occupied = true): NextRequest {
  return request({ ...body, revisionEsperada: 0, atencionTokenEsperado: occupied ? tableToken : null });
}

function mesaTransaction(activePedidos: number, estado: typeof mesaLibre | typeof mesaCerrada | typeof mesaOcupada = mesaLibre) {
  const currentState = estado.codigo === CODES.mesa.ocupada ? mesaLibre : mesaOcupada;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: { count: vi.fn().mockResolvedValue(activePedidos), findFirst: vi.fn().mockResolvedValue(null) },
    mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(estado), findUniqueOrThrow: vi.fn().mockResolvedValue(estado) },
    mesa: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null,
        estadoId: currentState.id, estado: currentState, sector: null, revision: 0,
        atencionToken: currentState.codigo === CODES.mesa.ocupada ? tableToken : null }),
      update: vi.fn().mockResolvedValue({ id: 1, estado, sector: null })
    }
  };
  prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(estado);
  useTransaction(tx);
  return tx;
}

describe("liberacion y baja de mesa", () => {
  it("genera un UUID y aumenta la revisión al ocupar una mesa libre", async () => {
    const tx = mesaTransaction(0, mesaOcupada);
    const response = await updateMesa(mesaRequest({ estado: "Ocupada" }, false), params(1));
    expect(response.status).toBe(200);
    const data = tx.mesa.update.mock.calls[0][0].data;
    expect(data.atencionToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(data.revision).toEqual({ increment: 1 });
    expect(data.abiertaAt).toBeInstanceOf(Date);
    expect(data.abiertaPor).toBe(7);
  });

  it("ocupar nuevamente no cambia token, apertura ni revisión", async () => {
    const tx = mesaTransaction(0, mesaOcupada);
    tx.mesa.findUniqueOrThrow.mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null,
      estadoId: mesaOcupada.id, estado: mesaOcupada, sector: null, revision: 2, atencionToken: tableToken,
      abiertaAt: new Date("2026-01-01T00:00:00Z"), abiertaPor: 9 });
    const response = await updateMesa(request({ estado: "Ocupada", revisionEsperada: 2, atencionTokenEsperado: tableToken }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).not.toHaveBeenCalled();
    const mesa = await response.json();
    expect(mesa.revision).toBe(2);
    expect(mesa.atencionToken).toBe(tableToken);
    expect(mesa.abiertaPor).toBe(9);
  });

  it("rechaza con 409 una revisión vieja antes de cualquier escritura", async () => {
    const tx = mesaTransaction(0, mesaOcupada);
    const response = await updateMesa(request({ estado: "Ocupada", revisionEsperada: 9, atencionTokenEsperado: null }), params(1));
    expect(response.status).toBe(409);
    expect(tx.mesa.update).not.toHaveBeenCalled();
    expect(tx.mesaEstado.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("rechaza con 409 una atención equivocada aunque coincida la revisión", async () => {
    const tx = mesaTransaction(0);
    const response = await updateMesa(request({ descripcion: "Patio", revisionEsperada: 0, atencionTokenEsperado: null }), params(1));
    expect(response.status).toBe(409);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("rechaza con 409 una mesa ocupada histórica sin identidad", async () => {
    const tx = mesaTransaction(0);
    tx.mesa.findUniqueOrThrow.mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null,
      estadoId: mesaOcupada.id, estado: mesaOcupada, sector: null, revision: 0, atencionToken: null });
    const response = await updateMesa(mesaRequest({ estado: "Libre" }, false), params(1));
    expect(response.status).toBe(409);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("rechaza liberación y baja con revisión vieja", async () => {
    const tx = mesaTransaction(0);
    expect((await updateMesa(request({ estado: "Libre", revisionEsperada: 1, atencionTokenEsperado: tableToken }), params(1))).status).toBe(409);
    expect((await closeMesa(request({ revisionEsperada: 1, atencionTokenEsperado: tableToken }), params(1))).status).toBe(409);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("cambia metadatos sin crear otra atención", async () => {
    const tx = mesaTransaction(0);
    const response = await updateMesa(mesaRequest({ capacidad: 5 }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      capacidad: 5, revision: { increment: 1 }, atencionToken: undefined, abiertaAt: undefined, abiertaPor: undefined
    }) }));
  });

  it("rechaza reapertura de mesa con revisión antigua", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({ id: 1 });
    const tx = mesaTransaction(0);
    tx.mesa.findUniqueOrThrow.mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null,
      estadoId: mesaCerrada.id, estado: mesaCerrada, sector: null, revision: 3, atencionToken: null });
    const response = await createMesa(request({ numero: 1, capacidad: 4, revisionEsperada: 2, atencionTokenEsperado: null }));
    expect(response.status).toBe(409);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });
  it("crea una mesa nueva con estado libre y devuelve 201", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue(null);
    const tx = {
      mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      sectorMesa: { upsert: vi.fn().mockResolvedValue({ id: 4, nombre: "General" }) },
      mesa: { create: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, estado: mesaLibre, sector: { nombre: "General" } }) }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4 }));
    expect(response.status).toBe(201);
    expect(tx.mesa.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ numero: 1, capacidad: 4, estadoId: mesaLibre.id, sectorId: 4 })
    }));
    expect(tx.sectorMesa.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.create.mock.invocationCallOrder[0]);
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.mesa.create).not.toHaveBeenCalled();
  });

  it("reactiva una mesa dada de baja con el bloqueo antes de validar pedidos", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({ id: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: "Patio", estadoId: mesaCerrada.id, estado: mesaCerrada, sector: null, revision: 0, atencionToken: null }),
        update: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre, sector: { nombre: "Patio" } })
      },
      mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      sectorMesa: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
      pedido: { count: vi.fn().mockResolvedValue(0) }
    };
    useTransaction(tx);

    const response = await createMesa(mesaRequest({ numero: 1, capacidad: 4 }, false));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoId: mesaLibre.id }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(tx.mesa.findUniqueOrThrow.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
    expect(tx.pedido.count.mock.invocationCallOrder[0]).toBeLessThan(tx.sectorMesa.upsert.mock.invocationCallOrder[0]);
    expect(tx.sectorMesa.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
  });

  it("no reactiva una mesa dada de baja si conserva pedidos activos", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({ id: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: "Patio", estadoId: mesaCerrada.id, estado: mesaCerrada, sector: null, revision: 0, atencionToken: null }), update: vi.fn() },
      mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesa: { upsert: vi.fn() },
      pedido: { count: vi.fn().mockResolvedValue(1), findFirst: vi.fn().mockResolvedValue(null) }
    };
    useTransaction(tx);

    const response = await createMesa(mesaRequest({ numero: 1, capacidad: 4, descripcion: "Nuevo sector" }, false));
    expect(response.status).toBe(409);
    expect(tx.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("rechaza una mesa nueva si falla la creacion dentro de la transaccion", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue(null);
    const tx = {
      mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      sectorMesa: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
      mesa: { create: vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Número duplicado", {
        code: "P2002", clientVersion: "6.19.3", meta: { target: ["numero"] }
      })) }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4, descripcion: "Patio" }));
    expect(response.status).toBe(400);
    expect(tx.sectorMesa.upsert).toHaveBeenCalledOnce();
    expect(tx.mesa.create).toHaveBeenCalledOnce();
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.mesa.create).not.toHaveBeenCalled();
  });

  it("no convierte P2028 del alta de Mesa en un 400 de negocio", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Transaction API error", {
      code: "P2028", clientVersion: "6.19.3",
      meta: { error: "Unable to start a transaction in the given time." }
    }));
    const response = await createMesa(request({ numero: 999, capacidad: 4 }));
    expect(response.status).toBe(503);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it("no modifica otra mesa si el numero cambio antes de obtener el bloqueo", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({ id: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 2, capacidad: 4, descripcion: "Patio", estadoId: mesaCerrada.id, estado: mesaCerrada, sector: null, revision: 0, atencionToken: null }), update: vi.fn() },
      sectorMesa: { upsert: vi.fn() },
      pedido: { count: vi.fn() }
    };
    useTransaction(tx);

    const response = await createMesa(mesaRequest({ numero: 1, capacidad: 4 }, false));
    expect(response.status).toBe(400);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(tx.pedido.count).not.toHaveBeenCalled();
    expect(tx.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("libera una mesa sin pedidos activos", async () => {
    const tx = mesaTransaction(0);
    const response = await updateMesa(mesaRequest({ estado: "Libre" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoId: mesaLibre.id }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
    expect(tx.pedido.count.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
  });

  it("ocupa una mesa y registra quien la abrio", async () => {
    const tx = mesaTransaction(0, mesaOcupada);
    const response = await updateMesa(mesaRequest({ estado: "Ocupada" }, false), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoId: mesaOcupada.id, abiertaAt: expect.any(Date), abiertaPor: 7 })
    }));
  });

  it("no libera una mesa con pedidos activos", async () => {
    const tx = mesaTransaction(1);
    const response = await updateMesa(mesaRequest({ estado: "Libre" }), params(1));
    expect(response.status).toBe(400);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("rechaza liberar o dar de baja si hay un pedido activo de otra atención", async () => {
    const tx = mesaTransaction(1, mesaCerrada);
    tx.pedido.findFirst.mockResolvedValue({ id: 99 });
    const response = await closeMesa(mesaRequest({}), params(1));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("otra atención") });
    expect(tx.mesa.update).not.toHaveBeenCalled();
    expect(tx.pedido.findFirst).toHaveBeenCalledWith({
      where: { mesaId: 1, estado: { esActivo: true },
        OR: [{ atencionToken: null }, { atencionToken: { not: tableToken } }] },
      select: { id: true }
    });
  });

  it("libera una mesa cuando todos los items fueron anulados y conserva los pedidos como anulados", async () => {
    prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(mesaLibre);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      pedido: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      pedidoEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 3, codigo: CODES.pedido.anulado }) },
      mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      mesa: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null, estadoId: mesaOcupada.id, estado: mesaOcupada, sector: null, revision: 0, atencionToken: tableToken }),
        update: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre, sector: null })
      }
    };
    useTransaction(tx);

    const response = await updateMesa(mesaRequest({ estado: "Libre" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.pedido.count).toHaveBeenNthCalledWith(2, {
      where: { mesaId: 1, atencionToken: tableToken, estado: { esActivo: true }, items: { some: { estado: { esAnulado: false } } } }
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: { mesaId: 1, atencionToken: tableToken, estado: { esActivo: true } },
      data: { estadoId: 3 }
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.updateMany.mock.invocationCallOrder[0]);
    expect(tx.pedido.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
  });

  it("no actualiza el sector si liberar la mesa se rechaza", async () => {
    prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(mesaLibre);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      pedido: { count: vi.fn().mockResolvedValue(1), findFirst: vi.fn().mockResolvedValue(null) },
      sectorMesa: { upsert: vi.fn() },
      mesa: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null, estadoId: mesaOcupada.id, estado: mesaOcupada, sector: null, revision: 0, atencionToken: tableToken }), update: vi.fn() },
      mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(mesaLibre) }
    };
    useTransaction(tx);

    const response = await updateMesa(mesaRequest({ estado: "Libre", descripcion: "Nuevo sector" }), params(1));
    expect(response.status).toBe(400);
    expect(tx.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("actualiza sector y mesa en el mismo tx despues de validar pedidos", async () => {
    prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(mesaLibre);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      pedido: { count: vi.fn().mockResolvedValue(0) },
      sectorMesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      sectorMesa: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
      mesa: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, capacidad: 4, descripcion: null, estadoId: mesaOcupada.id, estado: mesaOcupada, sector: null, revision: 0, atencionToken: tableToken }),
        update: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre, sector: { nombre: "Patio" } })
      },
      mesaEstado: { findFirstOrThrow: vi.fn().mockResolvedValue(mesaLibre) }
    };
    useTransaction(tx);

    const response = await updateMesa(mesaRequest({ estado: "Libre", descripcion: "Patio" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sectorId: 4, estadoId: mesaLibre.id }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
    expect(tx.pedido.count.mock.invocationCallOrder[0]).toBeLessThan(tx.sectorMesa.upsert.mock.invocationCallOrder[0]);
    expect(tx.sectorMesa.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
  });

  it("no da de baja una mesa con pedidos activos", async () => {
    const tx = mesaTransaction(1, mesaCerrada);
    const response = await closeMesa(mesaRequest({}), params(1));
    expect(response.status).toBe(400);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("da de baja logicamente una mesa sin pedidos activos", async () => {
    const tx = mesaTransaction(0, mesaCerrada);
    const response = await closeMesa(mesaRequest({}), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoId: mesaCerrada.id, revision: { increment: 1 } }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
  });
});

describe("consumos de la atención vigente", () => {
  it("consulta solo pedidos activos de la atención y solo ítems no anulados", async () => {
    const tx = {
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, atencionToken: tableToken }) },
      pedido: { findMany: vi.fn().mockResolvedValue([
        { id: 10, items: [{ subtotal: 150 }] }, { id: 11, items: [{ subtotal: 200 }] }
      ]) }
    };
    useTransaction(tx);
    const response = await getConsumos({ nextUrl: new URL("http://localhost/api/consumos?mesaId=1") } as NextRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 350, mesa: { pedidos: [{ id: 10 }, { id: 11 }] } });
    expect(tx.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { mesaId: 1, atencionToken: tableToken, estado: { esActivo: true } },
      include: expect.objectContaining({ items: expect.objectContaining({ where: { estado: { esAnulado: false } } }) })
    }));
    expect(prismaMock.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });

  it("no incorpora pedidos históricos sin token a una mesa sin atención vigente", async () => {
    const tx = {
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, atencionToken: null }) },
      pedido: { findMany: vi.fn() }
    };
    useTransaction(tx);
    const response = await getConsumos({ nextUrl: new URL("http://localhost/api/consumos?mesaId=1") } as NextRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 0, mesa: { pedidos: [] } });
    expect(tx.pedido.findMany).not.toHaveBeenCalled();
  });
});

function accountTransaction(entregado = true) {
  let mesaEstado: typeof mesaOcupada | typeof mesaLibre = mesaOcupada;
  const metodoPago = { id: 1, codigo: CODES.pago.efectivo, nombre: "Efectivo", requiereMontoRecibido: true };
  const cuentaEstado = { id: 1, codigo: CODES.cuenta.cerrada, nombre: "Cerrada" };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    mesa: {
      findUnique: vi.fn().mockImplementation(async () => ({ id: 1, estado: mesaEstado, atencionToken: mesaEstado === mesaOcupada ? orderToken : null })),
      update: vi.fn().mockImplementation(async () => { mesaEstado = mesaLibre; })
    },
    pedido: {
      findMany: vi.fn().mockResolvedValue([{
        id: 10,
        atencionToken: orderToken,
        estadoCocina: entregado ? kitchen(CODES.cocina.entregado) : kitchen(CODES.cocina.listo),
        items: [{ productoId: 5, producto: { nombre: "Producto" }, cantidad: 1, precioUnitario: 100, subtotal: 100, observacion: null, estado: { esAnulado: false } }]
      }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    metodoPago: { findFirst: vi.fn().mockResolvedValue(metodoPago) },
    pedidoEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 2 }) },
    mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
    cuentaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(cuentaEstado) },
    cuenta: {
      create: vi.fn().mockImplementation(async ({ data }: { data: { total: number; detalles: { create: Array<Record<string, unknown>> } } }) => ({
        id: 99,
        total: data.total,
        detalles: data.detalles.create,
        metodoPago,
        estado: cuentaEstado,
        mesa: { id: 1, estado: mesaEstado }
      }))
    }
  };
  useTransaction(tx);
  return tx;
}

describe("cierre de cuenta", () => {
  it("no cierra si hay pedidos sin entregar", async () => {
    const tx = accountTransaction(false);
    const response = await closeAccount(request({ mesaId: 1, atencionToken: orderToken, montoRecibido: 100 }));
    expect(response.status).toBe(400);
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    expect(tx.cuenta.create).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("cierra la cuenta y libera la mesa cuando todos estan entregados", async () => {
    const tx = accountTransaction();
    const response = await closeAccount(request({ mesaId: 1, atencionToken: orderToken, montoRecibido: 100 }));
    expect(response.status).toBe(201);
    expect(tx.cuenta.create.mock.calls[0][0].data.total).toBe(100);
    expect(tx.cuenta.create.mock.calls[0][0].data.atencionToken).toBe(orderToken);
    expect(tx.cuenta.create.mock.calls[0][0].data.detalles.create).toHaveLength(1);
    expect(tx.pedido.updateMany).toHaveBeenCalledOnce();
    expect(tx.mesa.update).toHaveBeenCalledOnce();
  });

  it("no cierra dos veces una mesa ya liberada", async () => {
    const tx = accountTransaction();
    expect((await closeAccount(request({ mesaId: 1, atencionToken: orderToken, montoRecibido: 100 }))).status).toBe(201);
    expect((await closeAccount(request({ mesaId: 1, atencionToken: orderToken, montoRecibido: 100 }))).status).toBe(400);
    expect(tx.cuenta.create).toHaveBeenCalledOnce();
  });

  it("devuelve 400 sin token y 409 con token de otra atención", async () => {
    const tx = accountTransaction();
    expect((await closeAccount(request({ mesaId: 1, montoRecibido: 100 }))).status).toBe(400);
    expect((await closeAccount(request({ mesaId: 1, atencionToken: "11111111-1111-4111-8111-111111111111", montoRecibido: 100 }))).status).toBe(409);
    expect(tx.cuenta.create).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });
});

function addItemTransaction(options: { activo?: boolean; mesaOcupada?: boolean; kitchenCode?: string } = {}) {
  const state = options.mesaOcupada === false ? mesaLibre : mesaOcupada;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: { update: vi.fn().mockResolvedValue({ id: 10, revisionContenido: 1 }), findUnique: vi.fn().mockResolvedValue({
      id: 10,
      mesaId: 1,
      estado: { esActivo: options.activo !== false },
      atencionToken: orderToken,
      mesa: { id: 1, estado: state, atencionToken: orderToken },
      estadoCocina: kitchen(options.kitchenCode || CODES.cocina.pendiente)
    }) },
    producto: { findFirst: vi.fn().mockResolvedValue({ id: 5, precio: 100 }) },
    pedidoItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: 50, estado: { esAnulado: false }, motivoAnulacion: null, producto: { id: 5, nombre: "Producto" }
      }))
    }
  };
  useTransaction(tx);
  return tx;
}

function createOrderTransaction() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaOcupada, atencionToken: orderToken }) },
    producto: { findMany: vi.fn().mockResolvedValue([{ id: 5, precio: 100 }]) },
    pedidoEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(pedidoActivo) },
    pedidoEstadoCocina: { findUniqueOrThrow: vi.fn().mockResolvedValue(kitchen(CODES.cocina.pendiente)) },
    pedido: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: 10, revisionContenido: 0, fechaHora: new Date(), estado: pedidoActivo,
        estadoCocina: kitchen(CODES.cocina.pendiente),
        mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken },
        usuario: { id: 7, nombre: "Ana", apellido: "Perez", usuario: "ana" },
        items: [{ id: 50, estado: { esAnulado: false }, motivoAnulacion: null,
          producto: { id: 5, nombre: "Producto" } }]
      }))
    }
  };
  useTransaction(tx);
  return tx;
}

describe("idempotencia de creación de pedidos", () => {
  it("devuelve 201 al crear y 200 al recuperar el mismo pedido sin duplicar ítems", async () => {
    const tx = createOrderTransaction();
    const body = { mesaId: 1, items: [{ productoId: 5, cantidad: 2, observacion: "Sin hielo" }] };
    const first = await createPedido(request(body));
    expect(first.status).toBe(201);
    expect(await first.clone().json()).not.toHaveProperty("solicitudHash");
    expect((await first.clone().json()).revisionContenido).toBe(0);
    const stored = await tx.pedido.create.mock.results[0].value;
    tx.pedido.findUnique.mockResolvedValue(stored);
    tx.mesa.findUnique.mockResolvedValue({ id: 1, estado: mesaLibre, atencionToken: null });
    const retry = await createPedido(request(body));
    expect(retry.status).toBe(200);
    expect((await retry.json()).id).toBe((await first.json()).id);
    expect(tx.pedido.create).toHaveBeenCalledOnce();
    expect(tx.pedido.create.mock.calls[0][0].data).not.toHaveProperty("revisionContenido");
    expect(tx.pedido.create.mock.calls[0][0].data).toMatchObject({
      solicitudId: orderRequestId, items: { create: [expect.objectContaining({ cantidad: 2, subtotal: 200 })] }
    });
  });

  it("rechaza con 409 el mismo UUID para productos, cantidades u observaciones diferentes", async () => {
    const tx = createOrderTransaction();
    const original = { mesaId: 1, items: [{ productoId: 5, cantidad: 1 }] };
    await createPedido(request(original));
    tx.pedido.findUnique.mockResolvedValue(await tx.pedido.create.mock.results[0].value);
    for (const items of [[{ productoId: 5, cantidad: 2 }], [{ productoId: 6, cantidad: 1 }],
      [{ productoId: 5, cantidad: 1, observacion: "Otro" }]]) {
      expect((await createPedido(request({ mesaId: 1, items }))).status).toBe(409);
    }
    expect(tx.pedido.create).toHaveBeenCalledOnce();
  });

  it("rechaza UUID ausente o inválido antes de crear", async () => {
    const tx = createOrderTransaction();
    expect((await createPedido(request({ mesaId: 1, items: [{ productoId: 5 }], solicitudId: undefined }))).status).toBe(400);
    expect((await createPedido(request({ mesaId: 1, items: [{ productoId: 5 }], solicitudId: "bad" }))).status).toBe(400);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("crea operaciones distintas con UUID diferentes en la misma atención", async () => {
    const tx = createOrderTransaction();
    const body = { mesaId: 1, items: [{ productoId: 5 }] };
    expect((await createPedido(request(body))).status).toBe(201);
    expect((await createPedido(request({ ...body, solicitudId: "66666666-6666-4666-8666-666666666666" }))).status).toBe(201);
    expect(tx.pedido.create).toHaveBeenCalledTimes(2);
  });
});

describe("alta de consumos", () => {
  it("no crea pedidos en una mesa libre", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }
    };
    useTransaction(tx);
    const response = await createPedido(request({ mesaId: 1, items: [{ productoId: 5, cantidad: 1 }] }));
    expect(response.status).toBe(400);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("no agrega items a un pedido finalizado", async () => {
    const tx = addItemTransaction({ activo: false });
    const response = await addItem(request({ productoId: 5 }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("no agrega items si la mesa ya fue liberada", async () => {
    const tx = addItemTransaction({ mesaOcupada: false });
    const response = await addItem(request({ productoId: 5 }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("respeta el bloqueo de cocina para agregar items", async () => {
    const tx = addItemTransaction({ kitchenCode: CODES.cocina.listo });
    const response = await addItem(request({ productoId: 5 }), params(10));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("agrega un item a un pedido activo de una mesa ocupada", async () => {
    const tx = addItemTransaction();
    const response = await addItem(request({ productoId: 5 }), params(10));
    expect(response.status).toBe(201);
    expect(tx.pedidoItem.create).toHaveBeenCalledOnce();
    expect(tx.pedido.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { revisionContenido: { increment: 1 } } });
  });

  it("permite agregar durante En preparacion e incrementa la revisión una vez", async () => {
    const tx = addItemTransaction({ kitchenCode: CODES.cocina.enPreparacion });
    expect((await addItem(request({ productoId: 5 }), params(10))).status).toBe(201);
    expect(tx.pedido.update).toHaveBeenCalledOnce();
  });

  it("si falla el alta del ítem, no intenta incrementar la revisión", async () => {
    const tx = addItemTransaction();
    tx.pedidoItem.create.mockRejectedValueOnce(new Error("Fallo de prueba"));
    expect((await addItem(request({ productoId: 5 }), params(10))).status).toBe(500);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("recupera el mismo resultado si se pierde la respuesta y se reenvía el UUID", async () => {
    const tx = addItemTransaction();
    const first = await addItem(request({ productoId: 5, cantidad: 2 }), params(10));
    expect(first.status).toBe(201);
    const original = tx.pedidoItem.create.mock.results[0].value;
    tx.pedidoItem.findUnique.mockResolvedValue(await original);
    const second = await addItem(request({ productoId: 5, cantidad: 2 }), params(10));
    expect(second.status).toBe(200);
    expect((await second.json()).id).toBe((await first.json()).id);
    expect(tx.pedidoItem.create).toHaveBeenCalledOnce();
    expect(tx.pedido.update).toHaveBeenCalledOnce();
    expect(tx.pedidoItem.create.mock.calls[0][0].data).toMatchObject({
      solicitudId: itemRequestId, precioUnitario: 100, subtotal: 200
    });
  });

  it("no reusa el UUID con un contenido diferente", async () => {
    const tx = addItemTransaction();
    await addItem(request({ productoId: 5, cantidad: 1 }), params(10));
    tx.pedidoItem.findUnique.mockResolvedValue(await tx.pedidoItem.create.mock.results[0].value);
    const conflict = await addItem(request({ productoId: 5, cantidad: 2 }), params(10));
    expect(conflict.status).toBe(409);
    expect(tx.pedidoItem.create).toHaveBeenCalledOnce();
  });

  it("reconoce el reenvío incluso si el pedido luego quedó finalizado", async () => {
    const tx = addItemTransaction();
    await addItem(request({ productoId: 5 }), params(10));
    tx.pedidoItem.findUnique.mockResolvedValue(await tx.pedidoItem.create.mock.results[0].value);
    tx.pedido.findUnique.mockResolvedValue({ id: 10, mesaId: 1, estado: { esActivo: false } });
    expect((await addItem(request({ productoId: 5 }), params(10))).status).toBe(200);
    expect(tx.pedidoItem.create).toHaveBeenCalledOnce();
  });

  it("rechaza un UUID ausente o inválido", async () => {
    const tx = addItemTransaction();
    expect((await addItem(request({ productoId: 5, solicitudId: undefined }), params(10))).status).toBe(400);
    expect((await addItem(request({ productoId: 5, solicitudId: "no-uuid" }), params(10))).status).toBe(400);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("admite dos UUID distintos como dos operaciones distintas", async () => {
    const tx = addItemTransaction();
    expect((await addItem(request({ productoId: 5 }), params(10))).status).toBe(201);
    expect((await addItem(request({ productoId: 5, solicitudId: "44444444-4444-4444-8444-444444444444" }), params(10))).status).toBe(201);
    expect(tx.pedidoItem.create).toHaveBeenCalledTimes(2);
  });
});

describe("OrderService", () => {
  it("lista pedidos de una mesa con el formato HTTP existente", async () => {
    prismaMock.pedido.findMany.mockResolvedValue([{
      id: 10,
      mesaId: 1,
      estado: pedidoActivo,
      estadoCocina: kitchen(CODES.cocina.pendiente),
      mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken },
      atencionToken: orderToken,
      usuario: { id: 7, nombre: "Ana", apellido: "Perez", usuario: "ana" },
      items: [{ id: 50, estado: { esAnulado: false }, motivoAnulacion: null, motivoAnulacionDetalle: null, producto: { id: 5, nombre: "Producto" } }]
    }]);
    const requestWithQuery = { nextUrl: new URL("http://localhost/api/pedidos?mesaId=1") } as NextRequest;

    const response = await listPedidos(requestWithQuery);
    expect(response.status).toBe(200);
    expect(prismaMock.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { mesaId: 1, estado: { esActivo: true }, atencionToken: { not: null } }
    }));
    expect(await response.json()).toMatchObject([{
      atencionToken: orderToken,
      estado: "Activo",
      estadoCocina: "Pendiente",
      mesa: { estado: "Ocupada" },
      items: [{ anulado: false, motivoAnulacion: null }]
    }]);
  });

  it("no devuelve pedidos activos de otra atención en la consulta por mesa ni en la global", async () => {
    const current = { id: 10, mesaId: 1, atencionToken: orderToken, estado: pedidoActivo,
      estadoCocina: kitchen(CODES.cocina.pendiente),
      mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken },
      usuario: { id: 7, nombre: "Ana", apellido: "Perez", usuario: "ana" }, items: [] };
    prismaMock.pedido.findMany.mockResolvedValue([
      current,
      { ...current, id: 11, atencionToken: tableToken },
      { ...current, id: 12, atencionToken: null }
    ]);
    const forTable = await listPedidos({ nextUrl: new URL("http://localhost/api/pedidos?mesaId=1") } as NextRequest);
    const global = await listPedidos({ nextUrl: new URL("http://localhost/api/pedidos") } as NextRequest);
    expect((await forTable.json()).map((pedido: { id: number }) => pedido.id)).toEqual([10]);
    expect((await global.json()).map((pedido: { id: number }) => pedido.id)).toEqual([10]);
  });

  it("crea un pedido con precios de los productos dentro del bloqueo de mesa", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaOcupada, atencionToken: orderToken }) },
      producto: { findMany: vi.fn().mockResolvedValue([{ id: 5, precio: 100 }]) },
      pedidoEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      pedidoEstadoCocina: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 10 }) }
    };
    useTransaction(tx);

    const result = await orderService.create({ mesaId: 1, usuarioId: 7, atencionToken: orderToken,
      solicitudId: orderRequestId, items: [{ productoId: 5, cantidad: 2 }] });
    expect(result).toHaveProperty("pedido", { id: 10 });
    expect(tx.pedido.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ atencionToken: orderToken, items: { create: [expect.objectContaining({ precioUnitario: 100, subtotal: 200 })] } })
    }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.findUnique.mock.invocationCallOrder[0]);
    expect(tx.mesa.findUnique.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.create.mock.invocationCallOrder[0]);
  });

  it.each([
    [CODES.cocina.pendiente, CODES.cocina.enPreparacion],
    [CODES.cocina.enPreparacion, CODES.cocina.listo],
    [CODES.cocina.listo, CODES.cocina.entregado]
  ])("permite la transicion %s -> %s", async (from, to) => {
    const tx = kitchenTransaction(from);
    const result = await orderService.update(10, { estadoCocina: to, estadoCocinaEsperado: from,
      atencionToken: orderToken, ...(to === CODES.cocina.listo ? { revisionContenidoEsperada: 0 } : {}) });
    expect(result).toHaveProperty("updated");
    expect(tx.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoCocinaId: kitchen(to).id })
    }));
  });

  it("rechaza una transicion de cocina invalida", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    const result = await orderService.update(10, {
      atencionToken: orderToken,
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.pendiente
    });
    expect(result).toMatchObject({ status: 400 });
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("rechaza con 409 una vista de cocina desactualizada", async () => {
    const tx = kitchenTransaction(CODES.cocina.enPreparacion);
    const result = await orderService.update(10, {
      atencionToken: orderToken,
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.pendiente
    });
    expect(result).toMatchObject({ status: 409 });
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("edita solo observaciones sin exigir estado de cocina esperado", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    const result = await orderService.update(10, { observacion: "Sin sal", atencionToken: orderToken });
    expect(result).toHaveProperty("updated");
    expect(tx.pedido.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ observacion: "Sin sal", revisionContenido: { increment: 1 } })
    }));
    await orderService.update(10, { observacion: "Sin sal", atencionToken: orderToken });
    expect(tx.pedido.update.mock.calls[1][0].data).not.toHaveProperty("revisionContenido");
  });

  it("no cambia cocina cuando el pedido ya pertenece a una cuenta cerrada", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    tx.cuentaDetalle.findFirst.mockResolvedValue({ id: 99 });
    const result = await orderService.update(10, {
      atencionToken: orderToken,
      estadoCocina: CODES.cocina.enPreparacion,
      estadoCocinaEsperado: CODES.cocina.pendiente
    });
    expect(result).toMatchObject({ status: 400 });
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("no crea un pedido en mesa libre", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }
    };
    useTransaction(tx);
    const result = await orderService.create({ mesaId: 1, usuarioId: 7, atencionToken: orderToken,
      solicitudId: orderRequestId, items: [{ productoId: 5 }] });
    expect(result).toHaveProperty("error", "La mesa debe estar ocupada para registrar pedidos");
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza crear un pedido con un token anterior sin insertar datos", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaOcupada, atencionToken: orderToken }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }
    };
    useTransaction(tx);
    const response = await createPedido(request({ mesaId: 1, items: [{ productoId: 5 }], atencionToken: tableToken }));
    expect(response.status).toBe(409);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza crear un pedido sin token", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaOcupada, atencionToken: orderToken }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }
    };
    useTransaction(tx);
    const response = await createPedido(request({ mesaId: 1, items: [{ productoId: 5 }], atencionToken: null }));
    expect(response.status).toBe(400);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza crear un pedido si la mesa histórica aún no tiene token", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaOcupada, atencionToken: null }) },
      pedido: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }
    };
    useTransaction(tx);
    const response = await createPedido(request({ mesaId: 1, items: [{ productoId: 5 }] }));
    expect(response.status).toBe(409);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza un ítem de una atención anterior sin tocar PedidoItem", async () => {
    const tx = addItemTransaction();
    const response = await addItem(request({ productoId: 5, atencionToken: tableToken }), params(10));
    expect(response.status).toBe(409);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("rechaza un pedido histórico sin token al intentar agregar ítems", async () => {
    const tx = addItemTransaction();
    tx.pedido.findUnique.mockResolvedValue({ id: 10, mesaId: 1, atencionToken: null,
      estado: pedidoActivo, estadoCocina: kitchen(CODES.cocina.pendiente),
      mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken } });
    const response = await addItem(request({ productoId: 5 }), params(10));
    expect(response.status).toBe(409);
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("rechaza cocina de una atención anterior antes de validar la transición", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    const response = await changeKitchenStatus(request({
      estadoCocina: CODES.cocina.enPreparacion,
      estadoCocinaEsperado: CODES.cocina.pendiente,
      atencionToken: tableToken
    }), params(10));
    expect(response.status).toBe(409);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("rechaza editar observaciones de un pedido histórico sin token", async () => {
    const tx = kitchenTransaction(CODES.cocina.pendiente);
    tx.pedido.findUnique.mockResolvedValue({ id: 10, mesaId: 1, atencionToken: null,
      estado: pedidoActivo, estadoCocina: kitchen(CODES.cocina.pendiente), observacion: null,
      mesa: { id: 1, estado: mesaOcupada, atencionToken: orderToken } });
    const response = await changeKitchenStatus(request({ observacion: "Sin sal", atencionToken: orderToken }), params(10));
    expect(response.status).toBe(409);
    expect(tx.pedido.update).not.toHaveBeenCalled();
  });

  it("rechaza anular un ítem de otra atención sin modificar su motivo", async () => {
    const { tx, getItem } = annulTransaction();
    const response = await annulItem(request({ motivo: "Sin stock", atencionToken: tableToken }), params(50));
    expect(response.status).toBe(409);
    expect(tx.pedidoItem.update).not.toHaveBeenCalled();
    expect(getItem().motivoAnulacionDetalle).toBeNull();
  });

  it("no agrega un item a un pedido finalizado", async () => {
    const tx = addItemTransaction({ activo: false });
    const result = await orderService.addItem(10, { productoId: 5, atencionToken: orderToken, solicitudId: itemRequestId });
    expect(result).toHaveProperty("error", "El pedido no puede modificarse");
    expect(tx.pedidoItem.create).not.toHaveBeenCalled();
  });

  it("impide una segunda anulacion sin reemplazar el motivo original", async () => {
    const { tx, getItem } = annulTransaction();
    expect(await orderService.cancelItem(50, { motivo: "Motivo original", atencionToken: orderToken })).toHaveProperty("updated");
    expect(await orderService.cancelItem(50, { motivo: "Motivo nuevo", atencionToken: orderToken })).toHaveProperty("error", "El item ya fue anulado");
    expect(getItem().motivoAnulacionDetalle).toBe("Motivo original");
    expect(tx.pedidoItem.update).toHaveBeenCalledOnce();
  });

  it("no anula un item de una cuenta cerrada", async () => {
    const { tx } = annulTransaction({ cuentaCerrada: true });
    const result = await orderService.cancelItem(50, { motivo: "Sin stock", atencionToken: orderToken });
    expect(result).toHaveProperty("error", "El item no puede anularse");
    expect(tx.pedidoItem.update).not.toHaveBeenCalled();
  });
});
