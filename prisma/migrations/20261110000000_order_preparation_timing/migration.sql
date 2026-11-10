ALTER TABLE "Pedido"
  ADD COLUMN "preparacionEstimadaMinutos" INTEGER,
  ADD COLUMN "preparacionIniciadaEn" TIMESTAMP(3),
  ADD COLUMN "preparacionFinalizadaEn" TIMESTAMP(3);

ALTER TABLE "Pedido"
  ADD CONSTRAINT "Pedido_preparacionEstimadaMinutos_range_check"
  CHECK ("preparacionEstimadaMinutos" IS NULL OR "preparacionEstimadaMinutos" BETWEEN 5 AND 60);
