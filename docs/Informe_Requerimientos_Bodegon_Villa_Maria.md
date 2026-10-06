# Bodegon Villa Maria - Informe de Requerimientos

Version 1.0  
Fecha: 20/09/2026  
Proyecto: Sistema de gestion para Bodegon Villa Maria  
Materia: Ingenieria de Software  
Equipo: [Completar integrantes]

## Historial de revision

| Fecha | Version | Descripcion | Autor |
|---|---:|---|---|
| 20/09/2026 | 1.0 | Primera version del informe de requerimientos del sistema de gestion Bodegon Villa Maria. | [Completar equipo] |

## Resumen ejecutivo

El sistema de gestion para Bodegon Villa Maria es una aplicacion web orientada a administrar la operacion interna de un local gastronomico. La solucion permite gestionar mesas, pedidos, cocina, productos, usuarios, reportes, historial de cuentas y recuperacion de contrasena. Tambien incluye una portada publica con menu digital actualizado desde el panel interno.

El sistema se encuentra pensado para un uso operativo real: los mozos o empleados pueden ocupar mesas y cargar consumos, cocina puede visualizar y actualizar el estado de los pedidos, y el administrador puede gestionar productos, usuarios, reportes e historial. La informacion queda almacenada en una base de datos PostgreSQL en la nube mediante Neon, y la aplicacion se publica en Vercel.

## Tablero de requerimientos

| Indicador | Resultado | Observacion |
|---|---:|---|
| Estado del relevamiento | Completo | Basado en el sistema desarrollado y probado |
| Requerimientos funcionales | 16 | RF01 a RF16 |
| Requerimientos no funcionales | 10 | RNF01 a RNF10 |
| Perfiles principales | 3 | Administrador, empleado y cocinero |
| Alcance | Web responsive | Panel interno y menu publico |
| Base de datos | PostgreSQL | Alojada en Neon |
| Publicacion | Vercel | Acceso desde navegador |

## 1. Objetivo y alcance

El objetivo de este informe es documentar los requerimientos principales del sistema de gestion de Bodegon Villa Maria, definiendo sus funcionalidades, actores, restricciones, criterios de aceptacion y prioridades de implementacion.

La solucion consiste en una aplicacion web accesible desde navegadores modernos. El sistema permite administrar la operatoria diaria del local, incluyendo la ocupacion de mesas, carga de pedidos, seguimiento de cocina, cierre de cuentas, administracion de productos, gestion de usuarios y generacion de reportes.

El sistema diferencia dos espacios principales:

- Sitio publico: muestra la presentacion del local y el menu digital.
- Panel interno: permite gestionar operaciones, cocina, productos, usuarios, reportes e historial.

## 1.1. Elementos fuera del alcance

- Desarrollo de aplicaciones moviles nativas para Android o iOS.
- Integracion con pasarelas de pago automaticas.
- Facturacion fiscal electronica.
- Integracion con impresoras comandera o ticketera fisica.
- Sistema de delivery con seguimiento por GPS.
- Gestion contable avanzada.
- Modulo de reservas online.
- Integracion automatica con redes sociales.

## 2. Usuarios y actores

| Actor | Necesidad principal | Nivel de acceso |
|---|---|---|
| Administrador | Gestionar usuarios, productos, reportes, historial y configuracion operativa. | Acceso completo al panel interno. |
| Empleado / mozo | Administrar mesas, cargar pedidos, anular items y cerrar cuentas. | Acceso a operaciones. |
| Cocinero | Visualizar pedidos pendientes y actualizar su estado de cocina. | Acceso a cocina. |
| Visitante | Consultar informacion publica y menu digital. | Acceso publico sin autenticacion. |
| Sistema | Validar reglas, guardar datos, sincronizar informacion y proteger accesos. | Procesos internos automaticos. |

## 3. Descripcion general del producto

### 3.1. Perspectiva del producto

El sistema funciona como una plataforma web centralizada en la nube. La aplicacion esta desarrollada con Next.js, React y TypeScript. La base de datos es PostgreSQL, administrada mediante Prisma ORM y alojada en Neon. La publicacion web se realiza mediante Vercel.

La aplicacion permite que distintos dispositivos accedan al mismo sistema: por ejemplo, un mozo puede cargar un pedido desde un celular y cocina puede verlo desde otra pantalla. Para mejorar la experiencia operativa, las secciones de operaciones y cocina incorporan sincronizacion periodica.

### 3.2. Funcionalidad general

El sistema permite:

