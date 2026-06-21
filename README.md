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

Admins can assign or change user roles via the API...:

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

## Audit API

The Audit API provides endpoints for retrieving audit logs of deleted tasks for compliance and accountability purposes.

### Get Task Deletion Audit Logs

**Endpoint:** `GET /api/audit/tasks`

**Permissions:** `admin:manage` (only admins can access audit logs)

**Query Parameters:**
- `userId` (optional) - Filter logs by the user who deleted the task
- `startDate` (optional) - Filter logs by start date (ISO 8601 format, e.g., `2026-06-17T00:00:00Z`)
- `endDate` (optional) - Filter logs by end date (ISO 8601 format, e.g., `2026-06-17T23:59:59Z`)

**Example Requests:**
```
GET /api/audit/tasks - Retrieve all deletion logs
GET /api/audit/tasks?userId=user-1 - Retrieve logs for a specific user
GET /api/audit/tasks?startDate=2026-06-17T00:00:00Z&endDate=2026-06-17T23:59:59Z - Retrieve logs within a date range
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "audit-1624982400000-abc123",
      "taskId": "task-1",
      "userId": "user-1",
      "taskTitle": "Define roles and permissions",
      "deletedAt": "2026-06-17T10:30:00.000Z",
      "userRole": "user",
      "workspace": null,
      "project": null
    }
  ]
}
```

**Responses:**
- `200 OK` - Audit logs retrieved successfully (returns empty array if no matches)
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions (`admin:manage` required)
- `429 Too Many Requests` - Rate limit exceeded

**Rate limiting:** 10 requests per minute per user (audit endpoint specific)

**Behavior:**
- All deleted tasks are automatically logged with timestamp, user ID, task details, and user role
- Logs are stored and retrievable for compliance review
- Filtering by date range allows for period-based audits
- Unauthorized users (non-admins) receive a 403 error

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

**Rate limit:** 100 requests per hour per user

**Responses:**
- `200 OK` - Checkout processed successfully
- `401 Unauthorized` - Authentication required
- `429 Too Many Requests` - Rate limit exceeded

## Error Codes

The API uses consistent HTTP status codes and messages for failure scenarios. Common codes include:

- `400 Bad Request` - Malformed input or validation errors
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `405 Method Not Allowed` - Unsupported HTTP method for the endpoint
- `408 Request Timeout` - Request timed out
- `415 Unsupported Media Type` - Unsupported payload/content type
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server-side error
- `503 Service Unavailable` - Service temporarily unavailable

Endpoints will include an `error` message and a `standard` field in JSON error responses to help consumers handle failures programmatically.

**Monitoring:** Rate limit breaches are logged and alert administrators for abuse detection.

**Authentication:** All role introspection endpoints require authentication with `profile:read` permission.
## Rate Limiting

TaskFlow API enforces per-user rate limiting to prevent abuse:

- `100` requests per `hour` per `x-user-id`
- If a request is over the limit, API returns `429` with:
  - `{ "error": "Rate limit exceeded" }`
- If rate limiting subsystem is unavailable (e.g., header `x-rate-limit-service-fail`), API returns `503` with:
  - `{ "error": "Service Unavailable" }`
- Logging on limit violation and service failures is performed via the configured logger
- **Retry Logic**: On network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED), the system automatically retries the request up to 3 times with a 100ms delay between attempts

## Error Handling

TaskFlow API implements standardized HTTP status codes and error messages for consistent error handling:

| Status Code | Message | Scenario |
|-------------|---------|----------|
| `200` | (with data) | Successful request |
| `400` | `Bad Request` | Malformed request body (e.g., invalid JSON, invalid role) |
| `401` | `Authentication required` | Missing or invalid authentication credentials |
| `403` | `Forbidden` | User lacks required permissions |
| `404` | `Not Found` | Requested resource does not exist |
| `429` | `Rate limit exceeded` | User exceeded rate limit (100 req/hour) |
| `500` | `Internal Server Error` | Server-side error during request processing |
| `503` | `Service Unavailable` | Required service (rate limiting, authentication) is unavailable |

### Error Response Format

All error responses follow this format:
```json
{
  "error": "Error message"
}
```

### Common Error Scenarios

- **Missing User ID**: 401 Authentication required (no `x-user-id` header)
- **Invalid JSON**: 400 Bad Request (malformed request body)
- **Unknown Endpoint**: 404 Not Found (path does not match any route)
- **Unauthorized Action**: 403 Forbidden (user lacks admin:manage permission)
- **Rate Limit Hit**: 429 Rate limit exceeded (over 100 requests/hour)



