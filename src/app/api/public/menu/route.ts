import { json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categorias = await prisma.categoriaProducto.findMany({
    where: { visible: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    include: {
      productos: {
        where: { activo: true, visibleMenu: true },
        orderBy: { nombre: "asc" }
      }
    }
  });
  return json(categorias);
}
