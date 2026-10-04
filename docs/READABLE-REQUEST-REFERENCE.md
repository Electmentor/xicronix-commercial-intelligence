# Referencia pública de solicitudes

Formato XIC-YYYYMMDD-N, fecha de Lima y consecutivo atómico de Postgres. Columna web_leads.public_reference con NOT NULL y UNIQUE. El UUID external_lead_id se conserva internamente para idempotencia. No usar referencia pública para autorizar acceso a datos.

Edge xicronix-web-leads devuelve la referencia tanto en creación como en reintento; el correo, el título del lead y la actividad CRM usan el mismo valor. A007 muestra solo la referencia legible. Solicitudes anteriores fueron vinculadas sin alterar sus UUID ni reenviar correos.