- Iniciar sesion con usuarios internos.
- Gestionar mesas del salon.
- Ocupar y liberar mesas bajo reglas de negocio.
- Cargar productos al consumo de una mesa.
- Generar pedidos para cocina.
- Actualizar estados de cocina.
- Notificar al mozo cuando un pedido esta listo.
- Anular items indicando motivo.
- Cerrar cuentas con metodo de pago.
- Guardar detalle historico de cada cuenta cerrada.
- Administrar productos, categorias, estados y visibilidad en menu.
- Consultar reportes de ventas.
- Consultar historial de cuentas.
- Recuperar contrasena mediante correo electronico.
- Mostrar un menu publico actualizado desde la base de datos.

## 4. Requerimientos funcionales

| Codigo | Requerimiento | Resultado esperado |
|---|---|---|
| RF01 | Login de usuarios internos | El sistema debe validar usuario y contrasena para permitir el acceso al panel interno. |
| RF02 | Gestion de roles y permisos | El sistema debe permitir diferenciar accesos segun rol: administrador, empleado y cocinero. |
| RF03 | Recuperacion de contrasena | El sistema debe permitir solicitar un enlace temporal para restablecer la contrasena mediante email. |
| RF04 | Gestion de mesas | El sistema debe permitir crear, editar, ocupar y dar de baja mesas. |
| RF05 | Liberacion segura de mesas | El sistema debe permitir liberar una mesa solo si no posee pedidos activos o consumos pendientes. |
| RF06 | Carga de productos al consumo | El sistema debe permitir agregar productos a una mesa ocupada, calculando cantidades, precio unitario y subtotal. |
| RF07 | Generacion de pedidos para cocina | El sistema debe generar pedidos visibles para cocina a partir de los productos cargados en una mesa. |
| RF08 | Gestion de estados de cocina | El sistema debe permitir avanzar pedidos por estados como pendiente, en preparacion, listo y entregado. |
| RF09 | Notificacion operativa al mozo | El sistema debe mostrar una alerta cuando cocina marque un pedido como listo. |
| RF10 | Anulacion de items | El sistema debe permitir anular items indicando un motivo de anulacion. |
| RF11 | Cierre de cuenta | El sistema debe calcular el total de una mesa, registrar metodo de pago, guardar detalle y liberar la mesa. |
| RF12 | Validacion previa al cierre | El sistema debe impedir cerrar una cuenta si existen pedidos pendientes, en preparacion o listos sin entregar. |
| RF13 | Gestion de productos | El sistema debe permitir crear, modificar, inactivar, ocultar o eliminar productos del menu. |
| RF14 | Menu publico | El sistema debe mostrar en la portada publica los productos visibles y disponibles segun la base de datos. |
| RF15 | Reportes e historial | El sistema debe permitir consultar ventas, cuentas cerradas, ticket promedio, productos mas vendidos y cobros por metodo de pago. |
| RF16 | Exportacion de informacion | El sistema debe permitir exportar informacion relevante en formato CSV para reportes o historial. |

## 5. Requerimientos no funcionales

| Codigo | Atributo | Criterio |
|---|---|---|
| RNF01 | Disponibilidad | El sistema debe estar disponible desde internet mientras los servicios de Vercel y Neon se encuentren operativos. |
| RNF02 | Compatibilidad | El sistema debe funcionar en navegadores modernos como Chrome, Edge, Firefox y Safari. |
| RNF03 | Diseno responsive | La interfaz debe adaptarse a computadoras, tablets y celulares. |
| RNF04 | Seguridad de acceso | El panel interno debe requerir autenticacion obligatoria. |
| RNF05 | Proteccion de contrasenas | Las contrasenas no deben almacenarse en texto plano, sino mediante hash seguro. |
| RNF06 | Integridad de datos | Las operaciones sobre mesas, pedidos y cuentas deben mantener consistencia en la base de datos. |
| RNF07 | Usabilidad | La interfaz debe ser clara para usuarios con conocimientos informaticos basicos. |
| RNF08 | Rendimiento | Las consultas principales deben responder en tiempos adecuados para la operacion del local. |
| RNF09 | Mantenibilidad | El codigo y la base deben permitir incorporar cambios sin afectar funcionalidades existentes. |
| RNF10 | Portabilidad | La aplicacion debe poder desplegarse en servicios compatibles con tecnologias web estandar. |

## 6. Reglas y restricciones relevantes

