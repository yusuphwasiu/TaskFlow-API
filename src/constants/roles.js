export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
};

export const VALID_ROLES = Object.values(ROLES);

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['*'],
  [ROLES.USER]: ['tasks:read', 'tasks:write', 'profile:read'],
  [ROLES.VIEWER]: ['tasks:read', 'profile:read'],
};

export function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

export function hasPermission(role, permission) {
  if (!role) {
    return false;
  }

  const permissions = PERMISSIONS[role] ?? [];

  return permissions.includes('*') || permissions.includes(permission);
}
