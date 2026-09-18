# Xicronix Commercial Intelligence — V2.1

Fecha: 18 de septiembre de 2026. Integración autorizada por el fundador.

## Versión principal

URL operativa: https://xicronix-commercial-intelligence.vercel.app/

La base de esta versión es `improvement/commercial-workspace-v2` en
`091e758dbe9e6c4d6e9b45e7ef385a202e8e643a`, no la interfaz básica anterior.
La integración conserva también el historial y los archivos exclusivos de `main`
en `c2d92406b41854a8f4fc931bbbfff2ead574e6fd`.

## Funcionalidad conservada e integrada

- Panel ejecutivo, indicadores, gráficos, metas, costos, catálogo y gastos operativos.
- Modos administrador/vendedor, navegación por módulos, búsqueda, filtros, importación y exportación.
- Instituciones, contactos, prospectos, oportunidades, tareas e interacciones.
- Modo nocturno y demostración local claramente separada.
- Inicio con DATOS REALES por defecto. La demostración requiere selección explícita.
- La sesión utiliza la misma cuenta, mismo proyecto Supabase y espacio de almacenamiento.
- Recordar correo, integración con el gestor de contraseñas del navegador y recuperación.
- Se conservan recuperar.html, recuperar.js y complaints.html de producción.
- El enlace de una notificación con ?lead= abre la solicitud en la V2.
- Ver solicitud muestra notas originales e interacciones y tareas ya vinculadas, sin modificar registros.
- La navegación conserva la sección al recargar y limpia detalles privados al cerrar sesión.
- Identificador visible de versión: V2 · 18 SEP 2026.

Los archivos auth-access.js y workspace-navigation.js quedan conservados como compatibilidad
histórica, pero NO se cargan simultáneamente con app.js de V2.

## Verificación

La integración generada pasó 70 pruebas Node y 49 comprobaciones de navegador Chromium.
Las comprobaciones de navegador usan datos ficticios y dobles de Supabase Auth/API:
no prueban un inicio de sesión real ni envían correos, mensajes o escrituras a producción.

La CI de la versión final repite esas pruebas. Tras fusionar en main, otro trabajo verifica
el hash SHA-256 de 16 archivos publicados, la pantalla real sin sesión y la navegación
con datos aislados sobre los archivos servidos por el dominio de producción.
No considerar publicada una versión hasta que esa comprobación concluya correctamente.

Se verificó en transacciones SQL de solo lectura que la cuenta administradora puede
consultar sus registros y que una identidad no vinculada no obtiene filas.
La solicitud real del colegio permanece en la misma base y no se transforma en venta.

## Reparación mínima de permisos

La consola existente de reclamaciones fallaba por falta de GRANT SELECT aunque tenía
políticas RLS de administrador. Se aplicó `restore_complaints_admin_select_for_crm_v2`:
SELECT para authenticated detrás de las políticas ADMIN existentes, sin permisos de
escritura ni acceso anónimo. Ver database/restore-complaints-admin-select-v2.sql.
No se alteraron contraseñas, cuentas, casos, contactos, oportunidades ni mensajes.

## Límites y pendientes no ocultados

- El servidor Supabase Auth tenía una URL predeterminada de recuperación hacia un preview.
  La V2 solicita retorno al dominio operativo; se conserva recuperación alternativa.
  La lista de redirecciones del servidor requiere una revisión administrativa aparte.
- El modo vendedor limita vistas y registros en interfaz; las políticas existentes de varios
  módulos son por organización. No afirmar aislamiento estricto API entre vendedores.
- La integración no vincula automáticamente contactos o instituciones pendientes ni marca
  solicitudes como respondidas. Tampoco activa envíos comerciales nuevos.
- Una sesión guardada no sustituye un gestor de contraseñas. Ninguna contraseña se guarda en
  texto plano en la aplicación ni en este repositorio.

## Continuidad y reversión

Conservar la rama V2 y la historia de main. No borrarlas para resolver diferencias visuales.
Para futuras mejoras, partir de main y usar PR con pruebas; no publicar nuevamente la
interfaz básica aislada. El commit previo a la consolidación está documentado arriba.
Una reversión debe restaurar explícitamente la aplicación revisada, sin modificar datos;
no ejecutar migraciones inversas ni restauraciones de base automáticamente.
