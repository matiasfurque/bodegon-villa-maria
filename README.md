# Bodegon Villa Maria - Sistema de Gestion

Aplicacion web de gestion para Bodegon Villa Maria. El sistema permite administrar mesas, pedidos, cocina, productos, usuarios, recuperacion de contrasena, reportes e historial de cuentas desde un panel interno. Tambien incluye una portada publica con menu digital.

La aplicacion esta pensada para uso operativo real del local: mozos/empleados cargan pedidos, cocina los prepara, administracion gestiona carta/usuarios/reportes y el sistema conserva historial de cuentas cerradas.

## URLs principales

- Produccion: `https://bodegon-villa-maria.vercel.app`
- Login interno: `https://bodegon-villa-maria.vercel.app/login`
- Panel de gestion: `https://bodegon-villa-maria.vercel.app/dashboard`
- Desarrollo local: `http://localhost:3000` o `http://localhost:3001`

## Stack tecnico

- **Next.js**: framework principal de la app. Maneja pantallas, rutas web y endpoints API.
- **React**: biblioteca usada por Next.js para construir la interfaz.
- **TypeScript**: JavaScript con tipos, ayuda a detectar errores antes de publicar.
- **Prisma ORM**: capa que conecta el codigo con la base de datos.
- **PostgreSQL**: base de datos relacional SQL.
- **Neon Postgres**: servicio en la nube donde esta alojada la base de datos PostgreSQL.
- **Vercel**: servicio donde esta publicada la aplicacion web.
- **Resend**: servicio externo para enviar emails de recuperacion de contrasena.
- **GitHub**: repositorio donde esta guardado el codigo fuente.

## Base de datos

La base de datos principal esta en **Neon Postgres**.

Neon es un servicio de base de datos en la nube que ofrece **PostgreSQL**. PostgreSQL es una base **relacional SQL**, no NoSQL. Esto significa que la informacion se organiza en tablas relacionadas entre si.

Ejemplos de relaciones:

- Usuarios tienen un rol.
- Mesas tienen pedidos.
- Pedidos tienen items.
- Items apuntan a productos.
- Cuentas cerradas guardan el detalle de lo vendido.

La conexion se configura con la variable:

```env
DATABASE_URL="postgresql://usuario:password@host.neon.tech/neondb?sslmode=require"
```

No se debe subir la URL real con usuario y password a GitHub. En el repositorio solo existe `.env.example` como plantilla segura.

### Base local opcional

Para desarrollo local tambien se puede usar PostgreSQL instalado en la PC:

```env
DATABASE_URL="postgresql://postgres@localhost:5433/bodegon_villa_maria?schema=public"
```

Si localhost no conecta con Neon, puede ser por firewall, red, VPN, antivirus o bloqueo del puerto `5432`. Produccion puede seguir funcionando aunque la PC local no pueda conectarse, porque Vercel se conecta desde sus propios servidores.

## Que es Prisma

Prisma es un **ORM**. ORM significa que en vez de escribir SQL manual todo el tiempo, el codigo usa objetos y funciones de TypeScript para leer y guardar datos.

Ejemplo conceptual:

```ts
prisma.mesa.findMany()
```

Eso termina consultando la tabla `Mesa` en PostgreSQL.

Prisma usa el archivo:

```text
prisma/schema.prisma
```

Ese archivo define las tablas principales del sistema:

- `Role`: roles de usuarios.
- `User`: usuarios del sistema.
- `PasswordResetToken`: tokens temporales para recuperar contrasena.
- `Mesa`: mesas del local.
- `CategoriaProducto`: categorias de la carta.
- `Producto`: productos del menu.
- `Pedido`: pedido asociado a una mesa.
- `PedidoItem`: productos dentro de un pedido.
- `Cuenta`: cuenta cerrada con total, metodo de pago y detalle.

Cuando se cambia el modelo de datos, Prisma se usa para sincronizar la base y regenerar el cliente.

