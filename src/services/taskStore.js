import { ROLES } from '../constants/roles.js';

const DEFAULT_TASKS = [
  {
    id: 'task-1',
    title: 'Define roles and permissions',
    assignedTo: 'user-1',
    visibleTo: ROLES.USER,
  },
  {
    id: 'task-2',
    title: 'Review project requirements',
    assignedTo: 'admin-1',
    visibleTo: ROLES.ADMIN,
  },
  {
    id: 'task-3',
    title: 'Sync with QA team',
    assignedTo: 'viewer-1',
    visibleTo: ROLES.VIEWER,
  },
];

export function createTaskStore(seedTasks = DEFAULT_TASKS, options = {}) {
  const tasks = new Map(seedTasks.map((task) => [task.id, { ...task }]));
  let deleteAttemptCount = 0;
  let transientDeleteFailures = options.transientDeleteFailures ?? 0;

  function getAllTasksForUser(user) {
    return Array.from(tasks.values())
      .filter(
        (task) =>
          task.assignedTo === user.id ||
          user.role === ROLES.ADMIN ||
          task.visibleTo === user.role,
      )
      .map((task) => ({ ...task }));
  }

  function getTaskById(taskId) {
    const task = tasks.get(taskId);
    return task ? { ...task } : null;
  }

  function createTask(payload) {
    const task = {
      id: `task-created-${Date.now()}`,
      title: payload.title,
      assignedTo: payload.assignedTo,
      visibleTo: payload.visibleTo,
    };

    tasks.set(task.id, { ...task });
    return { task: { ...task } };
  }

  function deleteTask(taskId) {
    deleteAttemptCount += 1;

    const task = tasks.get(taskId);

    if (!task) {
      return { error: 'Task not found' };
    }

    if (transientDeleteFailures > 0) {
      transientDeleteFailures -= 1;
      return { error: 'Connectivity issue', isTransient: true };
    }

    if (options.shouldFailDeletePermanently) {
      return { error: 'Deletion failed due to server error', isServerError: true };
    }

    tasks.delete(taskId);
    return { success: true };
  }

  function getDeleteAttemptCount() {
    return deleteAttemptCount;
  }

  return {
    getAllTasksForUser,
    getTaskById,
    createTask,
    deleteTask,
    getDeleteAttemptCount,
  };
}
