# Documento histórico — sustituido por PROSPECT-INTELLIGENCE-DEV.md el 21/09/2026

Se conserva el estado anterior; sus bloqueos y restricciones describen el prototipo de esa fecha, no el despliegue actual.

# Prospect Intelligence DEV — Sprint A009

Fecha: 20/09/2026

## Estado

Implementado en la rama `dev`. No se modificó `main` ni Supabase PRODUCCIÓN.

## Qué entrega este sprint

- rama Git `dev` creada desde `main`;
- prototipo funcional y navegable de Prospect Intelligence;
- estados PI separados del pipeline CRM;
- F/N/C/T/A/E canónico;
- cálculo DEV de potencial y confianza, deliberadamente separado de `rules-v1` del CRM;
- gate `READY_FOR_CRM` con 10 controles explícitos;
- resolución de duplicidad Organization / Lead / Opportunity sobre un snapshot;
- contrato PI → CRM `pi-crm-v0.1`;
- payload transferible con provenance y versión;
- datos exclusivamente sintéticos en el prototipo;
- persistencia local mediante localStorage;
- pruebas unitarias puras para dominio PI.

## Restricción crítica

`prospect-intelligence.html` no importa Supabase y no contiene credenciales. Ninguna acción del prototipo escribe en CRM. El botón de transferencia prepara el contrato y lo muestra; no realiza POST/INSERT.

## Siguiente etapa para backend

Crear un Supabase CRM DEV independiente, aplicar migraciones allí y sustituir el snapshot sintético por consultas DEV. No usar `xicronix-core-dev` como sustituto del CRM DEV sin decisión arquitectónica expresa.

## Principio

REUTILIZAR → EXTENDER → COMPONER → CREAR.

Las entidades CRM existentes siguen siendo canónicas para Organization/Institution, Contacts, Leads, Opportunities, Activities, Tasks y Scores. PI no crea un CRM paralelo.

## Revisión

Draft PR #12 abierto contra `main` exclusivamente para revisión y Preview. No fusionar sin Human Gate.


## Backend DEV persistente — bloqueo externo verificado

Se intentó crear `Xicronix Commercial Intelligence DEV` en la organización Supabase actual, región `sa-east-1`.

- costo informado por Supabase: 0 / mes;
- creación rechazada por límite del plan Free: 2 proyectos activos por propietario/administrador;
- proyectos activos actuales: CRM PRODUCCIÓN y `xicronix-core-dev`;
- no se pausó ni modificó ninguno de los dos proyectos.

### Fallback seguro implementado

Mientras el backend persistente está bloqueado, la rama `dev` dispone de:

- bootstrap mínimo reproducible de CRM DEV;
- backend Prospect Intelligence v0.1;
- RLS por rol;
- adapter protegido contra el project ref de PRODUCCIÓN;
- integración PostgreSQL efímera en CI;
- prueba extremo a extremo PI → preparación → ejecución → Lead NEW + Activity + Task;
- prueba VIEWER read-only.

Este fallback valida arquitectura y migraciones, pero **no sustituye** un Supabase CRM DEV persistente para pruebas reales de Auth/Storage/Edge Functions.

