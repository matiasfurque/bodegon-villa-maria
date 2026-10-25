import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    mesa: { findUnique: vi.fn(), create: vi.fn() },
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
import { POST as createPedido } from "@/app/api/pedidos/route";
import { POST as addItem } from "@/app/api/pedidos/[id]/items/route";

const mesaOcupada = { id: 2, codigo: CODES.mesa.ocupada, nombre: "Ocupada", permitePedido: true, liberaMesa: false };
const mesaLibre = { id: 1, codigo: CODES.mesa.libre, nombre: "Libre", permitePedido: false, liberaMesa: true };
const mesaCerrada = { id: 3, codigo: CODES.mesa.cerrada, nombre: "Cerrada", permitePedido: false, liberaMesa: false };
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

function request(body: object): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
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
    mesa: { id: 1, estado: mesaOcupada },
    usuario: { id: 7, nombre: "Ana", apellido: "Perez", usuario: "ana" },
    items: []
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: {
      findUnique: vi.fn().mockImplementation(async () => pedido),
      update: vi.fn().mockImplementation(async ({ data }: { data: { estadoCocinaId?: number; observacion?: string | null } }) => {
        const next = kitchenStates.find((state) => state.id === data.estadoCocinaId);
        pedido = { ...pedido, estadoCocina: next || pedido.estadoCocina, observacion: data.observacion ?? pedido.observacion };
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
    const response = await changeKitchenStatus(request({ estadoCocina: to, estadoCocinaEsperado: from }), params(10));
    expect(response.status).toBe(200);
    expect(tx.pedido.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoCocinaId: kitchen(to).id }) }));
    expect(tx.$queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE OF m");
    expect(tx.$queryRaw.mock.calls[1][0].join("")).toContain('FROM "Pedido"');
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
      estadoCocinaEsperado: CODES.cocina.enPreparacion
    }), params(10));
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
    pedido: { id: 10, mesaId: 1, estado: pedidoActivo, mesa: { id: 1, estado: mesaOcupada } },
    motivoAnulacionDetalle: options.anulado ? "Motivo original" : null as string | null,
    motivoAnulacion: { nombre: "Otro" },
    producto: { id: 5, nombre: "Producto" }
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 10 }]).mockResolvedValue([{ id: 50 }]),
    pedidoItem: {
      findUnique: vi.fn().mockImplementation(async () => item),
      update: vi.fn().mockImplementation(async ({ data }: { data: { motivoAnulacionDetalle: string } }) => {
        item = { ...item, estado: { esAnulado: true }, motivoAnulacionDetalle: data.motivoAnulacionDetalle };
        return item;
      })
    },
    cuentaDetalle: { findFirst: vi.fn().mockResolvedValue(options.cuentaCerrada ? { id: 99 } : null) }
  };
  prismaMock.pedidoItemEstado.findUniqueOrThrow.mockResolvedValue({ id: 2 });
  prismaMock.motivoAnulacion.findUniqueOrThrow.mockResolvedValue({ id: 3 });
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
    expect(tx.$queryRaw.mock.calls.map((call) => call[0].join(""))).toEqual([
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
  });

  it("rechaza la anulacion si el pedido ya esta en una cuenta cerrada", async () => {
    const { tx } = annulTransaction({ cuentaCerrada: true });
    const response = await annulItem(request({ motivo: "Sin stock" }), params(50));
    expect(response.status).toBe(400);
    expect(tx.pedidoItem.update).not.toHaveBeenCalled();
  });
});

function mesaTransaction(activePedidos: number, estado: typeof mesaLibre | typeof mesaCerrada | typeof mesaOcupada = mesaLibre) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: { count: vi.fn().mockResolvedValue(activePedidos) },
    mesa: { update: vi.fn().mockResolvedValue({ id: 1, estado, sector: null }) }
  };
  prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(estado);
  useTransaction(tx);
  return tx;
}

