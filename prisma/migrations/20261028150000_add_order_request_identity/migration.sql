ALTER TABLE "Pedido"
  ADD COLUMN "solicitudId" UUID,
  ADD COLUMN "solicitudHash" TEXT;

CREATE UNIQUE INDEX "Pedido_solicitudId_key" ON "Pedido"("solicitudId");