## Servicios externos usados

### Vercel

Vercel aloja la aplicacion web. Cada vez que se sube un commit a GitHub en la rama `main`, Vercel publica una nueva version de la app.

En Vercel deben estar configuradas variables como:

- `DATABASE_URL`
- `AUTH_SECRET`
- `APP_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`

### Neon

Neon aloja la base de datos PostgreSQL en la nube. Ahi viven los datos reales:

- usuarios
- mesas
- productos
- pedidos
- cuentas cerradas
- reportes calculados desde las cuentas

Es una base SQL relacional.

### Resend

Resend envia los emails de recuperacion de contrasena.

El flujo es:

1. El usuario ingresa usuario o email en `recuperar-contrasena`.
2. El sistema busca el usuario activo.
3. Genera un token temporal.
4. Guarda el token hasheado en la base.
5. Envia un link por email usando Resend.
6. El usuario abre el link y define una nueva contrasena.

Si Resend no esta configurado en desarrollo, el sistema puede mostrar un enlace local de prueba.

### GitHub

GitHub guarda el codigo fuente. La rama principal es `main`.

Repositorio:

```text
https://github.com/matiasfurque/bodegon-villa-maria.git
```

## Roles del sistema

### Administrador

Tiene acceso a todas las secciones:

- Inicio
- Operaciones
- Cocina
- Productos
- Usuarios
- Reportes
- Historial

### Empleado

Accede solo a:

- Operaciones

Sirve para mozos o personal que gestiona mesas y pedidos.

### Cocinero

Accede solo a:

- Cocina

Sirve para ver pedidos pendientes, marcarlos en preparacion, listos o entregados.

## Funcionamiento por modulo

### Login y seguridad

El login valida usuario y contrasena contra la base de datos. Las contrasenas no se guardan en texto plano: se guardan hasheadas.

El sistema usa sesion por cookie firmada con `AUTH_SECRET`.

Tambien existe recuperacion de contrasena por email usando Resend.

### Operaciones

Es la pantalla principal para el salon.

Permite:

- ver mesas
- crear mesas
- ocupar mesa
- liberar mesa si no tiene pedidos activos
- cargar productos al consumo
- ver consumo parcial
- cerrar cuenta
- anular items con motivo

Regla importante:

Una mesa con pedidos activos no se puede liberar directamente. Para dejarla libre hay que cerrar la cuenta. Esto evita perder consumos.

### Pedidos y cocina

Cuando se cargan productos a una mesa ocupada, se genera un pedido activo.

Estados de cocina:

- `Pendiente`
- `En preparacion`
- `Listo`
- `Entregado`

Cuando cocina marca un pedido como `Listo`, en Operaciones aparece una alerta en la mesa para que el mozo retire el pedido.

Si un pedido ya fue entregado y la mesa vuelve a pedir productos, el sistema crea un nuevo pedido para que cocina lo vea nuevamente.

### Sincronizacion operativa

El sistema tiene auto-sincronizacion en:

- Operaciones
- Cocina

Actualmente sincroniza cada **15 segundos**. Refresca mesas y pedidos para que, si se carga algo desde otro dispositivo, la otra pantalla lo vea sin refrescar manualmente.

La sincronizacion se pausa si:

- hay una accion manual en curso
- hay un modal abierto
- la pestana no esta visible

Esto evita que el sistema moleste durante cierres de cuenta, confirmaciones o cambios de estado.

### Productos y menu publico

El administrador puede crear, modificar, inactivar, ocultar o eliminar productos.

Cada producto tiene:

- nombre
- descripcion
- precio
- categoria
- estado activo/inactivo
- visibilidad en menu publico

El menu publico toma los productos visibles y activos desde la base de datos.

### Cierre de cuenta

Cuando se cierra una cuenta:

