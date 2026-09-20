-- Synthetic Prospect Intelligence fixtures for CRM DEV.
-- DEV ONLY. Never copy these rows to production.

with dev_org as (
  select id from public.organizations where slug='xicronix-commercial-intelligence-dev' limit 1
)
insert into public.pi_cases(
  id,organization_id,state,organization_name,organization_type,organization_website,
  organization_city,organization_country,sector,hypothesis,dimensions,next_action,transfer_reason,analysis_version
)
select * from (
  select
    '40000000-0000-0000-0000-000000000001'::uuid,o.id,'PRIORITIZED',
    '[SIMULADO] Colegio Monteluz','SCHOOL','https://monteluz.example',
    'Lima','Peru','Educación escolar',
    'La institución podría requerir modernización de laboratorios STEM y acompañamiento para integrar tecnología educativa.',
    '{"F":5,"N":4,"C":3,"T":4,"A":3,"E":4}'::jsonb,
    'Identificar responsable de infraestructura y validar horizonte de inversión.',
    'Fit alto, necesidad plausible y evidencia independiente.','pi-rules-v0.1'
  from dev_org o
  union all
  select
    '40000000-0000-0000-0000-000000000002'::uuid,o.id,'RESEARCHING',
    '[SIMULADO] Clínica Horizonte Sur','CLINIC','https://horizontesur.example',
    'Arequipa','Peru','Salud',
    'La expansión anunciada podría abrir una necesidad de capacitación técnica y equipamiento de formación.',
    '{"F":3,"N":3,"C":4,"T":4,"A":2,"E":2}'::jsonb,
    'Buscar proyecto de implementación y responsables de la nueva sede.',
    'Señal temprana; requiere más evidencia.','pi-rules-v0.1'
  from dev_org o
  union all
  select
    '40000000-0000-0000-0000-000000000003'::uuid,o.id,'QUALIFIED',
    '[SIMULADO] Instituto Horizonte','INSTITUTE','https://institutohorizonte.example',
    'Lima','Peru','Educación técnica',
    'Hay señales de renovación de ambientes técnicos que pueden convertirse en iniciativa comercial.',
    '{"F":4,"N":4,"C":3,"T":3,"A":4,"E":4}'::jsonb,
    'Validar alcance técnico y decisor.',
    'Necesidad y acceso plausibles.','pi-rules-v0.1'
  from dev_org o
  union all
  select
    '40000000-0000-0000-0000-000000000004'::uuid,o.id,'MONITORING',
    '[SIMULADO] Centro Educativo Nova','SCHOOL','https://nova.example',
    'Trujillo','Peru','Educación escolar',
    'Podría existir interés futuro en tecnología educativa, pero la señal actual no justifica activación comercial.',
    '{"F":4,"N":2,"C":2,"T":1,"A":2,"E":2}'::jsonb,
    'Mantener monitoreo trimestral.',
    'Señal insuficiente para priorización.','pi-rules-v0.1'
  from dev_org o
) seed(
  id,organization_id,state,organization_name,organization_type,organization_website,
  organization_city,organization_country,sector,hypothesis,dimensions,next_action,transfer_reason,analysis_version
)
on conflict(id) do nothing;

with dev_org as (
  select id from public.organizations where slug='xicronix-commercial-intelligence-dev' limit 1
)
insert into public.pi_signals(id,organization_id,case_id,label,source,source_url,is_new)
select * from (
  select '41000000-0000-0000-0000-000000000001'::uuid,o.id,'40000000-0000-0000-0000-000000000001'::uuid,'Plan institucional de modernización publicado','Sitio institucional','https://monteluz.example/plan',true from dev_org o
  union all
  select '41000000-0000-0000-0000-000000000002'::uuid,o.id,'40000000-0000-0000-0000-000000000001'::uuid,'Convocatoria de perfil de innovación educativa','Convocatoria pública','https://monteluz.example/convocatoria',false from dev_org o
  union all
  select '41000000-0000-0000-0000-000000000003'::uuid,o.id,'40000000-0000-0000-0000-000000000002'::uuid,'Anuncio de nueva sede','Comunicado corporativo','https://horizontesur.example/sede',true from dev_org o
  union all
  select '41000000-0000-0000-0000-000000000004'::uuid,o.id,'40000000-0000-0000-0000-000000000003'::uuid,'Renovación de talleres técnicos','Portal institucional','https://institutohorizonte.example/talleres',true from dev_org o
  union all
  select '41000000-0000-0000-0000-000000000005'::uuid,o.id,'40000000-0000-0000-0000-000000000004'::uuid,'Actualización menor de infraestructura','Comunicado institucional','https://nova.example/infraestructura',false from dev_org o
) s(id,organization_id,case_id,label,source,source_url,is_new)
on conflict(id) do nothing;

with dev_org as (
  select id from public.organizations where slug='xicronix-commercial-intelligence-dev' limit 1
)
insert into public.pi_evidence(id,organization_id,case_id,evidence_type,source,source_url,note,critical)
select * from (
  select '42000000-0000-0000-0000-000000000001'::uuid,o.id,'40000000-0000-0000-0000-000000000001'::uuid,'FACT','Sitio institucional','https://monteluz.example/plan','Plan institucional con eje de modernización.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000002'::uuid,o.id,'40000000-0000-0000-0000-000000000001'::uuid,'CONFIRMATION','Convocatoria pública','https://monteluz.example/convocatoria','Búsqueda de capacidades de innovación.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000003'::uuid,o.id,'40000000-0000-0000-0000-000000000001'::uuid,'INFERENCE','Análisis PI','https://xicronix.example/dev/pi','Existe alineación con capacidades Xicronix.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000004'::uuid,o.id,'40000000-0000-0000-0000-000000000002'::uuid,'FACT','Comunicado corporativo','https://horizontesur.example/sede','Nueva sede anunciada.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000005'::uuid,o.id,'40000000-0000-0000-0000-000000000002'::uuid,'MISSING_DATA','Análisis PI','https://xicronix.example/dev/pi','No hay evidencia todavía sobre equipamiento educativo.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000006'::uuid,o.id,'40000000-0000-0000-0000-000000000003'::uuid,'FACT','Portal institucional','https://institutohorizonte.example/talleres','Proyecto de renovación publicado.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000007'::uuid,o.id,'40000000-0000-0000-0000-000000000003'::uuid,'CONFIRMATION','Boletín institucional','https://institutohorizonte.example/boletin','Fase de evaluación de proveedores.',false from dev_org o
  union all
  select '42000000-0000-0000-0000-000000000008'::uuid,o.id,'40000000-0000-0000-0000-000000000004'::uuid,'FACT','Comunicado institucional','https://nova.example/infraestructura','Mejora menor sin proyecto STEM explícito.',false from dev_org o
) e(id,organization_id,case_id,evidence_type,source,source_url,note,critical)
on conflict(id) do nothing;
