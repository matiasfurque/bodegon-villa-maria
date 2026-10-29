import type { Prisma } from "@prisma/client";

export const accountInclude = {
  mesa: { include: { estado: true } },
  usuarioCierre: { select: { nombre: true, apellido: true, usuario: true } },
  metodoPago: true,
  estado: true,
  detalles: true
} as const;

export type AccountWithRelations = Prisma.CuentaGetPayload<{ include: typeof accountInclude }>;

export type AccountListFilter = {
  mesaId?: number;
  fromDate?: Date;
  toDate?: Date;
  hasDateFilter: boolean;
};

export type CloseAccountInput = {
  mesaId: number;
  atencionToken: unknown;
  usuarioCierreId: number;
  metodoPago?: unknown;
  montoRecibido?: unknown;
};
