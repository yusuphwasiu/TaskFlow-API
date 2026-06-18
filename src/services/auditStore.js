/**
 * Audit store for tracking deleted tasks
 * Stores: taskId, userId, timestamp, task title, and associated metadata
 */

export function createAuditStore(initialLogs = [], options = {}) {
  const logs = [...initialLogs];
  const retentionPeriodDays = options.retentionPeriodDays ?? 90;

  function logDeletedTask(taskId, userId, taskData = {}) {
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      userId,
      taskTitle: taskData.title || 'Unknown',
      workspace: taskData.workspace || null,
      project: taskData.project || null,
      deletedAt: new Date().toISOString(),
      userRole: taskData.userRole || null,
    };

    logs.push(auditEntry);
    return auditEntry;
  }

  function getAuditLogs(filters = {}) {
    let filtered = [...logs];

    // Filter by taskId if provided
    if (filters.taskId) {
      filtered = filtered.filter((log) => log.taskId === filters.taskId);
    }

    // Filter by userId if provided
    if (filters.userId) {
      filtered = filtered.filter((log) => log.userId === filters.userId);
    }

    // Filter by date range if provided
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      filtered = filtered.filter((log) => new Date(log.deletedAt).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      filtered = filtered.filter((log) => new Date(log.deletedAt).getTime() <= end);
    }

    // Sort by deletedAt in descending order (most recent first)
    filtered.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

    return filtered;
  }

  function getAllLogs() {
    return logs;
  }

  function clearLogs() {
    logs.length = 0;
  }

  function purgeOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionPeriodDays);

    const beforeCount = logs.length;
    const cutoffTime = cutoffDate.getTime();

    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const logTime = new Date(logs[i].deletedAt).getTime();
      if (logTime < cutoffTime) {
        logs.splice(i, 1);
      }
    }

    const afterCount = logs.length;
    return { purgedCount: beforeCount - afterCount, remainingCount: afterCount };
  }

  function getRetentionPeriod() {
    return retentionPeriodDays;
  }

  return {
    logDeletedTask,
    getAuditLogs,
    getAllLogs,
    clearLogs,
    purgeOldLogs,
    getRetentionPeriod,
  };
}
