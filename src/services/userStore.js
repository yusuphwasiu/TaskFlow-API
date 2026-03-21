import { ROLES, isValidRole } from '../constants/roles.js';

const DEFAULT_USERS = [
  { id: 'admin-1', name: 'System Admin', role: ROLES.ADMIN },
  { id: 'user-1', name: 'Regular User', role: ROLES.USER },
  { id: 'viewer-1', name: 'Read Only User', role: ROLES.VIEWER },
  { id: 'norole-1', name: 'Unassigned User', role: null },
];

export function createUserStore(seedUsers = DEFAULT_USERS, options = {}) {
  const users = new Map(seedUsers.map((user) => [user.id, { ...user }]));
  const shouldFailAssignRole = options.shouldFailAssignRole ?? false;

  return {
    getUserById(userId) {
      return users.get(userId) ?? null;
    },

    getAllUsers() {
      return Array.from(users.values()).map((user) => ({ ...user }));
    },

    assignRole(userId, role) {
      if (!isValidRole(role)) {
        return { error: 'Invalid role specified' };
      }

      const existingUser = users.get(userId);

      if (!existingUser) {
        return { error: 'User not found' };
      }

      // Simulate potential database error
      if (shouldFailAssignRole) {
        return { error: 'Role assignment failed due to server error', isServerError: true };
      }

      try {
        const updatedUser = { ...existingUser, role };
        users.set(userId, updatedUser);

        return { user: { ...updatedUser } };
      } catch (error) {
        return { error: 'Role assignment failed due to server error', isServerError: true };
      }
    },
  };
}
