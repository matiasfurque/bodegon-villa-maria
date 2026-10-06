import { json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categorias = await prisma.categoriaProducto.findMany({
    where: { estado: { visibleEnMenu: true, habilitado: true } },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    include: {
      productos: {
        where: {
          estado: { permiteVenta: true },
          visibilidad: { visibleEnMenu: true }
        },
        orderBy: { nombre: "asc" }
      }
    }
  });
  return json(categorias);
}
