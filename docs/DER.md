# DER - Bodegon Villa Maria

Este diagrama representa la estructura actual de la base de datos PostgreSQL en Neon.

Nota importante: algunas columnas antiguas siguen existiendo fisicamente como respaldo de migracion, pero ya no son la fuente principal del sistema. Estan marcadas como `legacy`.

```mermaid
erDiagram
  Role ||--o{ User : asigna
  UsuarioEstado ||--o{ User : define_estado
  Role ||--o{ RolePermiso : contiene
  Permiso ||--o{ RolePermiso : habilita
  User ||--o{ PasswordResetToken : solicita
  User ||--o{ Pedido : registra
  User ||--o{ Cuenta : cierra
  User ||--o{ Mesa : abre

  MesaEstado ||--o{ Mesa : define_estado
  SectorMesaEstado ||--o{ SectorMesa : define_estado
  SectorMesa ||--o{ Mesa : agrupa
  Mesa ||--o{ Pedido : recibe
  Mesa ||--o{ Cuenta : factura

  CategoriaProductoEstado ||--o{ CategoriaProducto : define_estado
  CategoriaProducto ||--o{ Producto : clasifica
  ProductoEstado ||--o{ Producto : define_estado
  ProductoVisibilidad ||--o{ Producto : define_visibilidad
  Producto ||--o{ PedidoItem : pedido
  Producto ||--o{ CuentaDetalle : historiza

  PedidoEstado ||--o{ Pedido : define_estado
  PedidoEstadoCocina ||--o{ Pedido : define_estado_cocina
  Pedido ||--o{ PedidoItem : contiene
  PedidoItemEstado ||--o{ PedidoItem : define_estado
  MotivoAnulacionEstado ||--o{ MotivoAnulacion : define_estado
  MotivoAnulacion ||--o{ PedidoItem : justifica

  MetodoPagoEstado ||--o{ MetodoPago : define_estado
  MetodoPago ||--o{ Cuenta : medio_de_pago
  CuentaEstado ||--o{ Cuenta : define_estado
  Cuenta ||--o{ CuentaDetalle : detalla

  Role {
    int id PK
    text nombre UK
    text descripcion
  }

  Permiso {
    int id PK
    text codigo UK
    text nombre
    text descripcion
  }

  RolePermiso {
    int id PK
    int roleId FK
    int permisoId FK
  }

  User {
    int id PK
    text nombre
    text apellido
    text usuario UK
    text passwordHash
    int estadoId FK
    text telefono
    text email
    int roleId FK
    datetime createdAt
    datetime updatedAt
    boolean estado "legacy"
  }

  UsuarioEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean permiteAcceso
  }

  PasswordResetToken {
    int id PK
    int userId FK
    text tokenHash UK
    datetime expiresAt
    datetime usedAt
    datetime createdAt
  }

  Mesa {
    int id PK
    int numero UK
    text descripcion
    int capacidad
    int estadoId FK
    int sectorId FK
    datetime abiertaAt
    int abiertaPor FK
    datetime createdAt
    datetime updatedAt
    text estado "legacy"
    boolean activa "legacy"
  }

  MesaEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean permitePedido
    boolean liberaMesa
  }

  SectorMesa {
    int id PK
    text nombre UK
    text descripcion
    int orden
    int estadoId FK
    boolean activo "legacy"
  }

  SectorMesaEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean habilitado
  }

  CategoriaProducto {
    int id PK
    text nombre UK
    int orden
    int estadoId FK
    boolean visible "legacy"
  }

  CategoriaProductoEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean visibleEnMenu
    boolean habilitado
  }

  Producto {
    int id PK
    text nombre
    text descripcion
    decimal precio
    int estadoId FK
    int visibilidadId FK
    int categoriaId FK
    datetime createdAt
    datetime updatedAt
    boolean activo "legacy"
    boolean visibleMenu "legacy"
  }

  ProductoEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean permiteVenta
    boolean esBajaLogica
  }

  ProductoVisibilidad {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean visibleEnMenu
  }

  Pedido {
    int id PK
    int mesaId FK
    int usuarioId FK
    datetime fechaHora
    int estadoId FK
    int estadoCocinaId FK
    text observacion
    text estado "legacy"
    text estadoCocina "legacy"
  }

  PedidoEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean esActivo
  }

  PedidoEstadoCocina {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean permiteAgregarItems
    boolean visibleCocina
    boolean notificaMozo
  }

  PedidoItem {
    int id PK
    int pedidoId FK
    int productoId FK
    int cantidad
    decimal precioUnitario
    decimal subtotal
    text observacion
    int estadoId FK
    int motivoAnulacionId FK
    text motivoAnulacionDetalle
    boolean anulado "legacy"
    text motivoAnulacion "legacy"
  }

  PedidoItemEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean esAnulado
  }

  MotivoAnulacion {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int estadoId FK
    boolean activo "legacy"
  }

  MotivoAnulacionEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean habilitado
  }

  Cuenta {
    int id PK
    int mesaId FK
    int usuarioCierreId FK
    datetime fechaCierre
    decimal total
    int metodoPagoId FK
    decimal montoRecibido
    decimal vuelto
    int estadoId FK
    text metodoPago "legacy"
    text estado "legacy"
    text detalleJson "legacy"
  }

  MetodoPago {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean requiereMontoRecibido
    int estadoId FK
    boolean activo "legacy"
  }

  MetodoPagoEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean habilitado
  }

  CuentaEstado {
    int id PK
    text codigo UK
    text nombre
    text descripcion
    int orden
    boolean esCerrada
  }

  CuentaDetalle {
    int id PK
    int cuentaId FK
    int pedidoId
    int productoId FK
    text productoNombre
    int cantidad
    decimal precioUnitario
    decimal subtotal
    text observacion
  }
```

