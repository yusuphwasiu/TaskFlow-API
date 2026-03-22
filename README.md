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

## Rate Limiting

TaskFlow API enforces per-user rate limiting to prevent abuse:

- `100` requests per `60` seconds per `x-user-id`
- If a request is over the limit, API returns `429` with:
  - `{ "error": "Rate limit exceeded" }`
- If rate limiting subsystem is unavailable (e.g., header `x-rate-limit-service-fail`), API returns `503` with:
  - `{ "error": "Service Unavailable" }`
- Logging on limit violation and service failures is performed via the configured logger

## Error Handling

TaskFlow API implements standardized HTTP status codes and error messages for consistent error handling:

| Status Code | Message | Scenario |
|-------------|---------|----------|
| `200` | (with data) | Successful request |
| `400` | `Bad Request` | Malformed request body (e.g., invalid JSON, invalid role) |
| `401` | `Authentication required` | Missing or invalid authentication credentials |
| `403` | `Forbidden` | User lacks required permissions |
| `404` | `Not Found` | Requested resource does not exist |
| `429` | `Rate limit exceeded` | User exceeded rate limit (100 req/min) |
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
- **Rate Limit Hit**: 429 Rate limit exceeded (over 100 requests/minute)



