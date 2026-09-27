# v2.47.1 — Resiliencia del Xicronix Assistant

Fecha: 27/09/2026 · America/Lima.

## Objetivo

Endurecer A009 sin cambiar el comportamiento comercial ni crear infraestructura paralela.

## Cambios

- El transporte del proveedor de IA queda aislado en `assistant-provider.mjs`.
- Groq sigue siendo el proveedor actual, pero la lógica comercial ya no depende directamente de su URL o secreto.
- Si el proveedor no tiene saldo, no está configurado, responde con rate limit, falla, expira o devuelve una selección de evidencia no validable, A009 degrada a una respuesta determinista basada únicamente en evidencia verificada.
- El Modo Oportunidad Activa continúa siendo determinista y no requiere llamada al proveedor para consultas estructuradas.
- Preview deployments ya no dependen del secreto `GROQ_API_KEY` de Production.
- Production conserva la verificación real del proveedor antes de publicar.
- Se conserva autenticación, RLS, Human Gate, ranking determinista, límites de contexto y validación de IDs de evidencia.

## Base arquitectónica

Se incorpora `docs/A009-COMMERCIAL-OS-BASELINE-v1.md` como contrato de evolución de A009.

## Base de datos

Migración aplicada previamente:
`crm_meetings_opportunity_lookup_index_v1`

Índice:
`meetings_org_opportunity_time_idx (organization_id, opportunity_id, start_at)`

No hubo cambios destructivos de esquema.

## Límites

- La protección de contraseñas filtradas de Supabase Auth sigue pendiente de activación desde la configuración Auth.
- El conector Vercel puede conservar diferencias de scope aunque los checks de deployment de GitHub sean correctos.
- Los avisos de índices/RLS del linter se medirán antes de aplicar cambios masivos.