- Solo usuarios autenticados pueden ingresar al panel interno.
- Cada usuario debe operar segun los permisos asociados a su rol.
- Una mesa con pedidos activos no puede liberarse directamente.
- Una cuenta no puede cerrarse si existen pedidos de cocina sin entregar.
- Los items anulados no deben sumarse al total de la cuenta.
- Toda anulacion de item debe registrar un motivo.
- Los productos inactivos o no visibles no deben mostrarse en el menu publico.
- Los pedidos entregados no deben volver a cocina.
- Si una mesa vuelve a pedir despues de recibir un pedido anterior, debe generarse un nuevo pedido.
- El detalle de cuenta cerrada debe conservarse historicamente para reportes.
- La base de datos debe mantener relaciones normalizadas mediante claves foraneas.

## 7. Dependencias y supuestos

| Dependencia o supuesto | Implicancia |
|---|---|
| Servicio Vercel | La disponibilidad de la aplicacion depende del hosting de Vercel. |
| Servicio Neon | La persistencia de datos depende de la base PostgreSQL alojada en Neon. |
| Servicio Resend | La recuperacion de contrasena por email depende del servicio externo de correo. |
| Conexion a internet | Los usuarios necesitan acceso a internet para usar el sistema publicado. |
| Datos iniciales | El sistema requiere estados, roles, permisos, productos y categorias cargados correctamente. |
| Uso operativo correcto | El personal debe respetar el flujo de pedido, cocina, entrega y cierre de cuenta. |

## 8. Criterios de aceptacion

- El administrador debe poder ingresar al panel y acceder a todas las secciones.
- El empleado debe acceder solo a operaciones.
- El cocinero debe acceder solo a cocina.
- El sistema debe permitir ocupar una mesa y cargar productos.
- Los productos cargados deben generar pedidos visibles en cocina.
- Cocina debe poder avanzar el estado del pedido hasta entregado.
- El sistema debe impedir cerrar la cuenta si hay pedidos sin entregar.
- El cierre de cuenta debe guardar total, metodo de pago y detalle de productos.
- Los reportes deben calcularse a partir de cuentas cerradas.
- El menu publico debe mostrar productos activos y visibles.
- La recuperacion de contrasena debe generar un enlace temporal seguro.
- La base debe conservar integridad mediante relaciones normalizadas.

## 9. Priorizacion para la implementacion

| Prioridad | Requerimientos | Justificacion |
|---|---|---|
| Alta | RF01, RF02, RF04, RF06, RF07, RF08, RF11, RF12 | Forman el circuito principal de operacion del local: login, mesas, pedidos, cocina y cierre de cuenta. |
| Media | RF03, RF09, RF10, RF13, RF15 | Mejoran seguridad, control operativo, gestion administrativa y seguimiento del negocio. |
| Posterior | RF14, RF16 y mejoras evolutivas | Complementan la experiencia publica, exportacion y crecimiento futuro del sistema. |

## 10. Trazabilidad y validacion

Los requerimientos funcionales se relacionan con los modulos principales del sistema:

| Modulo | Requerimientos relacionados |
|---|---|
| Login y seguridad | RF01, RF02, RF03 |
| Operaciones / mesas | RF04, RF05, RF06, RF10, RF11, RF12 |
| Cocina | RF07, RF08, RF09 |
| Productos y menu | RF13, RF14 |
| Reportes e historial | RF15, RF16 |

La validacion del sistema debe realizarse mediante pruebas manuales sobre los flujos principales:

1. Ingreso al sistema con usuario valido.
2. Ocupacion de mesa.
3. Carga de productos.
4. Visualizacion del pedido en cocina.
5. Cambio de estados de cocina.
6. Entrega del pedido.
7. Cierre de cuenta.
8. Consulta de historial y reportes.

## 11. Evolucion previsible del sistema

En futuras etapas se podrian incorporar:

- Impresion automatica de comandas.
- Modulo de reservas.
- Control de stock de insumos.
- Gestion de proveedores.
- Facturacion electronica.
- Panel de indicadores mas avanzado.
- Notificaciones push o sonoras.
- Integracion con medios de pago digitales.
- Auditoria detallada de acciones por usuario.

## 12. Conclusion

Los requerimientos relevados permiten cubrir el circuito operativo principal de Bodegon Villa Maria. El sistema centraliza la gestion de mesas, pedidos, cocina, productos, usuarios, reportes e historial, manteniendo una separacion clara entre el menu publico y el panel interno.

La normalizacion de la base de datos, el uso de roles y permisos, la validacion de estados de cocina y el registro detallado de cuentas cerradas permiten que el sistema sea mas confiable, mantenible y adecuado para un entorno real de trabajo. Como prioridad, el desarrollo debe conservar la estabilidad del flujo principal: ocupar mesa, cargar pedido, preparar en cocina, entregar y cerrar cuenta.
