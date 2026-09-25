const TERMINAL = new Set(['WON','LOST','CONVERTED','DISQUALIFIED','COMPLETED','CANCELLED']);

export function normalize(value='') {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}

export function classifyRelationship({subject='', body='', knownRelationship=''}={}) {
  const known = normalize(knownRelationship);
  if (['supplier','provider','vendor','ally','partner','proveedor','aliado','fabricante','distribuidor'].includes(known)) {
    return 'SUPPLIER_ALLY';
  }
  const text = normalize(subject + ' ' + body);
  if (/(proveedor|supplier|vendor|fabricante|distribuidor|representacion|autorizacion de uso de marca|cidepe)/.test(text)) {
    return 'SUPPLIER_ALLY';
  }
  if (/(factura|pago|cobranza|nota de credito|comprobante)/.test(text)) {
    return 'ADMIN';
  }
  if (/(cotizacion|diagnostico|propuesta|presupuesto|compra|equipamiento|laboratorio|steam|robotica)/.test(text)) {
    return 'COMMERCIAL';
  }
  return 'UNCLASSIFIED';
}

export function resolveIntake({incoming, contacts=[], leads=[]}) {
  const relationship = classifyRelationship(incoming);
  const email = normalize(incoming?.email);
  const contact = contacts.find(row => normalize(row?.email) === email) || null;
  const openLead = contact
    ? [...leads]
        .filter(row => row?.contact_id === contact.id && !TERMINAL.has(String(row?.status || '').toUpperCase()))
        .sort((a,b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))[0] || null
    : null;

  if (relationship === 'SUPPLIER_ALLY') {
    return {relationship, action:'ROUTE_NON_PIPELINE', contact_id:contact?.id ?? null, lead_id:null};
  }
  if (relationship === 'ADMIN') {
    return {relationship, action:'ROUTE_ADMIN', contact_id:contact?.id ?? null, lead_id:null};
  }
  if (relationship === 'UNCLASSIFIED') {
    return {relationship, action:'REVIEW_BEFORE_PIPELINE', contact_id:contact?.id ?? null, lead_id:openLead?.id ?? null};
  }
  if (openLead) {
    return {relationship, action:'RECONCILE_EXISTING_LEAD', contact_id:contact.id, lead_id:openLead.id};
  }
  if (contact) {
    return {relationship, action:'REUSE_CONTACT_CREATE_LEAD', contact_id:contact.id, lead_id:null};
  }
  return {relationship, action:'CREATE_CONTACT_AND_LEAD', contact_id:null, lead_id:null};
}

export function intakeTaskKey({source='unknown', externalId=''}) {
  const stableSource = normalize(source).replace(/[^a-z0-9]+/g,'-') || 'unknown';
  const stableId = String(externalId || '').trim();
  if (!stableId) throw new Error('externalId required');
  return `cx:intake:${stableSource}:${stableId}`;
}
