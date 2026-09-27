# v2.46.5 — Ciclo explícito de atención de Radar

Base real verificada el 27/09/2026: main b3126a3fca893333fd5316fbee5826d8d48ad044, frontend v2.46.4. Vercel web autenticado confirmó deployment dpl_DdKtfSCru8mNDp5cFuXz9zF7MTVH, Ready / Production / Current, dominio oficial asignado. El conector Vercel no ve este proyecto aunque el panel web sí; se verificó el panel, no se asumió el scope.

## Implementación

Se conserva el saludo v2.46.4 y su diseño. Radar reutiliza workflow_status y updated_at; añade IN_REVIEW y RESOLVED al conjunto existente y conserva DISCARDED. Los estados automáticos anteriores se presentan como Pendiente, porque RESEARCHING puede ser asignado por el clasificador sin intervención humana.

Revisar es explícito; abrir una señal no cambia su estado. Resolver y Descartar exigen motivo. RPC autenticada SECURITY INVOKER con RLS, pertenencia a organización, roles ADMIN/MANAGER/SALES y control de concurrencia por estado/fecha. Cada transición inserta en commercial_radar_evidence un evento WORKFLOW_TRANSITION con actor, origen, destino, fecha y motivo. No se crean tablas ni columnas. Un trigger impide que el enriquecimiento reabra señales cerradas. Solo la tarea automática vinculada mediante crm:radar:<id> se completa/cancela al cerrar la señal; no se alteran otras tareas.

El saludo excluye RESOLVED/DISCARDED. IN_REVIEW exige actionable=true; una pendiente con mayor score la precede, y a igual score se prefiere pendiente. Tras confirmar una transición, se recalcula inmediatamente; cambios de otra sesión llegan por el ciclo existente de 45 segundos cuando la aplicación está visible. No se añaden temporizadores.

Migraciones aplicadas al proyecto CRM qzfprdhmcaucqcdqgqiz:
- crm_radar_lifecycle_v1
- crm_radar_lifecycle_evidence_source
- crm_radar_lifecycle_close_linked_task

El archivo database/crm-radar-lifecycle-v1.sql consolida el resultado. No ejecutarlo nuevamente sobre una base ya migrada. La reversión puede retirar UI/RPC/trigger, conservando estados e historial; no remapear registros cerrados. Core y los demás backends no fueron modificados.

## Validación

- 43/43 pruebas Node: Radar, prioridades, dirección, analítica y rendimiento. Sintaxis app.js y diff limpios.
- tests/radar-lifecycle.sql ejecutado en CRM real como authenticated dentro de BEGIN/ROLLBACK: revisión, resolución, descarte, auditoría, rechazo de versión obsoleta, motivo obligatorio, cierre de tarea exacta, bloqueo de reapertura y denegación a anon. Sin cierres de negocio persistidos para probar.
- Navegador aislado: crítica Aurora → Revisar ahora abre registro y sigue Pendiente → En revisión con fecha → Resuelta con motivo → crítica Horizonte asciende sin recargar → Descartada → oportunidad Analítica e IA asciende.
- Interfaz aislada con doble RPC: revisión, resolución, historial y Actualizar datos; la señal continúa Resuelta.
- Escritorio 1280, pantalla externa simulada 1920x1080 y móvil390x844. Claro/oscuro. Diálogo móvil visible sin desbordamiento global. Un saludo. Rendimiento y Cómo se calcula funcionales.
- Evidencia local en ../performance-review/radar-2465-*.png.
- No se abordaron los 35 fallos preexistentes de la suite general.

## Límites y problemas observados

La pestaña del CRM real disponible para esta conversación sigue mostrando Ingresar pese al aviso de sesión iniciada. El deployment y backend sí se verificaron; el recorrido autenticado con la cuenta real del fundador permanece pendiente. No se reemplaza esta comprobación por las pruebas aisladas.

La primera prueba transaccional detectó source_url obligatorio en la tabla de evidencia; se corrigió la RPC y se repitieron exitosamente las pruebas antes de publicar frontend. La recarga completa del modo demostración reconstruyó sus datos; no se usa como evidencia de persistencia real. La lectura de estado tras actualizar y el test SQL prueban el cierre persistido dentro de sus respectivos entornos. No se amplió el alcance para modificar el sistema de demostración.

Documentación consultada: https://supabase.com/docs/guides/database/postgres/row-level-security
