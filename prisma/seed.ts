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

  const cocineroRole = await prisma.role.upsert({
    where: { nombre: "Cocinero" },
    update: {},
    create: { nombre: "Cocinero", descripcion: "Gestiona pedidos de cocina" }
  });

  const permisos = [
    { codigo: "inicio.ver", nombre: "Ver inicio", descripcion: "Acceso al resumen operativo inicial" },
    { codigo: "operaciones.gestionar", nombre: "Gestionar operaciones", descripcion: "Gestiona mesas, pedidos y cuentas abiertas" },
    { codigo: "cocina.gestionar", nombre: "Gestionar cocina", descripcion: "Visualiza y actualiza pedidos de cocina" },
    { codigo: "productos.gestionar", nombre: "Gestionar productos", descripcion: "Administra productos, precios y categorias" },
    { codigo: "usuarios.gestionar", nombre: "Gestionar usuarios", descripcion: "Administra usuarios, roles y accesos" },
    { codigo: "reportes.ver", nombre: "Ver reportes", descripcion: "Consulta ventas y metricas del negocio" },
    { codigo: "historial.ver", nombre: "Ver historial", descripcion: "Consulta cuentas cerradas e historial de consumos" }
  ];

  for (const permiso of permisos) {
    await prisma.permiso.upsert({
      where: { codigo: permiso.codigo },
      update: { nombre: permiso.nombre, descripcion: permiso.descripcion },
      create: permiso
    });
  }

  async function asignarPermisos(roleId: number, codigos: string[]) {
    const permisosAsignados = await prisma.permiso.findMany({
      where: { codigo: { in: codigos } }
    });

    await prisma.rolePermiso.deleteMany({ where: { roleId } });
    await prisma.rolePermiso.createMany({
      data: permisosAsignados.map((permiso) => ({ roleId, permisoId: permiso.id })),
      skipDuplicates: true
    });
  }

  await asignarPermisos(adminRole.id, permisos.map((permiso) => permiso.codigo));
  await asignarPermisos(empleadoRole.id, ["operaciones.gestionar"]);
  await asignarPermisos(cocineroRole.id, ["cocina.gestionar"]);

  const mesaEstados = [
    { codigo: "MESA_LIBRE", nombre: "Libre", descripcion: "Mesa disponible", orden: 1, permitePedido: false, liberaMesa: true },
    { codigo: "MESA_OCUPADA", nombre: "Ocupada", descripcion: "Mesa con atencion en curso", orden: 2, permitePedido: true, liberaMesa: false },
    { codigo: "MESA_CERRADA", nombre: "Cerrada", descripcion: "Mesa dada de baja", orden: 3, permitePedido: false, liberaMesa: false }
  ];

  for (const estado of mesaEstados) {
    await prisma.mesaEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const pedidoEstados = [
    { codigo: "PEDIDO_ACTIVO", nombre: "Activo", descripcion: "Pedido abierto", orden: 1, esActivo: true },
    { codigo: "PEDIDO_FINALIZADO", nombre: "Finalizado", descripcion: "Pedido cerrado por cuenta", orden: 2, esActivo: false },
    { codigo: "PEDIDO_ANULADO", nombre: "Anulado", descripcion: "Pedido anulado", orden: 3, esActivo: false }
  ];

  for (const estado of pedidoEstados) {
    await prisma.pedidoEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const pedidoEstadosCocina = [
    { codigo: "COCINA_PENDIENTE", nombre: "Pendiente", descripcion: "Pedido pendiente de preparar", orden: 1, permiteAgregarItems: true, visibleCocina: true, notificaMozo: false },
    { codigo: "COCINA_EN_PREPARACION", nombre: "En preparacion", descripcion: "Pedido en preparacion", orden: 2, permiteAgregarItems: true, visibleCocina: true, notificaMozo: false },
    { codigo: "COCINA_LISTO", nombre: "Listo", descripcion: "Pedido listo para retirar", orden: 3, permiteAgregarItems: false, visibleCocina: true, notificaMozo: true },
    { codigo: "COCINA_ENTREGADO", nombre: "Entregado", descripcion: "Pedido entregado en mesa", orden: 4, permiteAgregarItems: false, visibleCocina: false, notificaMozo: false }
  ];

  for (const estado of pedidoEstadosCocina) {
    await prisma.pedidoEstadoCocina.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const metodosPago = [
    { codigo: "PAGO_EFECTIVO", nombre: "Efectivo", descripcion: "Pago en efectivo", orden: 1, requiereMontoRecibido: true },
    { codigo: "PAGO_DEBITO", nombre: "Debito", descripcion: "Pago con tarjeta de debito", orden: 2, requiereMontoRecibido: false },
    { codigo: "PAGO_CREDITO", nombre: "Credito", descripcion: "Pago con tarjeta de credito", orden: 3, requiereMontoRecibido: false },
    { codigo: "PAGO_TRANSFERENCIA", nombre: "Transferencia", descripcion: "Pago por transferencia", orden: 4, requiereMontoRecibido: false }
  ];

  const metodoPagoEstados = [
    { codigo: "METODO_PAGO_ACTIVO", nombre: "Activo", descripcion: "Metodo de pago habilitado para cobrar", orden: 1, habilitado: true },
    { codigo: "METODO_PAGO_INACTIVO", nombre: "Inactivo", descripcion: "Metodo de pago deshabilitado", orden: 2, habilitado: false }
  ];

  for (const estado of metodoPagoEstados) {
    await prisma.metodoPagoEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const metodoPagoActivo = await prisma.metodoPagoEstado.findUniqueOrThrow({ where: { codigo: "METODO_PAGO_ACTIVO" } });

  for (const metodo of metodosPago) {
    await prisma.metodoPago.upsert({
      where: { codigo: metodo.codigo },
      update: { ...metodo, estadoId: metodoPagoActivo.id },
      create: { ...metodo, estadoId: metodoPagoActivo.id }
    });
  }

  const cuentaEstados = [
    { codigo: "CUENTA_CERRADA", nombre: "Cerrada", descripcion: "Cuenta cerrada y cobrada", orden: 1, esCerrada: true },
    { codigo: "CUENTA_ANULADA", nombre: "Anulada", descripcion: "Cuenta anulada", orden: 2, esCerrada: false }
  ];

  for (const estado of cuentaEstados) {
    await prisma.cuentaEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const usuarioEstados = [
    { codigo: "USUARIO_ACTIVO", nombre: "Activo", descripcion: "Usuario habilitado para ingresar al sistema", orden: 1, permiteAcceso: true },
    { codigo: "USUARIO_INACTIVO", nombre: "Inactivo", descripcion: "Usuario dado de baja o sin acceso", orden: 2, permiteAcceso: false },
    { codigo: "USUARIO_BLOQUEADO", nombre: "Bloqueado", descripcion: "Usuario bloqueado temporalmente", orden: 3, permiteAcceso: false }
  ];

  for (const estado of usuarioEstados) {
    await prisma.usuarioEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const productoEstados = [
    { codigo: "PRODUCTO_ACTIVO", nombre: "Activo", descripcion: "Producto habilitado para vender", orden: 1, permiteVenta: true, esBajaLogica: false },
    { codigo: "PRODUCTO_INACTIVO", nombre: "Inactivo", descripcion: "Producto inactivo o dado de baja", orden: 2, permiteVenta: false, esBajaLogica: true }
  ];

  for (const estado of productoEstados) {
    await prisma.productoEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const productoVisibilidades = [
    { codigo: "PRODUCTO_VISIBLE_MENU", nombre: "Menu publico", descripcion: "Producto visible en el menu digital publico", orden: 1, visibleEnMenu: true },
    { codigo: "PRODUCTO_OCULTO_MENU", nombre: "Oculto", descripcion: "Producto oculto del menu digital publico", orden: 2, visibleEnMenu: false }
  ];

  for (const visibilidad of productoVisibilidades) {
    await prisma.productoVisibilidad.upsert({
      where: { codigo: visibilidad.codigo },
      update: visibilidad,
      create: visibilidad
    });
  }

  const pedidoItemEstados = [
    { codigo: "ITEM_ACTIVO", nombre: "Activo", descripcion: "Item vigente dentro del pedido", orden: 1, esAnulado: false },
    { codigo: "ITEM_ANULADO", nombre: "Anulado", descripcion: "Item anulado y excluido del cobro", orden: 2, esAnulado: true }
  ];

  for (const estado of pedidoItemEstados) {
    await prisma.pedidoItemEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const motivosAnulacion = [
    { codigo: "MOTIVO_CORRECCION_PEDIDO", nombre: "Correccion de pedido", descripcion: "Item anulado por correccion del pedido" },
    { codigo: "MOTIVO_CLIENTE_CANCELO", nombre: "Cliente cancelo", descripcion: "El cliente cancelo el producto" },
    { codigo: "MOTIVO_SIN_STOCK", nombre: "Sin stock", descripcion: "No hay disponibilidad del producto" },
    { codigo: "MOTIVO_OTRO", nombre: "Otro", descripcion: "Otro motivo de anulacion" }
  ];

  const motivoEstados = [
    { codigo: "MOTIVO_ACTIVO", nombre: "Activo", descripcion: "Motivo disponible para registrar anulaciones", orden: 1, habilitado: true },
    { codigo: "MOTIVO_INACTIVO", nombre: "Inactivo", descripcion: "Motivo deshabilitado", orden: 2, habilitado: false }
  ];

  for (const estado of motivoEstados) {
    await prisma.motivoAnulacionEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const motivoActivo = await prisma.motivoAnulacionEstado.findUniqueOrThrow({ where: { codigo: "MOTIVO_ACTIVO" } });

  for (const motivo of motivosAnulacion) {
    await prisma.motivoAnulacion.upsert({
      where: { codigo: motivo.codigo },
      update: { ...motivo, estadoId: motivoActivo.id },
      create: { ...motivo, estadoId: motivoActivo.id }
    });
  }

  const mesaLibre = await prisma.mesaEstado.findUniqueOrThrow({ where: { codigo: "MESA_LIBRE" } });
  const sectorEstados = [
    { codigo: "SECTOR_ACTIVO", nombre: "Activo", descripcion: "Sector habilitado para asignar mesas", orden: 1, habilitado: true },
    { codigo: "SECTOR_INACTIVO", nombre: "Inactivo", descripcion: "Sector deshabilitado", orden: 2, habilitado: false }
  ];

  for (const estado of sectorEstados) {
    await prisma.sectorMesaEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const sectorActivo = await prisma.sectorMesaEstado.findUniqueOrThrow({ where: { codigo: "SECTOR_ACTIVO" } });
  const usuarioActivo = await prisma.usuarioEstado.findUniqueOrThrow({ where: { codigo: "USUARIO_ACTIVO" } });
  const productoActivo = await prisma.productoEstado.findUniqueOrThrow({ where: { codigo: "PRODUCTO_ACTIVO" } });
  const productoVisible = await prisma.productoVisibilidad.findUniqueOrThrow({ where: { codigo: "PRODUCTO_VISIBLE_MENU" } });

  await prisma.user.upsert({
    where: { usuario: "admin" },
    update: {},
    create: {
      nombre: "Admin",
      apellido: "Villa Maria",
      usuario: "admin",
      passwordHash: hashPassword("admin123"),
      email: "admin@villamaria.local",
      estadoId: usuarioActivo.id,
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
      estadoId: usuarioActivo.id,
      roleId: empleadoRole.id
    }
  });

  await prisma.user.upsert({
    where: { usuario: "cocinero" },
    update: {},
    create: {
      nombre: "Cocinero",
      apellido: "Demo",
      usuario: "cocinero",
      passwordHash: hashPassword("cocinero123"),
      estadoId: usuarioActivo.id,
      roleId: cocineroRole.id
    }
  });

  for (const mesa of [
    { numero: 1, capacidad: 4, descripcion: "Salon principal" },
    { numero: 2, capacidad: 2, descripcion: "Ventana" },
    { numero: 3, capacidad: 6, descripcion: "Familiar" },
    { numero: 4, capacidad: 4, descripcion: "Patio" },
    { numero: 5, capacidad: 8, descripcion: "Mesa grande" }
  ]) {
    const sector = await prisma.sectorMesa.upsert({
      where: { nombre: mesa.descripcion },
      update: { estadoId: sectorActivo.id },
      create: { nombre: mesa.descripcion, estadoId: sectorActivo.id }
    });
    await prisma.mesa.upsert({
      where: { numero: mesa.numero },
      update: {},
      create: { ...mesa, estadoId: mesaLibre.id, sectorId: sector.id }
    });
  }

  const categorias = [
    { nombre: "Entradas", orden: 1 },
    { nombre: "Principales", orden: 2 },
    { nombre: "Bebidas", orden: 3 },
    { nombre: "Postres", orden: 4 }
  ];

  const categoriaEstados = [
    { codigo: "CATEGORIA_VISIBLE", nombre: "Visible", descripcion: "Categoria visible y disponible en el menu publico", orden: 1, visibleEnMenu: true, habilitado: true },
    { codigo: "CATEGORIA_OCULTA", nombre: "Oculta", descripcion: "Categoria oculta del menu publico", orden: 2, visibleEnMenu: false, habilitado: true },
    { codigo: "CATEGORIA_INACTIVA", nombre: "Inactiva", descripcion: "Categoria dada de baja", orden: 3, visibleEnMenu: false, habilitado: false }
  ];

  for (const estado of categoriaEstados) {
    await prisma.categoriaProductoEstado.upsert({
      where: { codigo: estado.codigo },
      update: estado,
      create: estado
    });
  }

  const categoriaVisible = await prisma.categoriaProductoEstado.findUniqueOrThrow({ where: { codigo: "CATEGORIA_VISIBLE" } });

  for (const categoria of categorias) {
    await prisma.categoriaProducto.upsert({
      where: { nombre: categoria.nombre },
      update: { estadoId: categoriaVisible.id },
      create: { ...categoria, estadoId: categoriaVisible.id }
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
          estadoId: productoActivo.id,
          visibilidadId: productoVisible.id
        }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
