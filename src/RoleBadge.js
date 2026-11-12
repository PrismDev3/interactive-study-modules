/** Shared role labels for room nameplates and player lists. */
export function rolePresentation(rank) {
  if (Number(rank) >= 3) return { label: 'Server Owner', tone: 'server-owner', background: '#247fc0', foreground: '#fff' };
  if (Number(rank) >= 2) return { label: 'Admin', tone: 'admin', background: '#8248bd', foreground: '#fff' };
  return null;
}

export function appendRoleBadge(parent, rank, extraClass = '') {
  const role = rolePresentation(rank);
  if (!role) return null;
  const badge = document.createElement('b');
  badge.className = `role-badge ${role.tone} ${extraClass}`.trim();
  badge.textContent = role.label;
  badge.title = role.label;
  parent.append(badge);
  return badge;
}
