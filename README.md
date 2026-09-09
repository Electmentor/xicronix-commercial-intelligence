# Xicronix · Inteligencia comercial

Aplicación estática conectada al proyecto Supabase existente. No requiere compilación.

## Cambios V2

- Identidad Xicronix y navegación adaptable a móvil, con cierre de sesión accesible.
- Ingreso, registro y recuperación de contraseña con mensajes en español.
- Instituciones, contactos, prospectos, oportunidades y tareas: consulta, creación y edición.
- Administración de perfiles de usuarios por parte de ADMIN, limitada a la organización.
- Búsqueda con acentos, filtros, paginación visual, importación validada y exportación CSV protegida contra fórmulas.
- Resumen comercial con KPI de leads, pipeline, forecast ponderado, prioridades, pipeline por etapa, próximas tareas y alertas calculados desde los registros.
- Registro de interacciones desde el primer contacto, con canal, resultado, necesidad, horizonte de decisión, señal de presupuesto y próxima acción.
- Barra de potencial por lead y recomendación contextual individual, calculadas con un motor explicable y actualizadas al cambiar el lead o registrar una interacción.
- Errores visibles por módulo; un fallo no se presenta como un cero real.
- Lectura paginada de Supabase, limpieza de datos al salir y protección contra respuestas tardías de otra sesión.
- Edición con comparación de `updated_at` para detectar cambios concurrentes desde esta versión.
- Eliminación controlada exclusivamente para ADMIN, con confirmación y aislamiento por organización.
- Sin automatización, envío automático de mensajes ni supuesta IA. Las calificaciones son manuales. El entorno de demostración contiene 10 casos marcados `[SIMULADO]` para validar el flujo.

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

1. Aplicadas en Supabase las migraciones `commercial_access_hardening_v2`, `admin_profile_management`, `commercial_query_indexes_v1`, `secure_admin_helper_private_v1`, `performance_policy_cleanup_v1` y `lead_interaction_scoring_v1` mediante una conexión administrativa. El helper de administración y el motor de puntuación viven en el esquema privado, fuera de la API pública; las políticas restrictivas se combinan con el aislamiento por organización existente, las eliminaciones siguen limitadas a ADMIN y solo ADMIN puede consultar o actualizar perfiles de su organización.
2. En Supabase Auth, verificar Site URL y Redirect URLs para el dominio de producción. Agregar explícitamente `https://xicronix-commercial-intelligence-git-improvemen-2952f5-xicronix.vercel.app/` para recuperación en Preview. La aplicación evita generar enlaces `localhost` cuando se usa una copia local; el límite de correo gratuito puede requerir esperar entre intentos.
3. Probar con cuentas de ensayo los flujos de acceso, recuperación, creación, edición, importación y eliminación para ADMIN, SALES y VIEWER. Probar rechazo entre organizaciones. No usar la contraseña del propietario ni crear cuentas privilegiadas automáticamente.
4. Integrar la rama en `main` para que el proyecto Vercel conectado publique la versión. La vinculación Vercel de este repositorio no pudo confirmarse desde el conector disponible; revisar el deployment antes de dar la versión por publicada.

## Límites

El registro no concede acceso a la organización: se conserva la asignación administrativa de perfiles. La pantalla de Usuarios permite a ADMIN actualizar nombre y rol dentro de su organización; no crea cuentas ni expone correos de Auth. La interfaz oculta escritura a VIEWER; la protección efectiva del servidor exige aplicar el SQL incluido. Las relaciones nuevas se validan en la interfaz y con las políticas propuestas. Las lecturas recogen todos los registros en lotes de 500; para grandes volúmenes se deberá trasladar búsqueda y agregaciones al servidor. El rango de `created_at` puede variar si entran registros durante la lectura. La dependencia CDN existente `@supabase/supabase-js@2` se conserva; conviene fijarla y empaquetarla en una siguiente fase de dependencias. La primera capa de inteligencia usa reglas explicables v1, sin enviar datos a un proveedor externo; una IA generativa opcional deberá incorporarse después con consentimiento, minimización de datos y control de costos.

Documentación consultada: [recuperación](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [eventos de autenticación](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
