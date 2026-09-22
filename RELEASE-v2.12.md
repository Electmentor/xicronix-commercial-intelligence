# Xicronix Commercial Intelligence v2.12 — Alertas críticas móviles

Fecha: 2026-09-22

- Añade suscripción Web Push desde Xicronix Ahora.
- Registra el dispositivo autenticado en commercial_push_subscriptions.
- El service worker recibe alertas y abre el Radar al tocarlas.
- Backend Edge Function radar-critical-push implementado.
- Trigger de base de datos solicita envío solo cuando una señal entra en CRITICAL.
- Delivery ledger evita envíos duplicados por señal + dispositivo.

Pendiente para activar el envío real:
- Configurar el secreto VAPID_PRIVATE_KEY en Supabase Edge Function Secrets.
