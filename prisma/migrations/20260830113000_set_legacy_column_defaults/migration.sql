ALTER TABLE "Mesa" ALTER COLUMN "estado" SET DEFAULT 'Libre';
ALTER TABLE "Pedido" ALTER COLUMN "estado" SET DEFAULT 'Activo';
ALTER TABLE "Pedido" ALTER COLUMN "estadoCocina" SET DEFAULT 'Pendiente';
ALTER TABLE "Cuenta" ALTER COLUMN "metodoPago" SET DEFAULT 'Efectivo';
ALTER TABLE "Cuenta" ALTER COLUMN "estado" SET DEFAULT 'Cerrada';
ALTER TABLE "Cuenta" ALTER COLUMN "detalleJson" SET DEFAULT '[]';