describe("liberacion y baja de mesa", () => {
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
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, descripcion: "Patio", estado: mesaCerrada }),
        update: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre, sector: { nombre: "Patio" } })
      },
      mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
      sectorMesa: { upsert: vi.fn().mockResolvedValue({ id: 4 }) },
      pedido: { count: vi.fn().mockResolvedValue(0) }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4 }));
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
      mesa: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 1, descripcion: "Patio", estado: mesaCerrada }), update: vi.fn() },
      mesaEstado: { findUniqueOrThrow: vi.fn().mockResolvedValue(mesaLibre) },
      sectorMesa: { upsert: vi.fn() },
      pedido: { count: vi.fn().mockResolvedValue(1) }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4, descripcion: "Nuevo sector" }));
    expect(response.status).toBe(400);
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
      mesa: { create: vi.fn().mockRejectedValue(new Error("Numero duplicado")) }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4, descripcion: "Patio" }));
    expect(response.status).toBe(400);
    expect(tx.sectorMesa.upsert).toHaveBeenCalledOnce();
    expect(tx.mesa.create).toHaveBeenCalledOnce();
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.mesa.create).not.toHaveBeenCalled();
  });

  it("no modifica otra mesa si el numero cambio antes de obtener el bloqueo", async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({ id: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, numero: 2, descripcion: "Patio", estado: mesaCerrada }), update: vi.fn() },
      sectorMesa: { upsert: vi.fn() },
      pedido: { count: vi.fn() }
    };
    useTransaction(tx);

    const response = await createMesa(request({ numero: 1, capacidad: 4 }));
    expect(response.status).toBe(400);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(tx.pedido.count).not.toHaveBeenCalled();
    expect(tx.sectorMesa.upsert).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("libera una mesa sin pedidos activos", async () => {
    const tx = mesaTransaction(0);
    const response = await updateMesa(request({ estado: "Libre" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoId: mesaLibre.id }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
    expect(tx.pedido.count.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
  });

  it("ocupa una mesa y registra quien la abrio", async () => {
    const tx = mesaTransaction(0, mesaOcupada);
    const response = await updateMesa(request({ estado: "Ocupada" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoId: mesaOcupada.id, abiertaAt: expect.any(Date), abiertaPor: 7 })
    }));
  });

  it("no libera una mesa con pedidos activos", async () => {
    const tx = mesaTransaction(1);
    const response = await updateMesa(request({ estado: "Libre" }), params(1));
    expect(response.status).toBe(400);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("no actualiza el sector si liberar la mesa se rechaza", async () => {
    prismaMock.mesaEstado.findFirstOrThrow.mockResolvedValue(mesaLibre);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      pedido: { count: vi.fn().mockResolvedValue(1) },
      sectorMesa: { upsert: vi.fn() },
      mesa: { update: vi.fn() }
    };
    useTransaction(tx);

    const response = await updateMesa(request({ estado: "Libre", descripcion: "Nuevo sector" }), params(1));
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
      mesa: { update: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre, sector: { nombre: "Patio" } }) }
    };
    useTransaction(tx);

    const response = await updateMesa(request({ estado: "Libre", descripcion: "Patio" }), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sectorId: 4, estadoId: mesaLibre.id }) }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
    expect(tx.pedido.count.mock.invocationCallOrder[0]).toBeLessThan(tx.sectorMesa.upsert.mock.invocationCallOrder[0]);
    expect(tx.sectorMesa.upsert.mock.invocationCallOrder[0]).toBeLessThan(tx.mesa.update.mock.invocationCallOrder[0]);
    expect(prismaMock.sectorMesa.upsert).not.toHaveBeenCalled();
  });

  it("no da de baja una mesa con pedidos activos", async () => {
    const tx = mesaTransaction(1, mesaCerrada);
    const response = await closeMesa(request({}), params(1));
    expect(response.status).toBe(400);
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("da de baja logicamente una mesa sin pedidos activos", async () => {
    const tx = mesaTransaction(0, mesaCerrada);
    const response = await closeMesa(request({}), params(1));
    expect(response.status).toBe(200);
    expect(tx.mesa.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estadoId: mesaCerrada.id } }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.pedido.count.mock.invocationCallOrder[0]);
  });
});

function accountTransaction(entregado = true) {
  let mesaEstado: typeof mesaOcupada | typeof mesaLibre = mesaOcupada;
  const metodoPago = { id: 1, codigo: CODES.pago.efectivo, nombre: "Efectivo", requiereMontoRecibido: true };
  const cuentaEstado = { id: 1, codigo: CODES.cuenta.cerrada, nombre: "Cerrada" };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    mesa: {
      findUnique: vi.fn().mockImplementation(async () => ({ id: 1, estado: mesaEstado })),
      update: vi.fn().mockImplementation(async () => { mesaEstado = mesaLibre; })
    },
    pedido: {
      findMany: vi.fn().mockResolvedValue([{
        id: 10,
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
    const response = await closeAccount(request({ mesaId: 1, montoRecibido: 100 }));
    expect(response.status).toBe(400);
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    expect(tx.cuenta.create).not.toHaveBeenCalled();
    expect(tx.mesa.update).not.toHaveBeenCalled();
  });

  it("cierra la cuenta y libera la mesa cuando todos estan entregados", async () => {
    const tx = accountTransaction();
    const response = await closeAccount(request({ mesaId: 1, montoRecibido: 100 }));
    expect(response.status).toBe(201);
    expect(tx.cuenta.create.mock.calls[0][0].data.total).toBe(100);
    expect(tx.cuenta.create.mock.calls[0][0].data.detalles.create).toHaveLength(1);
    expect(tx.pedido.updateMany).toHaveBeenCalledOnce();
    expect(tx.mesa.update).toHaveBeenCalledOnce();
  });

  it("no cierra dos veces una mesa ya liberada", async () => {
    const tx = accountTransaction();
    expect((await closeAccount(request({ mesaId: 1, montoRecibido: 100 }))).status).toBe(201);
    expect((await closeAccount(request({ mesaId: 1, montoRecibido: 100 }))).status).toBe(400);
    expect(tx.cuenta.create).toHaveBeenCalledOnce();
  });
});

function addItemTransaction(options: { activo?: boolean; mesaOcupada?: boolean; kitchenCode?: string } = {}) {
  const state = options.mesaOcupada === false ? mesaLibre : mesaOcupada;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    pedido: { findUnique: vi.fn().mockResolvedValue({
      id: 10,
      mesaId: 1,
      estado: { esActivo: options.activo !== false },
      mesa: { id: 1, estado: state },
      estadoCocina: kitchen(options.kitchenCode || CODES.cocina.pendiente)
    }) },
    producto: { findFirst: vi.fn().mockResolvedValue({ id: 5, precio: 100 }) },
    pedidoItem: { create: vi.fn().mockResolvedValue({ id: 50, estado: { esAnulado: false }, motivoAnulacion: null, producto: { id: 5, nombre: "Producto" } }) }
  };
  useTransaction(tx);
  return tx;
}

describe("alta de consumos", () => {
  it("no crea pedidos en una mesa libre", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      mesa: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: mesaLibre }) },
      pedido: { create: vi.fn() }
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
  });
});
