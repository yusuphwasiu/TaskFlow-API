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

## Task API

### List Tasks

**Endpoint:** `GET /api/tasks`

**Permissions:** `tasks:read`

**Response:**
```json
{
  "data": [
    {
      "id": "task-1",
      "title": "Define roles and permissions",
      "assignedTo": "user-1",
      "visibleTo": "user"
    }
  ]
}
```

### Delete Task

**Endpoint:** `DELETE /api/tasks/{taskId}`

**Permissions:** `tasks:write`

**Behavior:**
- Only the user assigned to the task may delete it.
- The API retries task deletion up to 3 times for transient connectivity failures before failing gracefully.
- Server-side errors return `Deletion failed, please try again later`.

**Responses:**
- `200 OK` - Task deleted successfully
- `403 Forbidden` - `You are not authorized to delete this task`
- `404 Not Found` - Task not found
- `500 Internal Server Error` - `Deletion failed, please try again later`
- `503 Service Unavailable` - `Deletion failed, please try again later`

### Task Deletion UI Demo

A simple HTML task listing is available at `GET /tasks` with a built-in confirmation dialog before deletion. This page is intended to demonstrate the deletion flow and provide a confirmation prompt for assigned users.

## Role Introspection API

The API provides endpoints for querying role and permission information:

### List All Roles

**Endpoint:** `GET /api/roles`

**Response:**
```json
{
  "data": [
    {
      "name": "admin",
      "permissions": ["*"]
    },
    {
      "name": "user",
      "permissions": ["tasks:read", "tasks:write", "profile:read"]
    },
    {
      "name": "viewer",
      "permissions": ["tasks:read", "profile:read"]
    }
  ]
}
```

### Get Role Details

**Endpoint:** `GET /api/roles/{role}`

**Example:** `GET /api/roles/admin`

**Response:**
```json
{
  "data": {
    "name": "admin",
    "permissions": ["*"]
  }
}
```

### Get User Role

**Endpoint:** `GET /api/users/{userId}/role`

**Response:**
```json
{
  "data": {
    "userId": "admin-1",
    "role": "admin"
  }
}
```

**Access Control:**
- Users can view their own role
- Admins can view any user's role
- Non-admin users cannot view other users' roles (returns 403 Forbidden)

### List All Permissions

**Endpoint:** `GET /api/permissions`

**Response:**
```json
{
  "data": ["*", "profile:read", "tasks:read", "tasks:write"]
}
```

## Checkout API

The checkout endpoint accepts authenticated requests and enforces per-user rate limiting to prevent abuse.

**Endpoint:** `POST /api/checkout`

**Headers:**
- `x-user-id`: authenticated user identifier

**Rate limit:** 100 requests per minute per user

**Responses:**
- `200 OK` - Checkout processed successfully
- `401 Unauthorized` - Authentication required
- `429 Too Many Requests` - Rate limit exceeded

**Monitoring:** Rate limit breaches are logged and alert administrators for abuse detection.

**Authentication:** All role introspection endpoints require authentication with `profile:read` permission.

