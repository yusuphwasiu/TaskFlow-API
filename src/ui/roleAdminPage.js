function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderRoleAdminPage(users, actingUserId) {
  const userRows = users
    .map((user) => {
      const role = user.role ?? 'unassigned';

      return `
        <tr>
          <td>${escapeHtml(user.id)}</td>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(role)}</td>
          <td>
            <form method="post" action="/admin/roles?asUser=${encodeURIComponent(actingUserId)}">
              <input type="hidden" name="userId" value="${escapeHtml(user.id)}" />
              <select name="role">
                <option value="admin">admin</option>
                <option value="user">user</option>
                <option value="viewer">viewer</option>
              </select>
              <button type="submit">Assign role</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaskFlow Role Assignment</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; background: #f8fafc; color: #0f172a; }
      .card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
      th, td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
      select, button { padding: 0.5rem; border-radius: 8px; border: 1px solid #cbd5e1; }
      button { background: #2563eb; color: white; cursor: pointer; }
      .hint { color: #475569; margin-top: 0.5rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Role assignment</h1>
      <p class="hint">Authenticated as <strong>${escapeHtml(actingUserId)}</strong>. This demo UI is intended for local administration only.</p>
      <table>
        <thead>
          <tr>
            <th>User ID</th>
            <th>Name</th>
            <th>Current role</th>
            <th>Assign role</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>
  </body>
</html>`;
}
