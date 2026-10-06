import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { CODES, motivoAnulacionBy, pedidoItemEstadoByCodigo } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  const itemId = Number(id);
  const motivo = data.motivo || "Anulado por usuario";
  const estadoAnulado = await pedidoItemEstadoByCodigo(CODES.item.anulado);
  const motivoCatalogo = await motivoAnulacionBy(motivo);

  const result = await prisma.$transaction(async (tx) => {
    const lockedMesa = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT m."id" FROM "Mesa" m
      JOIN "Pedido" p ON p."mesaId" = m."id"
      JOIN "PedidoItem" i ON i."pedidoId" = p."id"
      WHERE i."id" = ${itemId}
      FOR UPDATE OF m
    `;
    const lockedPedido = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT p."id" FROM "Pedido" p
      JOIN "PedidoItem" i ON i."pedidoId" = p."id"
      WHERE i."id" = ${itemId}
      FOR UPDATE OF p
    `;
    await tx.$queryRaw`SELECT "id" FROM "PedidoItem" WHERE "id" = ${itemId} FOR UPDATE`;

    const item = await tx.pedidoItem.findUnique({
      where: { id: itemId },
      include: { estado: true, pedido: { include: { mesa: { include: { estado: true } }, estado: true } } }
    });
    if (!item || item.pedidoId !== lockedPedido[0]?.id || item.pedido.mesaId !== lockedMesa[0]?.id ||
        !item.pedido.estado.esActivo || item.pedido.mesa.estado.codigo !== CODES.mesa.ocupada ||
        !item.pedido.mesa.estado.permitePedido) {
      return { error: "El item no puede anularse" };
    }
    if (item.estado.esAnulado) return { error: "El item ya fue anulado" };

    const cuentaCerrada = await tx.cuentaDetalle.findFirst({
      where: { pedidoId: item.pedidoId, cuenta: { estado: { esCerrada: true } } },
      select: { id: true }
    });
    if (cuentaCerrada) return { error: "El item no puede anularse" };

    const updated = await tx.pedidoItem.update({
      where: { id: itemId },
      data: {
        estadoId: estadoAnulado.id,
        motivoAnulacionId: motivoCatalogo.id,
        motivoAnulacionDetalle: motivo
      },
      include: { producto: true, estado: true, motivoAnulacion: true }
    });
    return { updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, 400);
  const updated = result.updated;
  return json({
    ...updated,
    anulado: updated.estado.esAnulado,
    motivoAnulacion: updated.motivoAnulacion?.nombre || updated.motivoAnulacionDetalle || null
  });
}
