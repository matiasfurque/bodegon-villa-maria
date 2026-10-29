import type { Prisma } from "@prisma/client";

export type TableWithRelations = Prisma.MesaGetPayload<{
  include: { estado: true; sector: true };
}>;

export type TableCreateInput = {
  numero: number;
  capacidad: number;
  descripcion?: string | null;
  estado?: unknown;
  revisionEsperada?: unknown;
  atencionTokenEsperado?: unknown;
};

export type TableUpdateInput = {
  numero?: number | string | null;
  capacidad?: number | string | null;
  descripcion?: string | null;
  estado?: unknown;
  revisionEsperada?: unknown;
  atencionTokenEsperado?: unknown;
};

export type TableExpectedIdentity = Pick<TableUpdateInput, "revisionEsperada" | "atencionTokenEsperado">;
