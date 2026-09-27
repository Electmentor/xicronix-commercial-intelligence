# A009 — Commercial Operating System · Architecture Baseline v1

Fecha: 27/09/2026  
Responsable operativo: A009 · Commercial Intelligence CRM  
Custodia institucional: Core  
Principio: REUTILIZAR → EXTENDER → CONSOLIDAR → CREAR.

## Propósito

Esta línea base evita rehacer A009 cada vez que se agregue una función, proveedor o interfaz. Define invariantes que deben sobrevivir cambios de UI, modelos de IA, proveedores externos, número de usuarios y crecimiento comercial.

## Invariantes

1. **A009 es la fuente de verdad comercial.** Web, correo, Radar, Assistant y futuras integraciones alimentan o consultan A009; no crean CRMs paralelos.
2. **Hechos, inferencias y recomendaciones permanecen separados.** Scores, probabilidades manuales e inferencias de IA no se convierten entre sí.
3. **La IA no posee los hechos.** Flujo obligatorio: A009 → contexto verificado → reglas → modelo → validación → Human Gate → acción.
4. **Human Gate es una restricción, no un puntaje.** Envíos, compromisos, cambios materiales de etapa, cierre y condiciones comerciales requieren control explícito.
5. **Las escrituras deben ser trazables.** Preferir registros de actividad, estados y versiones existentes antes de crear un log paralelo.
6. **Integraciones reintentables deben ser idempotentes.** Usar claves estables, restricciones UNIQUE o ledger persistente antes de añadir procesamiento repetido.
7. **Procesamiento incremental por defecto.** No reprocesar bases completas si existe una unidad estable de cambio o deduplicación.
8. **Multiusuario y multitenancy se conservan desde el diseño.** organization_id, RLS, workspace y ownership siguen siendo límites de seguridad.
9. **Documentos comerciales son versionados.** Nunca sustituir silenciosamente propuestas/contratos cuando ya existe document_versions.
10. **IA debe degradar con seguridad.** Si el proveedor falla, A009 y sus reglas deterministas siguen siendo la capa operativa.
11. **Proveedores externos son adaptadores.** La lógica comercial no debe depender de URLs, modelos o secretos específicos de un proveedor.
12. **No borrar historia comercial para “limpiar”.** Preferir cerrado, reemplazado, descartado, fusionado o archivado salvo obligación legal.

## Capacidades ya existentes — NO REIMPLEMENTAR

- Organizaciones, perfiles, RLS y ámbitos de usuario.
- Instituciones, contactos, leads, oportunidades, tareas, reuniones y actividades.
- Varias oportunidades por institución/lead.
- Radar con dedupe_key, evidencia y ciclo de vida.
- Idempotencia de correo por (organization_id, provider, provider_message_id).
- Ledger idempotente de push por (signal_id, subscription_id).
- Documentos + document_versions con estados DRAFT/CURRENT/SENT/SIGNED/REPLACED.
- Modo Oportunidad Activa del Assistant.
- Política de evidencia y ranking determinista.
- Human Gate de lectura/preparación/escritura.
- Métricas de uso/latencia del Assistant en logs.
- Groq como proveedor actual, sin ser fuente de verdad.

## Mapa de capas

### 1. Datos
Postgres/Supabase + RLS. Contiene hechos, estados, relaciones, documentos y evidencia.

### 2. Reglas
Scoring, ranking, lifecycle, scopes, ownership, validaciones y Human Gate.

### 3. Inteligencia
Assistant y futuros modelos. Seleccionan/razonan sobre evidencia acotada; no escriben hechos directamente.

### 4. Acciones
Editores y servicios existentes para registrar tareas, actividades, contactos, oportunidades y cambios autorizados.

### 5. Gobernanza
RLS, roles, Human Gate, trazabilidad, versionado, límites de provider y no exposición de secretos.

### 6. Aprendizaje
EVENTO → EVIDENCIA → INTERPRETACIÓN → HIPÓTESIS → VALIDACIÓN → APRENDIZAJE → CONOCIMIENTO → REUTILIZACIÓN.

## Situaciones que la arquitectura debe soportar sin rediseño

- Varias sedes de una institución.
- Varias oportunidades simultáneas con una misma institución o lead.
- Varios contactos, influenciadores, decisores y aprobadores.
- Oportunidad pausada, perdida, reabierta o parcialmente ganada.
- Venta larga, urgente, licitación, comité de compra o compra por fases.
- Propuesta reemplazada por nueva versión.
- Cambio de responsable comercial.
- Usuario adicional con permisos distintos.
- Duplicados de webhook, reintentos y entregas fuera de orden.
- Proveedor IA caído, sin saldo o rate-limited.
- Datos contradictorios entre Radar y conversación humana.
- Contexto incompleto: sin decisor, sin presupuesto, sin fecha o sin siguiente acción.
- Dos ediciones cercanas del mismo registro.
- Migración futura de Groq a otro proveedor sin cambiar reglas comerciales.

## Política de evolución

Antes de crear tabla, endpoint, agente, worker o servicio nuevo:
1. ¿Existe ya una capacidad equivalente?
2. ¿Puede extenderse sin romper contratos?
3. ¿Puede consolidarse con otra capacidad?
4. Solo entonces crear.

Cambios con pérdida potencial, fusiones irreversibles, eliminación de datos, cambios materiales de esquema o permisos elevan Human Gate.

## Hallazgos de auditoría 27/09/2026

### Confirmado y maduro
- Multitenancy/RLS activo en tablas públicas principales.
- Multi-oportunidad y relaciones por institution_id / lead_id / contact_id.
- Versionado documental ya implementado.
- Deduplicación persistente ya implementada en Radar, correo y push.
- Modo Oportunidad Activa usa contexto verificado y no confía en datos forjados del cliente.
- Assistant separa el plan del modelo de la representación final y valida IDs de evidencia.
- Cambios materiales de etapa vinculados a actividades requieren advertencia explícita.

### Brechas reales
- Transporte del proveedor IA estaba acoplado a Groq dentro del endpoint; se está aislando en un adaptador.
- Observabilidad del Assistant depende de logs de runtime; no crear tabla propia hasta justificar retención/analítica persistente.
- Supabase reporta protección de contraseñas filtradas desactivada; requiere ajuste de configuración Auth.
- Existen FKs sin índice y políticas RLS con advertencias de rendimiento. No crear índices masivamente: medir consultas reales antes.
- El conector de Vercel usado desde ChatGPT no enumera el proyecto aunque los checks de GitHub/Vercel sí resultan exitosos; mantener como deuda operacional de integración.
- No existe un ledger universal de aprobaciones. No inventarlo hasta que aparezca una necesidad transversal repetida; usar Human Gates específicos actuales.

## Decisiones de no-creación

No crear por ahora:
- otro CRM;
- un agente nuevo para cada función;
- tabla genérica de auditoría duplicando activities/evidence/document_versions;
- tabla de observabilidad del Assistant sin necesidad de retención;
- índices para los 37 avisos solo por el linter;
- memoria de IA paralela a A009;
- nueva tabla para documentos o propuestas;
- una segunda lógica de ranking fuera del backend.

## Próximo criterio de madurez

A009 puede considerarse “Commercial Operating System” cuando una oportunidad real complete:

OPORTUNIDAD → CONTEXTO → ANÁLISIS → SIGUIENTE ACCIÓN → PREPARACIÓN → INTERACCIÓN → REGISTRO → NUEVO ESTADO

con evidencia verificable, trazabilidad, permisos correctos y degradación segura si el proveedor IA falla.
