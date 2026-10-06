CREATE TABLE IF NOT EXISTS "UsuarioEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "permiteAcceso" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "ProductoEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "permiteVenta" BOOLEAN NOT NULL DEFAULT false,
  "esBajaLogica" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "ProductoVisibilidad" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "visibleEnMenu" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "PedidoItemEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "esAnulado" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "MotivoAnulacion" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "SectorMesa" (
  "id" SERIAL PRIMARY KEY,
  "nombre" TEXT NOT NULL UNIQUE,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO "UsuarioEstado" ("codigo", "nombre", "descripcion", "orden", "permiteAcceso") VALUES
  ('USUARIO_ACTIVO', 'Activo', 'Usuario habilitado para ingresar al sistema', 1, true),
  ('USUARIO_INACTIVO', 'Inactivo', 'Usuario dado de baja o sin acceso', 2, false),
  ('USUARIO_BLOQUEADO', 'Bloqueado', 'Usuario bloqueado temporalmente', 3, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "permiteAcceso" = EXCLUDED."permiteAcceso";

INSERT INTO "ProductoEstado" ("codigo", "nombre", "descripcion", "orden", "permiteVenta", "esBajaLogica") VALUES
  ('PRODUCTO_ACTIVO', 'Activo', 'Producto habilitado para vender', 1, true, false),
  ('PRODUCTO_INACTIVO', 'Inactivo', 'Producto inactivo o dado de baja', 2, false, true)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "permiteVenta" = EXCLUDED."permiteVenta",
  "esBajaLogica" = EXCLUDED."esBajaLogica";

INSERT INTO "ProductoVisibilidad" ("codigo", "nombre", "descripcion", "orden", "visibleEnMenu") VALUES
  ('PRODUCTO_VISIBLE_MENU', 'Menu publico', 'Producto visible en el menu digital publico', 1, true),
  ('PRODUCTO_OCULTO_MENU', 'Oculto', 'Producto oculto del menu digital publico', 2, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "visibleEnMenu" = EXCLUDED."visibleEnMenu";

INSERT INTO "PedidoItemEstado" ("codigo", "nombre", "descripcion", "orden", "esAnulado") VALUES
  ('ITEM_ACTIVO', 'Activo', 'Item vigente dentro del pedido', 1, false),
  ('ITEM_ANULADO', 'Anulado', 'Item anulado y excluido del cobro', 2, true)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "esAnulado" = EXCLUDED."esAnulado";

INSERT INTO "MotivoAnulacion" ("codigo", "nombre", "descripcion", "activo") VALUES
  ('MOTIVO_CORRECCION_PEDIDO', 'Correccion de pedido', 'Item anulado por correccion del pedido', true),
  ('MOTIVO_CLIENTE_CANCELO', 'Cliente cancelo', 'El cliente cancelo el producto', true),
  ('MOTIVO_SIN_STOCK', 'Sin stock', 'No hay disponibilidad del producto', true),
  ('MOTIVO_OTRO', 'Otro', 'Otro motivo de anulacion', true)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "activo" = EXCLUDED."activo";

INSERT INTO "SectorMesa" ("nombre", "descripcion", "orden", "activo")
VALUES ('General', 'Sector general del salon', 1, true)
ON CONFLICT ("nombre") DO UPDATE SET
  "descripcion" = EXCLUDED."descripcion",
  "activo" = EXCLUDED."activo";

INSERT INTO "SectorMesa" ("nombre", "orden", "activo")
SELECT DISTINCT TRIM("descripcion"), 10, true
FROM "Mesa"
WHERE "descripcion" IS NOT NULL AND TRIM("descripcion") <> ''
ON CONFLICT ("nombre") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "visibilidadId" INTEGER;
ALTER TABLE "PedidoItem" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "PedidoItem" ADD COLUMN IF NOT EXISTS "motivoAnulacionId" INTEGER;
ALTER TABLE "PedidoItem" ADD COLUMN IF NOT EXISTS "motivoAnulacionDetalle" TEXT;
ALTER TABLE "Mesa" ADD COLUMN IF NOT EXISTS "sectorId" INTEGER;

UPDATE "User"
SET "estadoId" = CASE
  WHEN COALESCE("estado", true) = true THEN (SELECT "id" FROM "UsuarioEstado" WHERE "codigo" = 'USUARIO_ACTIVO')
  ELSE (SELECT "id" FROM "UsuarioEstado" WHERE "codigo" = 'USUARIO_INACTIVO')
END
WHERE "estadoId" IS NULL;

UPDATE "Producto"
SET "estadoId" = CASE
  WHEN COALESCE("activo", true) = true THEN (SELECT "id" FROM "ProductoEstado" WHERE "codigo" = 'PRODUCTO_ACTIVO')
  ELSE (SELECT "id" FROM "ProductoEstado" WHERE "codigo" = 'PRODUCTO_INACTIVO')
END
WHERE "estadoId" IS NULL;

UPDATE "Producto"
SET "visibilidadId" = CASE
  WHEN COALESCE("visibleMenu", true) = true THEN (SELECT "id" FROM "ProductoVisibilidad" WHERE "codigo" = 'PRODUCTO_VISIBLE_MENU')
  ELSE (SELECT "id" FROM "ProductoVisibilidad" WHERE "codigo" = 'PRODUCTO_OCULTO_MENU')
END
WHERE "visibilidadId" IS NULL;

UPDATE "PedidoItem"
SET "estadoId" = CASE
  WHEN COALESCE("anulado", false) = true THEN (SELECT "id" FROM "PedidoItemEstado" WHERE "codigo" = 'ITEM_ANULADO')
  ELSE (SELECT "id" FROM "PedidoItemEstado" WHERE "codigo" = 'ITEM_ACTIVO')
END
WHERE "estadoId" IS NULL;

UPDATE "PedidoItem"
SET
  "motivoAnulacionDetalle" = "motivoAnulacion",
  "motivoAnulacionId" = CASE
    WHEN "motivoAnulacion" ILIKE '%stock%' THEN (SELECT "id" FROM "MotivoAnulacion" WHERE "codigo" = 'MOTIVO_SIN_STOCK')
    WHEN "motivoAnulacion" ILIKE '%cliente%' THEN (SELECT "id" FROM "MotivoAnulacion" WHERE "codigo" = 'MOTIVO_CLIENTE_CANCELO')
    WHEN "motivoAnulacion" ILIKE '%correcci%' THEN (SELECT "id" FROM "MotivoAnulacion" WHERE "codigo" = 'MOTIVO_CORRECCION_PEDIDO')
    ELSE (SELECT "id" FROM "MotivoAnulacion" WHERE "codigo" = 'MOTIVO_OTRO')
  END
WHERE COALESCE("anulado", false) = true
  AND "motivoAnulacionId" IS NULL;

UPDATE "Mesa"
SET "sectorId" = COALESCE(
  (SELECT "id" FROM "SectorMesa" WHERE "nombre" = TRIM("Mesa"."descripcion")),
  (SELECT "id" FROM "SectorMesa" WHERE "nombre" = 'General')
)
WHERE "sectorId" IS NULL;

UPDATE "Mesa"
SET "abiertaPor" = NULL
WHERE "abiertaPor" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Mesa"."abiertaPor");

ALTER TABLE "User" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "User" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "Producto" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "Producto" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "Producto" ALTER COLUMN "visibilidadId" SET DEFAULT 1;
ALTER TABLE "Producto" ALTER COLUMN "visibilidadId" SET NOT NULL;
ALTER TABLE "PedidoItem" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "PedidoItem" ALTER COLUMN "estadoId" SET NOT NULL;

ALTER TABLE "User" ADD CONSTRAINT "User_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "UsuarioEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "ProductoEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_visibilidadId_fkey" FOREIGN KEY ("visibilidadId") REFERENCES "ProductoVisibilidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "PedidoItemEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_motivoAnulacionId_fkey" FOREIGN KEY ("motivoAnulacionId") REFERENCES "MotivoAnulacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "SectorMesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_abiertaPor_fkey" FOREIGN KEY ("abiertaPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "User_estadoId_idx" ON "User"("estadoId");
CREATE INDEX IF NOT EXISTS "Producto_estadoId_idx" ON "Producto"("estadoId");
CREATE INDEX IF NOT EXISTS "Producto_visibilidadId_idx" ON "Producto"("visibilidadId");
CREATE INDEX IF NOT EXISTS "PedidoItem_estadoId_idx" ON "PedidoItem"("estadoId");
CREATE INDEX IF NOT EXISTS "PedidoItem_motivoAnulacionId_idx" ON "PedidoItem"("motivoAnulacionId");
CREATE INDEX IF NOT EXISTS "Mesa_sectorId_idx" ON "Mesa"("sectorId");
CREATE INDEX IF NOT EXISTS "Mesa_abiertaPor_idx" ON "Mesa"("abiertaPor");
