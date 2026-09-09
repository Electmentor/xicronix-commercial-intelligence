# Xicronix · Inteligencia comercial

Aplicación estática conectada al proyecto Supabase existente. No requiere compilación.

## Cambios V2

- Identidad Xicronix y navegación adaptable a móvil, con cierre de sesión accesible.
- Ingreso, registro y recuperación de contraseña con mensajes en español.
- Instituciones, contactos, prospectos, oportunidades y tareas: consulta, creación y edición.
- Búsqueda con acentos, filtros, paginación visual y exportación CSV protegida contra fórmulas.
- Cartera abierta, estimación ponderada y agenda calculadas a partir de registros recuperados.
- Errores visibles por módulo; un fallo no se presenta como un cero real.
- Lectura paginada de Supabase, limpieza de datos al salir y protección contra respuestas tardías de otra sesión.
- Edición con comparación de `updated_at` para detectar cambios concurrentes desde esta versión.
- Sin datos ficticios, envío automático de mensajes ni supuesta IA. Las calificaciones son manuales.

## Estructura

`index.html`: estructura accesible. `styles.css`: presentación. `app.js`: formularios, acceso y operaciones. `domain.mjs`: búsqueda, métricas, agenda y CSV. `tests/domain.test.mjs`: regresiones.

## Verificación local

```sh
node --check app.js
node --test tests/domain.test.mjs
git diff --check
```

Servir los archivos por HTTP para usar módulos ES; no abrir mediante `file://`.

## Activación

1. Revisar y aplicar `database/access-hardening.sql` mediante una conexión administrativa. Es una propuesta transaccional e idempotente, no una migración aplicada. Las políticas originales permitían INSERT/UPDATE a VIEWER. Las nuevas políticas restrictivas se combinan con el aislamiento por organización existente.
2. En Supabase Auth, verificar Site URL y Redirect URLs para el dominio de producción. Agregar explícitamente el dominio de preview si se prueba recuperación allí. No se modificó la configuración de correo ni se enviaron mensajes durante esta revisión.
3. Probar con cuentas de ensayo los flujos de acceso, recuperación, creación y edición para ADMIN, SALES y VIEWER. Probar rechazo entre organizaciones. No usar la contraseña del propietario ni crear cuentas privilegiadas automáticamente.
4. Integrar la rama en `main` para que el proyecto Vercel conectado publique la versión. La vinculación Vercel de este repositorio no pudo confirmarse desde el conector disponible; revisar el deployment antes de dar la versión por publicada.

## Límites

El registro no concede acceso a la organización: se conserva la asignación administrativa de perfiles. La interfaz oculta escritura a VIEWER; la protección efectiva del servidor exige aplicar el SQL incluido. Las relaciones nuevas se validan en la interfaz y con las políticas propuestas. Las lecturas recogen todos los registros en lotes de 500; para grandes volúmenes se deberá trasladar búsqueda y agregaciones al servidor. El rango de `created_at` puede variar si entran registros durante la lectura. La dependencia CDN existente `@supabase/supabase-js@2` se conserva; conviene fijarla y empaquetarla en una siguiente fase de dependencias. No se implementan todavía conversión atómica de prospectos, automatización, historial de actividades ni cálculo de IA.

Documentación consultada: [recuperación](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [eventos de autenticación](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
