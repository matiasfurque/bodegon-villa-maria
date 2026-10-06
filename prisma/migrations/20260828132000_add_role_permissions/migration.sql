CREATE TABLE "Permiso" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,

  CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermiso" (
  "id" SERIAL NOT NULL,
  "roleId" INTEGER NOT NULL,
  "permisoId" INTEGER NOT NULL,

  CONSTRAINT "RolePermiso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permiso_codigo_key" ON "Permiso"("codigo");
CREATE UNIQUE INDEX "RolePermiso_roleId_permisoId_key" ON "RolePermiso"("roleId", "permisoId");
CREATE INDEX "RolePermiso_permisoId_idx" ON "RolePermiso"("permisoId");

ALTER TABLE "RolePermiso" ADD CONSTRAINT "RolePermiso_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermiso" ADD CONSTRAINT "RolePermiso_permisoId_fkey"
  FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
