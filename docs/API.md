# API Reference

All endpoints are prefixed `/api/v1/`. Authentication is via session cookie set by the auth service.

## Health

`GET /api/health` — Returns `{"status":"ok","version":"<git-sha>"}`. No auth required.

## Assessments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assessments` | List all assessments for the current tenant |
| POST | `/assessments` | Create a new assessment |
| GET | `/assessments/{id}` | Get assessment detail |
| PATCH | `/assessments/{id}` | Update fields (title, scope, current_step, status) |
| DELETE | `/assessments/{id}` | Delete assessment (admin/manager only) |

## Risks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assessments/{id}/risks` | List risks for an assessment |
| POST | `/assessments/{id}/risks` | Add a risk |
| PATCH | `/assessments/{id}/risks/{risk_id}` | Update risk fields (ratings, etc.) |
| DELETE | `/assessments/{id}/risks/{risk_id}` | Remove a risk |

## Controls

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assessments/{id}/controls` | List controls for an assessment |
| POST | `/assessments/{id}/controls` | Add a control |
| PATCH | `/assessments/{id}/controls/{control_id}` | Update control |
| DELETE | `/assessments/{id}/controls/{control_id}` | Remove a control |

## Documents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assessments/{id}/documents` | Upload a document (multipart/form-data) |
| GET | `/assessments/{id}/documents` | List uploaded documents |
| DELETE | `/assessments/{id}/documents/{doc_id}` | Delete document |

## Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat` | Send message; returns SSE stream (`text/event-stream`) |
| GET | `/chat/{session_id}/history` | Get chat history for a session |

SSE event types: `chat:token`, `chat:done`, `chat:error`.

## Approvals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assessments/{id}/approvals` | Submit for approval |
| GET | `/assessments/{id}/approvals` | List approval records |
| PATCH | `/assessments/{id}/approvals/{approval_id}` | Approve or reject |

## Admin

Requires `admin` role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List users |
| POST | `/admin/taxonomy` | Create taxonomy schema |
| GET | `/admin/taxonomy` | List taxonomy schemas |

## Error format

All errors return JSON:
```json
{ "error": { "code": "NOT_FOUND", "message": "Assessment not found" } }
```
