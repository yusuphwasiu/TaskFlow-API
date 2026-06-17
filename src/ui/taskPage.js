function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderTaskPage(tasks, actingUserId) {
  const taskRows = tasks
    .map((task) => {
      const canDelete = task.assignedTo === actingUserId;
      return `
        <tr>
          <td>${escapeHtml(task.id)}</td>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(task.assignedTo)}</td>
          <td>${escapeHtml(task.visibleTo)}</td>
          <td>
            ${canDelete ? `<button type="button" onclick="deleteTask('${escapeHtml(task.id)}')">Delete</button>` : 'Not assigned'}
          </td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaskFlow Task Deletion</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; background: #f8fafc; color: #0f172a; }
      .card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
      th, td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
      button { padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid #cbd5e1; background: #ef4444; color: white; cursor: pointer; }
      button:hover { background: #dc2626; }
      .hint { color: #475569; margin-top: 0.5rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Task list</h1>
      <p class="hint">Authenticated as <strong>${escapeHtml(actingUserId)}</strong>. Delete only tasks assigned to you.</p>
      <table>
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Title</th>
            <th>Assigned To</th>
            <th>Visible To</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>
    <script>
      async function deleteTask(taskId) {
        if (!window.confirm('Are you sure you want to delete this task?')) {
          return;
        }

        const response = await fetch('/api/tasks/' + encodeURIComponent(taskId), {
          method: 'DELETE',
          headers: {
            'x-user-id': '${escapeHtml(actingUserId)}',
          },
        });

        const body = await response.json();

        if (!response.ok) {
          window.alert(body.error || 'Deletion failed, please try again later');
          return;
        }

        window.location.reload();
      }
    </script>
  </body>
</html>`;
}
