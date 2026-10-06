CREATE TABLE "MesaEstado" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "permitePedido" BOOLEAN NOT NULL DEFAULT false,
  "liberaMesa" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "MesaEstado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoEstado" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "esActivo" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PedidoEstado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoEstadoCocina" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "permiteAgregarItems" BOOLEAN NOT NULL DEFAULT false,
  "visibleCocina" BOOLEAN NOT NULL DEFAULT true,
  "notificaMozo" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PedidoEstadoCocina_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetodoPago" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "requiereMontoRecibido" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MetodoPago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuentaEstado" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "esCerrada" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CuentaEstado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuentaDetalle" (
  "id" SERIAL NOT NULL,
  "cuentaId" INTEGER NOT NULL,
  "pedidoId" INTEGER,
  "productoId" INTEGER,
  "productoNombre" TEXT NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "precioUnitario" DECIMAL(65,30) NOT NULL,
  "subtotal" DECIMAL(65,30) NOT NULL,
  "observacion" TEXT,
  CONSTRAINT "CuentaDetalle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MesaEstado_codigo_key" ON "MesaEstado"("codigo");
CREATE UNIQUE INDEX "PedidoEstado_codigo_key" ON "PedidoEstado"("codigo");
CREATE UNIQUE INDEX "PedidoEstadoCocina_codigo_key" ON "PedidoEstadoCocina"("codigo");
CREATE UNIQUE INDEX "MetodoPago_codigo_key" ON "MetodoPago"("codigo");
CREATE UNIQUE INDEX "CuentaEstado_codigo_key" ON "CuentaEstado"("codigo");
CREATE INDEX "CuentaDetalle_cuentaId_idx" ON "CuentaDetalle"("cuentaId");
CREATE INDEX "CuentaDetalle_productoId_idx" ON "CuentaDetalle"("productoId");

INSERT INTO "MesaEstado" ("codigo", "nombre", "descripcion", "orden", "permitePedido", "liberaMesa") VALUES
  ('MESA_LIBRE', 'Libre', 'Mesa disponible', 1, false, true),
  ('MESA_OCUPADA', 'Ocupada', 'Mesa con atencion en curso', 2, true, false),
  ('MESA_CERRADA', 'Cerrada', 'Mesa dada de baja', 3, false, false);

INSERT INTO "PedidoEstado" ("codigo", "nombre", "descripcion", "orden", "esActivo") VALUES
  ('PEDIDO_ACTIVO', 'Activo', 'Pedido abierto', 1, true),
  ('PEDIDO_FINALIZADO', 'Finalizado', 'Pedido cerrado por cuenta', 2, false),
  ('PEDIDO_ANULADO', 'Anulado', 'Pedido anulado', 3, false);

INSERT INTO "PedidoEstadoCocina" ("codigo", "nombre", "descripcion", "orden", "permiteAgregarItems", "visibleCocina", "notificaMozo") VALUES
  ('COCINA_PENDIENTE', 'Pendiente', 'Pedido pendiente de preparar', 1, true, true, false),
  ('COCINA_EN_PREPARACION', 'En preparacion', 'Pedido en preparacion', 2, true, true, false),
  ('COCINA_LISTO', 'Listo', 'Pedido listo para retirar', 3, false, true, true),
  ('COCINA_ENTREGADO', 'Entregado', 'Pedido entregado en mesa', 4, false, false, false);

INSERT INTO "MetodoPago" ("codigo", "nombre", "descripcion", "orden", "requiereMontoRecibido", "activo") VALUES
  ('PAGO_EFECTIVO', 'Efectivo', 'Pago en efectivo', 1, true, true),
  ('PAGO_DEBITO', 'Debito', 'Pago con tarjeta de debito', 2, false, true),
  ('PAGO_CREDITO', 'Credito', 'Pago con tarjeta de credito', 3, false, true),
  ('PAGO_TRANSFERENCIA', 'Transferencia', 'Pago por transferencia', 4, false, true);

INSERT INTO "CuentaEstado" ("codigo", "nombre", "descripcion", "orden", "esCerrada") VALUES
  ('CUENTA_CERRADA', 'Cerrada', 'Cuenta cerrada y cobrada', 1, true),
  ('CUENTA_ANULADA', 'Anulada', 'Cuenta anulada', 2, false);

