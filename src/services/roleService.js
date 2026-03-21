export function createRoleService({ userStore }) {
  return {
    getUserContext(request) {
      const shouldFail = request.headers['x-role-service-fail'];

      if (shouldFail && shouldFail !== 'false') {
        throw new Error('Role retrieval service unavailable');
      }

      const userId = request.headers['x-user-id'];

      if (!userId) {
        return null;
      }

      const user = userStore.getUserById(userId);

      if (!user || !user.role) {
        return null;
      }

      return user;
    },
  };
}
