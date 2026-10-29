ALTER TABLE "PedidoItem"
  ADD COLUMN "solicitudId" UUID,
  ADD COLUMN "solicitudHash" TEXT;

CREATE UNIQUE INDEX "PedidoItem_solicitudId_key" ON "PedidoItem"("solicitudId");
