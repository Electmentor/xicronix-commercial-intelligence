export const MILESTONE_META = {
  M1: { percent: 15, label: 'Prospecto calificado' },
  M2: { percent: 30, label: 'Diagnóstico y alcance validados' },
  M3: { percent: 50, label: 'Propuesta presentada' },
  M4: { percent: 70, label: 'Negociación y condiciones validadas' },
  M5: { percent: 85, label: 'Compromiso formal del cliente' },
  M6: { percent: 100, label: 'Venta ganada' },
};

export const MOVEMENT_ACTIONS = {
  REQUEST_REVIEWED: 'Atención · Solicitud revisada',
  RESPONSE_SENT: 'Atención · Respuesta enviada',
  INFORMATION_RECEIVED: 'Atención · Información adicional recibida',
  LEAD_QUALIFIED: 'Calificación · Prospecto calificado',
  MEETING_SCHEDULED: 'Reunión · Reunión agendada',
  MEETING_COMPLETED: 'Reunión · Reunión realizada',
  FIRST_VISIT_COMPLETED: 'Diagnóstico · Primera visita realizada',
  DIAGNOSIS_COMPLETED: 'Diagnóstico · Diagnóstico completado',
  SCOPE_VALIDATED: 'Diagnóstico · Necesidad y alcance validados',
  PROPOSAL_SENT: 'Propuesta · Propuesta inicial enviada',
  PROPOSAL_PRESENTED: 'Propuesta · Propuesta presentada y discutida',
  PROPOSAL_REVISED_SENT: 'Propuesta · Propuesta mejorada enviada',
  NEGOTIATION_STARTED: 'Negociación · Negociación iniciada',
  CONDITIONS_AGREED: 'Negociación · Condiciones comerciales acordadas',
  FORMAL_COMMITMENT: 'Formalización · Compromiso formal recibido',
  PURCHASE_ORDER_RECEIVED: 'Formalización · Orden de compra recibida',
  CONTRACT_SIGNED: 'Formalización · Contrato firmado',
  PAYMENT_REPORTED: 'Pagos · Pago informado por el cliente',
  PAYMENT_CONFIRMED: 'Pagos · Pago verificado',
  IMPLEMENTATION_STARTED: 'Ejecución · Implementación iniciada',
  DELIVERY_COMPLETED: 'Ejecución · Entrega completada',
  TRAINING_COMPLETED: 'Ejecución · Capacitación realizada',
  SALE_WON: 'Cierre · Venta ganada',
  OPPORTUNITY_PAUSED: 'Cierre · Oportunidad pausada',
  OPPORTUNITY_LOST: 'Cierre · Oportunidad perdida',
  SALE_CANCELLED: 'Cierre · Venta cancelada',
  FOLLOW_UP: 'Seguimiento · Seguimiento realizado',
};

export const ACTION_MILESTONE = {
  LEAD_QUALIFIED: 'M1',
  SCOPE_VALIDATED: 'M2',
  PROPOSAL_PRESENTED: 'M3',
  NEGOTIATION_STARTED: 'M4',
  FORMAL_COMMITMENT: 'M5',
  PURCHASE_ORDER_RECEIVED: 'M5',
  CONTRACT_SIGNED: 'M5',
  SALE_WON: 'M6',
};

export function milestoneLabel(code) {
  return MILESTONE_META[code]?.label || 'Sin hito confirmado';
}

export function milestonePercent(code) {
  return MILESTONE_META[code]?.percent || 0;
}

export function movementMilestoneHelp(action) {
  const code = ACTION_MILESTONE[action];
  const meta = code ? MILESTONE_META[code] : null;
  return meta
    ? `Esta acción acredita «${meta.label}» y puede llevar la madurez a ${meta.percent}%.`
    : 'Esta acción queda documentada, pero no cambia por sí sola el porcentaje de madurez.';
}

export function renderMilestoneRail(currentCode, escapeHTML) {
  const current = milestonePercent(currentCode);
  return Object.entries(MILESTONE_META).map(([code, meta]) => {
    const state = current >= meta.percent ? 'done' : currentCode === code ? 'current' : 'future';
    return `<li class="${state}"><span>${meta.percent}%</span><strong>${escapeHTML(meta.label)}</strong></li>`;
  }).join('');
}
