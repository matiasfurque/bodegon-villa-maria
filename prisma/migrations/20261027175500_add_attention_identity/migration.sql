ALTER TABLE "Mesa"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "atencionToken" UUID;

ALTER TABLE "Pedido"
  ADD COLUMN "atencionToken" UUID;

ALTER TABLE "Cuenta"
  ADD COLUMN "atencionToken" UUID;

CREATE UNIQUE INDEX "Cuenta_atencionToken_key" ON "Cuenta"("atencionToken");