1. El sistema busca los pedidos activos de la mesa.
2. Suma items no anulados.
3. Calcula el total.
4. Guarda una `Cuenta` cerrada con detalle JSON.
5. Marca los pedidos como finalizados.
6. Libera la mesa.

Metodos de pago:

- Efectivo
- Debito
- Credito
- Transferencia

Para efectivo calcula monto recibido y vuelto.

### Reportes

Los reportes se calculan a partir de cuentas cerradas.

Incluyen:

- total vendido del periodo
- cuentas cerradas
- ticket promedio
- mesas atendidas
- items anulados
- productos mas vendidos
- cobros por metodo de pago
- exportacion CSV

Importante: `Vendido hoy` cuenta solo cuentas cerradas del dia. Los consumos abiertos no suman hasta cerrar cuenta.

### Historial

El historial muestra cuentas cerradas. Se puede filtrar por:

- mesa
- fecha desde
- fecha hasta

Tambien se puede exportar a CSV.

## Variables de entorno

Ejemplo:

```env
DATABASE_URL="postgresql://usuario:password@host.neon.tech/neondb?sslmode=require"
AUTH_SECRET="clave-larga-y-segura"
APP_URL="https://bodegon-villa-maria.vercel.app"
RESEND_API_KEY="re_xxxxxxxxx"
EMAIL_FROM="Villa Maria <onboarding@resend.dev>"
```

Nunca subir `.env` ni `.env.local` con claves reales.

## Comandos utiles

Instalar dependencias:

```bash
pnpm install
```

Generar Prisma Client:

```bash
pnpm prisma:generate
```

Sincronizar tablas con el schema de Prisma:

```bash
pnpm db:init
```

Cargar datos iniciales:

```bash
pnpm prisma:seed
```

Reiniciar base y cargar datos iniciales:

```bash
pnpm db:reset
```

Levantar en desarrollo:

```bash
pnpm dev
```

Levantar en otro puerto:

```bash
pnpm dev -p 3001
```

Compilar:

```bash
pnpm build
```

Nota: antes de compilar conviene detener `pnpm dev`. En Windows, correr build mientras el servidor de desarrollo esta vivo puede generar errores temporales dentro de `.next`.

## Datos iniciales del seed

El archivo `prisma/seed.ts` crea datos base:

- rol Administrador
- rol Empleado
- rol Cocinero
- usuario `admin`
- usuario `empleado`
- usuario `cocinero`
- mesas iniciales
- categorias iniciales
- productos iniciales

Estos datos sirven para iniciar el sistema, pero en uso real conviene cambiar contrasenas y emails desde el panel.

## Publicacion en produccion

Flujo normal:

1. Se hacen cambios en el codigo.
2. Se prueba en desarrollo.
3. Se ejecuta `pnpm build`.
4. Se hace commit.
5. Se sube a GitHub.
6. Vercel detecta el push y publica.

Si una mejora no gusta, se puede revertir el commit correspondiente. Varias mejoras recientes se hicieron en commits separados para poder volver atras facilmente.

## Archivos importantes

- `src/app/page.tsx`: portada publica y menu digital.
- `src/app/login/page.tsx`: login interno.
- `src/app/dashboard/ui.tsx`: interfaz principal del panel.
- `src/app/api/*`: endpoints internos.
- `prisma/schema.prisma`: definicion de tablas.
- `prisma/seed.ts`: datos iniciales.
- `.env.example`: plantilla de variables.
- `src/app/icon.png`: favicon del sitio.

## Resumen simple de como fluye el sistema

1. El usuario entra al login.
2. El sistema valida usuario y rol.
3. Segun el rol, muestra las secciones permitidas.
4. En Operaciones se ocupa una mesa y se cargan productos.
5. Los productos generan pedidos para Cocina.
6. Cocina cambia estados del pedido.
7. Operaciones ve alertas cuando el pedido esta listo.
8. Al final, se cierra cuenta.
9. La cuenta cerrada alimenta historial y reportes.
10. La mesa vuelve a quedar libre.

