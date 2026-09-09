# Xicronix · Inteligencia comercial

## Selector de experiencia comercial

- El selector «Modo administrador / Modo vendedor» aparece bajo la cabecera. Solo una cuenta ADMIN puede alternar entre ambos.
- Modo administrador: resumen ejecutivo, cartera de la organización, metas, responsables y gestión del equipo.
- Modo vendedor: cartera propia, potencial, interacciones, oportunidades y tareas. No muestra metas generales, usuarios, costos administrativos ni eliminación de registros.
- La selección se recuerda por cuenta y organización en este navegador. Es independiente del modo nocturno. No modifica el rol real ni suplanta a otro vendedor.
- Un formulario abierto debe guardarse o cancelarse antes de cambiar de experiencia. Los datos anteriores se limpian y vuelven a cargar al alternar.
- Se corrigió la correspondencia de módulos con tablas: Usuarios usa `profiles`; Metas usa `commercial_goals`. Los campos de responsable y costo se reservan a la experiencia administrativa.

### Alcance de permisos y verificación

El selector es una separación de experiencia, no una nueva frontera de seguridad del servidor. Se mantienen las políticas RLS existentes por rol y organización. La cartera propia se filtra por responsable (o creador cuando no hay responsable); las políticas actuales de lectura de tablas comerciales pueden permitir datos de toda la organización. Un aislamiento estricto por vendedor en la API requiere una revisión separada de esas políticas.

Pruebas sin servicios externos: `node --test tests/domain.test.mjs tests/workspace.test.mjs tests/app-workspace.test.mjs`. Cubren ambas experiencias, restricciones de rol, preferencias, formularios, guardado, tablas de destino, errores de carga y cierre de sesión durante una solicitud. Las pruebas de interfaz usan dobles de DOM y Data API; no sustituyen una revisión visual en navegador ni una prueba con cuentas reales.

Este cambio no modifica la política ni el cálculo referencial de bonos, y no autoriza pagos.

Aplicación estática conectada al proyecto Supabase existente. No requiere compilación.

## Cambios V2

- Identidad Xicronix y navegación adaptable a móvil, con cierre de sesión accesible.
- Ingreso, registro y recuperación de contraseña con mensajes en español.
- Instituciones, contactos, prospectos, oportunidades y tareas: consulta, creación y edición.
- Administración de perfiles de usuarios por parte de ADMIN, limitada a la organización.
- Búsqueda con acentos, filtros, paginación visual, importación validada y exportación CSV protegida contra fórmulas.
- Resumen comercial con KPI de leads, pipeline, forecast ponderado, prioridades, pipeline por etapa, próximas tareas y alertas calculados desde los registros.
- Modo nocturno persistente por navegador, con botón accesible de cambio de contraste para trabajar con menor fatiga visual.
- Resumen general restringido a ADMIN; el administrador dispone de un panel de seguimiento del equipo con leads, oportunidades, tareas, potencial promedio y vencimientos. Es una vista de control, no un cálculo de bonos.
- Dos visiones operativas: colaboradores/vendedores trabajan sus leads asignados, interacciones y próximas acciones; ADMIN visualiza resultados de alto nivel, prioridades, metas, margen estimado y ranking del equipo.
- La propuesta aprobada de bonos se refleja como evaluación referencial y auditable: desempeño ponderado, base de margen conocido, tasa por nivel y monto pendiente de cierre; nunca como orden de pago.
- Registro de interacciones desde el primer contacto, con canal, resultado, necesidad, horizonte de decisión, señal de presupuesto y próxima acción.
- Barra de potencial por lead y recomendación contextual individual, calculadas con un motor explicable y actualizadas al cambiar el lead o registrar una interacción, incluyendo la próxima acción capturada en el contacto.
- Errores visibles por módulo; un fallo no se presenta como un cero real.
- Lectura paginada de Supabase, limpieza de datos al salir y protección contra respuestas tardías de otra sesión.
- Edición con comparación de `updated_at` para detectar cambios concurrentes desde esta versión.
- Eliminación controlada exclusivamente para ADMIN, con confirmación y aislamiento por organización.
- Sin automatización, envío automático de mensajes ni supuesta IA. Las calificaciones son manuales. El entorno de demostración contiene 10 casos marcados `[SIMULADO]` para validar el flujo. La política de bonos comerciales v1.0 queda aprobada para implementación inicial bajo revisión administrativa. La aplicación calcula únicamente una referencia no pagable con oportunidades ganadas que tengan costo estimado; la liquidación requiere cierre, cobro, validación contractual y autorización.

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

1. Aplicadas en Supabase las migraciones `commercial_access_hardening_v2`, `admin_profile_management`, `commercial_query_indexes_v1`, `secure_admin_helper_private_v1`, `performance_policy_cleanup_v1`, `lead_interaction_scoring_v1`, `lead_interaction_scoring_v2` y `commercial_management_views_v1` mediante una conexión administrativa. El helper de administración y el motor de puntuación viven en el esquema privado, fuera de la API pública; las políticas restrictivas se combinan con el aislamiento por organización existente, las eliminaciones siguen limitadas a ADMIN y solo ADMIN puede consultar o actualizar perfiles de su organización.
2. En Supabase Auth, verificar Site URL y Redirect URLs para el dominio de producción. Agregar explícitamente `https://xicronix-commercial-intelligence-git-improvemen-2952f5-xicronix.vercel.app/` para recuperación en Preview. La aplicación evita generar enlaces `localhost` cuando se usa una copia local; el límite de correo gratuito puede requerir esperar entre intentos.
3. Probar con cuentas de ensayo los flujos de acceso, recuperación, creación, edición, importación y eliminación para ADMIN, SALES y VIEWER. Probar rechazo entre organizaciones. No usar la contraseña del propietario ni crear cuentas privilegiadas automáticamente.
4. Integrar la rama en `main` para que el proyecto Vercel conectado publique la versión. La vinculación Vercel de este repositorio no pudo confirmarse desde el conector disponible; revisar el deployment antes de dar la versión por publicada.

## Límites

El registro no concede acceso a la organización: se conserva la asignación administrativa de perfiles. La pantalla de Usuarios permite a ADMIN actualizar nombre y rol dentro de su organización; no crea cuentas ni expone correos de Auth. La interfaz oculta escritura a VIEWER; la protección efectiva del servidor exige aplicar el SQL incluido. Las relaciones nuevas se validan en la interfaz y con las políticas propuestas. Las lecturas recogen todos los registros en lotes de 500; para grandes volúmenes se deberá trasladar búsqueda y agregaciones al servidor. El rango de `created_at` puede variar si entran registros durante la lectura. La dependencia CDN existente `@supabase/supabase-js@2` se conserva; conviene fijarla y empaquetarla en una siguiente fase de dependencias. La primera capa de inteligencia usa reglas explicables v1, sin enviar datos a un proveedor externo; una IA generativa opcional deberá incorporarse después con consentimiento, minimización de datos y control de costos.

Documentación consultada: [recuperación](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [eventos de autenticación](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