ALTER TABLE "Mesa" ADD COLUMN "estadoId" INTEGER;
UPDATE "Mesa" AS m
SET "estadoId" = e."id"
FROM "MesaEstado" AS e
WHERE e."codigo" = CASE
  WHEN m."estado" = 'Ocupada' THEN 'MESA_OCUPADA'
  WHEN m."estado" = 'Cerrada' THEN 'MESA_CERRADA'
  ELSE 'MESA_LIBRE'
END;
ALTER TABLE "Mesa" ALTER COLUMN "estadoId" SET NOT NULL;

ALTER TABLE "Pedido" ADD COLUMN "estadoId" INTEGER;
ALTER TABLE "Pedido" ADD COLUMN "estadoCocinaId" INTEGER;
UPDATE "Pedido" AS p
SET "estadoId" = e."id"
FROM "PedidoEstado" AS e
WHERE e."codigo" = CASE
  WHEN p."estado" = 'Finalizado' THEN 'PEDIDO_FINALIZADO'
  WHEN p."estado" = 'Anulado' THEN 'PEDIDO_ANULADO'
  ELSE 'PEDIDO_ACTIVO'
END;
UPDATE "Pedido" AS p
SET "estadoCocinaId" = e."id"
FROM "PedidoEstadoCocina" AS e
WHERE e."codigo" = CASE
  WHEN p."estadoCocina" = 'En preparacion' THEN 'COCINA_EN_PREPARACION'
  WHEN p."estadoCocina" = 'Listo' THEN 'COCINA_LISTO'
  WHEN p."estadoCocina" = 'Entregado' THEN 'COCINA_ENTREGADO'
  ELSE 'COCINA_PENDIENTE'
END;
ALTER TABLE "Pedido" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "Pedido" ALTER COLUMN "estadoCocinaId" SET NOT NULL;

ALTER TABLE "Cuenta" ADD COLUMN "metodoPagoId" INTEGER;
ALTER TABLE "Cuenta" ADD COLUMN "estadoId" INTEGER;
UPDATE "Cuenta" AS c
SET "metodoPagoId" = m."id"
FROM "MetodoPago" AS m
WHERE m."codigo" = CASE
  WHEN c."metodoPago" = 'Debito' THEN 'PAGO_DEBITO'
  WHEN c."metodoPago" = 'Credito' THEN 'PAGO_CREDITO'
  WHEN c."metodoPago" = 'Transferencia' THEN 'PAGO_TRANSFERENCIA'
  ELSE 'PAGO_EFECTIVO'
END;
UPDATE "Cuenta" AS c
SET "estadoId" = e."id"
FROM "CuentaEstado" AS e
WHERE e."codigo" = CASE
  WHEN c."estado" = 'Anulada' THEN 'CUENTA_ANULADA'
  ELSE 'CUENTA_CERRADA'
END;

INSERT INTO "CuentaDetalle" ("cuentaId", "pedidoId", "productoNombre", "cantidad", "precioUnitario", "subtotal", "observacion")
SELECT
  c."id",
  NULLIF(item->>'pedidoId', '')::INTEGER,
  COALESCE(item->>'producto', 'Producto'),
  COALESCE(NULLIF(item->>'cantidad', '')::INTEGER, 0),
  COALESCE(NULLIF(item->>'precioUnitario', '')::DECIMAL, 0),
  COALESCE(NULLIF(item->>'subtotal', '')::DECIMAL, 0),
  item->>'observacion'
FROM "Cuenta" AS c
CROSS JOIN LATERAL jsonb_array_elements(c."detalleJson"::jsonb) AS item
WHERE c."detalleJson" IS NOT NULL
  AND c."detalleJson" <> ''
  AND c."detalleJson" <> '[]';

ALTER TABLE "Cuenta" ALTER COLUMN "metodoPagoId" SET NOT NULL;
ALTER TABLE "Cuenta" ALTER COLUMN "estadoId" SET NOT NULL;

ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_estadoId_fkey"
  FOREIGN KEY ("estadoId") REFERENCES "MesaEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_estadoId_fkey"
  FOREIGN KEY ("estadoId") REFERENCES "PedidoEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_estadoCocinaId_fkey"
  FOREIGN KEY ("estadoCocinaId") REFERENCES "PedidoEstadoCocina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_metodoPagoId_fkey"
  FOREIGN KEY ("metodoPagoId") REFERENCES "MetodoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_estadoId_fkey"
  FOREIGN KEY ("estadoId") REFERENCES "CuentaEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuentaDetalle" ADD CONSTRAINT "CuentaDetalle_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuentaDetalle" ADD CONSTRAINT "CuentaDetalle_productoId_fkey"
  FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
