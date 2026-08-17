import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { nombre: "Administrador" },
    update: {},
    create: { nombre: "Administrador", descripcion: "Acceso total al sistema" }
  });

  const empleadoRole = await prisma.role.upsert({
    where: { nombre: "Empleado" },
    update: {},
    create: { nombre: "Empleado", descripcion: "Gestiona mesas, pedidos y cuentas" }
  });

  await prisma.user.upsert({
    where: { usuario: "admin" },
    update: {},
    create: {
      nombre: "Admin",
      apellido: "Villa Maria",
      usuario: "admin",
      passwordHash: hashPassword("admin123"),
      email: "admin@villamaria.local",
      estado: true,
      roleId: adminRole.id
    }
  });

  await prisma.user.upsert({
    where: { usuario: "empleado" },
    update: {},
    create: {
      nombre: "Empleado",
      apellido: "Demo",
      usuario: "empleado",
      passwordHash: hashPassword("empleado123"),
      estado: true,
      roleId: empleadoRole.id
    }
  });

  for (const mesa of [
    { numero: 1, capacidad: 4, descripcion: "Salon principal" },
    { numero: 2, capacidad: 2, descripcion: "Ventana" },
    { numero: 3, capacidad: 6, descripcion: "Familiar" },
    { numero: 4, capacidad: 4, descripcion: "Patio" },
    { numero: 5, capacidad: 8, descripcion: "Mesa grande" }
  ]) {
    await prisma.mesa.upsert({
      where: { numero: mesa.numero },
      update: {},
      create: mesa
    });
  }

  const categorias = [
    { nombre: "Entradas", orden: 1 },
    { nombre: "Principales", orden: 2 },
    { nombre: "Bebidas", orden: 3 },
    { nombre: "Postres", orden: 4 }
  ];

  for (const categoria of categorias) {
    await prisma.categoriaProducto.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria
    });
  }

  const cats = await prisma.categoriaProducto.findMany();
  const catId = (nombre: string) => cats.find((cat) => cat.nombre === nombre)!.id;

  const productos = [
    ["Empanadas caseras", "Docena de empanadas criollas", 7200, "Entradas"],
    ["Tabla bodegon", "Fiambres, quesos y berenjenas al escabeche", 9800, "Entradas"],
    ["Milanesa napolitana", "Con papas fritas para compartir", 12500, "Principales"],
    ["Ravioles con salsa mixta", "Pasta casera de la casa", 8900, "Principales"],
    ["Agua sin gas", "Botella 500ml", 1200, "Bebidas"],
    ["Gaseosa linea cola", "Botella 1.5L", 2500, "Bebidas"],
    ["Flan casero", "Con crema o dulce de leche", 3200, "Postres"]
  ] as const;

  for (const [nombre, descripcion, precio, categoria] of productos) {
    const existing = await prisma.producto.findFirst({ where: { nombre } });
    if (!existing) {
      await prisma.producto.create({
        data: {
          nombre,
          descripcion,
          precio,
          categoriaId: catId(categoria),
          activo: true,
          visibleMenu: true
        }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
