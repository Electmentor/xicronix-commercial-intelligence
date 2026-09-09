// Workspace selection is presentation state, never an authorization role.
// The database remains responsible for enforcing the authenticated account's permissions.
export const ADMIN = 'admin';
export const SELLER = 'seller';
const operational = ['institutions', 'contacts', 'leads', 'opportunities', 'tasks', 'activities'];
export function effectiveWorkspace(profile, requested = ADMIN) {
  return profile?.role === 'ADMIN' && requested === ADMIN ? ADMIN : SELLER;
}
export function workspaceKey(userId, organizationId) {
  return 'xicronix-workspace:' + userId + ':' + organizationId;
}
export function canAccessPage(profile, workspace, page) {
  if (!profile?.organization_id || !['ADMIN','MANAGER','SALES','VIEWER'].includes(profile.role)) return false;
  return operational.includes(page) || (effectiveWorkspace(profile, workspace) === ADMIN && ['dashboard','users','goals'].includes(page));
}
export function canWriteModule(profile, workspace, table) {
  return canAccessPage(profile, workspace, table) && table !== 'dashboard' && ['ADMIN','MANAGER','SALES'].includes(profile.role);
}
export function assignedUserId(row) {
  return row.owner_user_id || row.assigned_to || row.user_id || row.created_by || null;
}
export function scopeWorkspaceData(source, profile, userId, workspace) {
  const result = Object.fromEntries(Object.keys(source).map(key => [key, []]));
  if (!profile?.organization_id || !userId) return result;
  const organization = Object.fromEntries(Object.entries(source).map(([key, rows]) => [
    key, rows.filter(row => row.organization_id === profile.organization_id)
  ]));
  if (effectiveWorkspace(profile, workspace) === ADMIN) return organization;
  const own = row => assignedUserId(row) === userId;
  for (const table of ['leads','opportunities','tasks']) result[table] = (organization[table] || []).filter(own);
  // Management cost data is not part of the seller experience.
  result.opportunities = result.opportunities.map(({estimated_cost, ...row}) => row);
  const leadIds = new Set(result.leads.map(row => row.id));
  const opportunityIds = new Set(result.opportunities.map(row => row.id));
  result.activities = (organization.activities || []).filter(row =>
    leadIds.has(row.lead_id) || opportunityIds.has(row.opportunity_id) ||
    (!row.lead_id && !row.opportunity_id && row.created_by === userId));
  result.scores = (organization.scores || []).filter(row => leadIds.has(row.lead_id) || opportunityIds.has(row.opportunity_id));
  const linked = [...result.leads, ...result.opportunities, ...result.tasks, ...result.activities];
  const contactIds = new Set(linked.map(row => row.contact_id).filter(Boolean));
  result.contacts = (organization.contacts || []).filter(row => row.created_by === userId || contactIds.has(row.id));
  const institutionIds = new Set([...linked, ...result.contacts].map(row => row.institution_id).filter(Boolean));
  result.institutions = (organization.institutions || []).filter(row => row.created_by === userId || institutionIds.has(row.id));
  return result;
}

