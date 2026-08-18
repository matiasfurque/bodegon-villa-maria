# Plataforma de Gestion para Bodegon Villa Maria

Aplicacion web full stack para el proyecto final de Practica Profesional III.
Incluye sitio publico, login, roles, gestion interna, pedidos, consumos y reportes.

## Stack

- Next.js + TypeScript
- Prisma ORM
- PostgreSQL 18 como base de datos relacional local o cloud

## Funcionalidades

- Login con contrasenas hasheadas.
- Roles `Administrador` y `Empleado`.
- Proteccion de rutas internas.
- Gestion de usuarios con baja logica.
- Gestion de mesas con estados `Libre`, `Ocupada` y `Cerrada`.
- Gestion de categorias y productos del menu.
- Menu publico por categorias.
- Pedidos asociados a mesas ocupadas.
- Items con cantidad, precio aplicado, subtotal y observacion.
- Anulacion logica de items.
- Calculo automatico del consumo de mesa.
- Cierre de cuenta con total, fecha, usuario responsable y detalle.
- Metodos de pago, monto recibido y vuelto.
- Historial de consumos.
- Historial de consumos con filtros por mesa y rango de fechas.
- Exportacion CSV del historial y reportes.
- Reportes con rango de fechas, ticket promedio, cobros por metodo de pago, mesas atendidas, items anulados y productos mas vendidos.
- Edicion de mesas, usuarios y productos desde el panel.

## Credenciales demo

- Administrador: `admin` / `admin123`
- Empleado: `empleado` / `empleado123`

## Comandos

Instalar dependencias:

```bash
pnpm install
```

Generar Prisma Client:

```bash
pnpm prisma:generate
```

Crear tablas de la base local:

```bash
pnpm db:init
```

Cargar datos iniciales:

```bash
pnpm prisma:seed
```

Levantar en desarrollo:

```bash
pnpm dev
```

Compilar:

```bash
pnpm build
```

Nota: si el servidor de desarrollo esta corriendo, detenelo antes de compilar. En Windows, correr `next build` mientras `next dev` esta vivo puede mezclar artefactos temporales dentro de `.next`.

## URLs

- Sitio publico: `http://localhost:3000`
- Login interno: `http://localhost:3000/login`
- Panel interno: `http://localhost:3000/dashboard`

## Base de datos local

Para desarrollo local se puede usar PostgreSQL:

```env
DATABASE_URL="postgresql://postgres@localhost:5433/bodegon_villa_maria?schema=public"
```

PostgreSQL detectado:

- Servicio: PostgreSQL 18
- Puerto: `5433`
- Base: `bodegon_villa_maria`
- Usuario: `postgres`

Para reiniciar tablas y datos demo:

```bash
pnpm db:reset
```

## Base de datos en la nube con Neon

La app tambien puede usar Neon Postgres. En ese caso, el archivo `.env` debe tener una URL como esta:

```env
DATABASE_URL="postgresql://usuario:password@host.neon.tech/neondb?sslmode=require"
AUTH_SECRET="una-clave-segura"
```

No subas el archivo `.env` a GitHub. El proyecto incluye `.env.example` como plantilla segura.

Para sincronizar una base Neon nueva:

```bash
pnpm db:init
pnpm prisma:seed
```

Despues de eso ya se puede iniciar sesion con las credenciales demo.
