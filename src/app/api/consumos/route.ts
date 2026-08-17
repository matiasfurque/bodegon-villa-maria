import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  if (!mesaId) return json({ error: "mesaId es obligatorio" }, 400);

  const mesa = await prisma.mesa.findUnique({
    where: { id: Number(mesaId) },
    include: {
      pedidos: {
        orderBy: { fechaHora: "desc" },
        include: {
          usuario: { select: { nombre: true, apellido: true } },
          items: { include: { producto: true } }
        }
      }
    }
  });

  if (!mesa) return json({ error: "Mesa inexistente" }, 404);
  const validItems = mesa.pedidos.flatMap((pedido) =>
    pedido.items.filter((item) => !item.anulado && pedido.estado !== "Anulado")
  );
  const total = validItems.reduce((sum, item) => sum + Number(item.subtotal), 0);
  return json({ mesa, total });
}