## Tablas principales

- `User`: usuarios internos del sistema.
- `Role`: perfiles generales, por ejemplo administrador, empleado o cocina.
- `Permiso`: acciones permitidas dentro del sistema.
- `RolePermiso`: tabla intermedia que relaciona roles con permisos.
- `Mesa`: mesas fisicas del local.
- `Producto`: productos de la carta.
- `Pedido`: pedido abierto o finalizado de una mesa.
- `PedidoItem`: productos individuales dentro de un pedido.
- `Cuenta`: cierre de cuenta/cobro.
- `CuentaDetalle`: detalle historico de los productos cobrados.

## Tablas de catalogo y estado

- `UsuarioEstado`: define si un usuario puede acceder.
- `MesaEstado`: define si una mesa esta libre, ocupada o cerrada.
- `SectorMesa` y `SectorMesaEstado`: organizan mesas por sector y estado.
- `CategoriaProducto` y `CategoriaProductoEstado`: organizan productos por categoria y visibilidad.
- `ProductoEstado`: define si un producto se puede vender.
- `ProductoVisibilidad`: define si un producto aparece en el menu publico.
- `PedidoEstado`: define si un pedido esta activo, finalizado o anulado.
- `PedidoEstadoCocina`: define el avance del pedido en cocina.
- `PedidoItemEstado`: define si un item esta activo o anulado.
- `MotivoAnulacion` y `MotivoAnulacionEstado`: normalizan los motivos de anulacion.
- `MetodoPago` y `MetodoPagoEstado`: normalizan medios de pago.
- `CuentaEstado`: define el estado del cierre de cuenta.

## Columnas legacy

Estas columnas existen en Neon como respaldo de migracion, pero el software actual usa las relaciones normalizadas con `estadoId`, `visibilidadId`, `metodoPagoId`, etc.

- `User.estado`
- `Mesa.estado`
- `Mesa.activa`
- `Producto.activo`
- `Producto.visibleMenu`
- `Pedido.estado`
- `Pedido.estadoCocina`
- `PedidoItem.anulado`
- `PedidoItem.motivoAnulacion`
- `Cuenta.metodoPago`
- `Cuenta.estado`
- `Cuenta.detalleJson`
- `CategoriaProducto.visible`
- `MetodoPago.activo`
- `SectorMesa.activo`
- `MotivoAnulacion.activo`

## Normalizacion aplicada

- Los roles no dependen de condiciones fijas en el codigo: cada rol se conecta a permisos mediante `RolePermiso`.
- Los estados operativos no se guardan como texto libre principal: se referencian por claves foraneas.
- Los productos no dependen directamente de `activo` o `visibleMenu`: usan `ProductoEstado` y `ProductoVisibilidad`.
- Los items anulados no dependen solo de un booleano: usan `PedidoItemEstado` y `MotivoAnulacion`.
- Los cobros no guardan el detalle principal en JSON: usan `CuentaDetalle`.
- Los metodos de pago, categorias, sectores y motivos tienen estados propios normalizados.
