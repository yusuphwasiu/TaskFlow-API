# TaskFlow-API
RESTful API for a task management system supporting workspaces, projects, tasks with subtasks, labels, due dates, and user assignments. Includes webhook integrations and rate limiting.

## User Roles & Permissions

TaskFlow API implements role-based access control (RBAC) with three user roles:

### Roles

| Role   | Description | Permissions |
|--------|-------------|-------------|
| **Admin** | System administrator with full access | `*` (all permissions) |
| **Editor** (User) | Can read and manage tasks | `tasks:read`, `tasks:write`, `profile:read`, `admin:manage` |
| **Viewer** | Read-only access | `tasks:read`, `profile:read` |

### Permission Mapping

- `tasks:read` - Read tasks and view task information
- `tasks:write` - Create, update, and delete tasks
- `profile:read` - View user profile information
- `admin:manage` - Access admin endpoints and manage user roles

### Role Assignment

Admins can assign or change user roles via the API:

**Endpoint:** `PUT /api/admin/users/{userId}/role`

**Request:**
```json
{
  "role": "viewer|user|admin"
}
```

**Responses:**
- `200 OK` - Role assigned successfully
- `400 Bad Request` - Invalid role specified or missing required fields
- `404 Not Found` - User not found
- `500 Internal Server Error` - Role assignment failed due to server error

### Implementation Details

- **Immediate Effect**: Role changes take effect immediately without requiring user re-login
- **Validation**: Invalid role assignments are rejected with a 400 error
- **Error Handling**: Server errors during role assignment return a 500 status code

