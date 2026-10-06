CREATE TABLE IF NOT EXISTS "CategoriaProductoEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "visibleEnMenu" BOOLEAN NOT NULL DEFAULT false,
  "habilitado" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "MetodoPagoEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "habilitado" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "SectorMesaEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "habilitado" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "MotivoAnulacionEstado" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "habilitado" BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO "CategoriaProductoEstado" ("codigo", "nombre", "descripcion", "orden", "visibleEnMenu", "habilitado") VALUES
  ('CATEGORIA_VISIBLE', 'Visible', 'Categoria visible y disponible en el menu publico', 1, true, true),
  ('CATEGORIA_OCULTA', 'Oculta', 'Categoria oculta del menu publico', 2, false, true),
  ('CATEGORIA_INACTIVA', 'Inactiva', 'Categoria dada de baja', 3, false, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "visibleEnMenu" = EXCLUDED."visibleEnMenu",
  "habilitado" = EXCLUDED."habilitado";

INSERT INTO "MetodoPagoEstado" ("codigo", "nombre", "descripcion", "orden", "habilitado") VALUES
  ('METODO_PAGO_ACTIVO', 'Activo', 'Metodo de pago habilitado para cobrar', 1, true),
  ('METODO_PAGO_INACTIVO', 'Inactivo', 'Metodo de pago deshabilitado', 2, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "habilitado" = EXCLUDED."habilitado";

INSERT INTO "SectorMesaEstado" ("codigo", "nombre", "descripcion", "orden", "habilitado") VALUES
  ('SECTOR_ACTIVO', 'Activo', 'Sector habilitado para asignar mesas', 1, true),
  ('SECTOR_INACTIVO', 'Inactivo', 'Sector deshabilitado', 2, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "habilitado" = EXCLUDED."habilitado";

INSERT INTO "MotivoAnulacionEstado" ("codigo", "nombre", "descripcion", "orden", "habilitado") VALUES
  ('MOTIVO_ACTIVO', 'Activo', 'Motivo disponible para registrar anulaciones', 1, true),
  ('MOTIVO_INACTIVO', 'Inactivo', 'Motivo deshabilitado', 2, false)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion",
  "orden" = EXCLUDED."orden",
  "habilitado" = EXCLUDED."habilitado";

ALTER TABLE "CategoriaProducto" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "MetodoPago" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "SectorMesa" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;
ALTER TABLE "MotivoAnulacion" ADD COLUMN IF NOT EXISTS "estadoId" INTEGER;

UPDATE "CategoriaProducto"
SET "estadoId" = CASE
  WHEN COALESCE("visible", true) = true THEN (SELECT "id" FROM "CategoriaProductoEstado" WHERE "codigo" = 'CATEGORIA_VISIBLE')
  ELSE (SELECT "id" FROM "CategoriaProductoEstado" WHERE "codigo" = 'CATEGORIA_OCULTA')
END
WHERE "estadoId" IS NULL;

UPDATE "MetodoPago"
SET "estadoId" = CASE
  WHEN COALESCE("activo", true) = true THEN (SELECT "id" FROM "MetodoPagoEstado" WHERE "codigo" = 'METODO_PAGO_ACTIVO')
  ELSE (SELECT "id" FROM "MetodoPagoEstado" WHERE "codigo" = 'METODO_PAGO_INACTIVO')
END
WHERE "estadoId" IS NULL;

UPDATE "SectorMesa"
SET "estadoId" = CASE
  WHEN COALESCE("activo", true) = true THEN (SELECT "id" FROM "SectorMesaEstado" WHERE "codigo" = 'SECTOR_ACTIVO')
  ELSE (SELECT "id" FROM "SectorMesaEstado" WHERE "codigo" = 'SECTOR_INACTIVO')
END
WHERE "estadoId" IS NULL;

UPDATE "MotivoAnulacion"
SET "estadoId" = CASE
  WHEN COALESCE("activo", true) = true THEN (SELECT "id" FROM "MotivoAnulacionEstado" WHERE "codigo" = 'MOTIVO_ACTIVO')
  ELSE (SELECT "id" FROM "MotivoAnulacionEstado" WHERE "codigo" = 'MOTIVO_INACTIVO')
END
WHERE "estadoId" IS NULL;

ALTER TABLE "CategoriaProducto" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "CategoriaProducto" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "MetodoPago" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "MetodoPago" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "SectorMesa" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "SectorMesa" ALTER COLUMN "estadoId" SET NOT NULL;
ALTER TABLE "MotivoAnulacion" ALTER COLUMN "estadoId" SET DEFAULT 1;
ALTER TABLE "MotivoAnulacion" ALTER COLUMN "estadoId" SET NOT NULL;

ALTER TABLE "CategoriaProducto" ADD CONSTRAINT "CategoriaProducto_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "CategoriaProductoEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetodoPago" ADD CONSTRAINT "MetodoPago_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "MetodoPagoEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SectorMesa" ADD CONSTRAINT "SectorMesa_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "SectorMesaEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MotivoAnulacion" ADD CONSTRAINT "MotivoAnulacion_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "MotivoAnulacionEstado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "CategoriaProducto_estadoId_idx" ON "CategoriaProducto"("estadoId");
CREATE INDEX IF NOT EXISTS "MetodoPago_estadoId_idx" ON "MetodoPago"("estadoId");
CREATE INDEX IF NOT EXISTS "SectorMesa_estadoId_idx" ON "SectorMesa"("estadoId");
CREATE INDEX IF NOT EXISTS "MotivoAnulacion_estadoId_idx" ON "MotivoAnulacion"("estadoId");
