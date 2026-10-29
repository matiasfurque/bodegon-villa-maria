import type { Prisma } from "@prisma/client";

export const orderInclude = {
  mesa: { include: { estado: true } },
  usuario: { select: { id: true, nombre: true, apellido: true, usuario: true } },
  estado: true,
  estadoCocina: true,
  items: { include: { producto: true, estado: true, motivoAnulacion: true } }
} as const;

export const orderMutationInclude = {
  mesa: { include: { estado: true } },
  estado: true,
  estadoCocina: true
} as const;

export const orderItemInclude = { producto: true, estado: true, motivoAnulacion: true } as const;

export const cancellationItemInclude = {
  estado: true,
  pedido: { include: { mesa: { include: { estado: true } }, estado: true } }
} as const;

export type OrderWithRelations = Prisma.PedidoGetPayload<{ include: typeof orderInclude }>;
export type OrderItemWithRelations = Prisma.PedidoItemGetPayload<{ include: typeof orderItemInclude }>;

export type OrderInputItem = {
  productoId: number | string;
  cantidad?: number | string;
  observacion?: string;
};

export type CreateOrderInput = {
  mesaId: number;
  usuarioId: number;
  atencionToken: unknown;
  solicitudId?: unknown;
  items: OrderInputItem[];
  observacion?: string | null;
};

export type UpdateOrderInput = {
  atencionToken?: unknown;
  estadoCocina?: string | null;
  estadoCocinaEsperado?: string | null;
  revisionContenidoEsperada?: unknown;
  observacion?: string | null;
};

export type AddOrderItemInput = {
  atencionToken?: unknown;
  solicitudId?: unknown;
  productoId?: number | string;
  cantidad?: number | string;
  observacion?: string | null;
};

export type CancelOrderItemInput = { motivo?: string | null; atencionToken?: unknown };
