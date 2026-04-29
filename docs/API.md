# API Reference

All endpoints are prefixed `/api/v1/`. Authentication is via session cookie set by the auth service (`/api/auth`).

**Roles** (least → most privileged): `viewer` → `analyst` → `delivery_lead`

---

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | None |

**Response** `200`
```json
{ "status": "ok", "version": "<git-sha>" }
```

---

## Assessments

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/api/v1/assessments` | viewer | List all assessments for the tenant |
| POST | `/api/v1/assessments` | viewer | Create a new assessment |
| GET | `/api/v1/assessments/{id}` | viewer | Get full assessment detail |
| PATCH | `/api/v1/assessments/{id}` | viewer | Update editable fields |
| DELETE | `/api/v1/assessments/{id}` | viewer | Soft-delete (sets status=archived) |

**POST body**
```json
{ "title": "string" }
```

**PATCH body** (all fields optional)
```json
{
  "title": "string",
  "description": "string",
  "scope": "string",
  "assessment_date": "YYYY-MM-DD",
  "owner": "string",
  "business_unit": "string",
  "status": "draft|in_progress|review|complete|archived",
  "current_step": 1,
  "questionnaire": {},
  "questionnaire_notes": {}
}
```

**GET response** (single)
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string|null",
  "scope": "string|null",
  "assessment_date": "YYYY-MM-DD|null",
  "owner": "string|null",
  "business_unit": "string|null",
  "status": "draft",
  "current_step": 1,
  "questionnaire": {},
  "questionnaire_notes": {},
  "created_by": "uuid",
  "tenant_id": "uuid",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

---

## Risks

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/api/v1/assessments/{id}/risks` | viewer | List risks for an assessment |
| POST | `/api/v1/assessments/{id}/risks` | analyst | Add a risk |
| PATCH | `/api/v1/assessments/{id}/risks/{risk_id}` | analyst | Update risk fields |
| DELETE | `/api/v1/assessments/{id}/risks/{risk_id}` | analyst | Remove a risk |

**POST body**
```json
{
  "name": "string",
  "category": "string",
  "source": "EXT|INT",
  "description": "string (optional)"
}
```

**PATCH body** (all optional)
```json
{
  "name": "string",
  "category": "string",
  "source": "EXT|INT",
  "applicable": true,
  "inherent_likelihood": "low|medium|high|critical",
  "inherent_impact": "low|medium|high|critical",
  "residual_likelihood": "low|medium|high|critical",
  "residual_impact": "low|medium|high|critical",
  "rationale": "string"
}
```

---

## Controls

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/api/v1/assessments/{id}/controls` | viewer | List controls |
| POST | `/api/v1/assessments/{id}/controls` | analyst | Add a control |
| PATCH | `/api/v1/assessments/{id}/controls/{control_id}` | analyst | Update control |
| DELETE | `/api/v1/assessments/{id}/controls/{control_id}` | analyst | Remove a control |

**POST body**
```json
{
  "risk_id": "uuid (optional)",
  "name": "string",
  "type": "Preventive|Detective|Corrective|Directive (optional)",
  "is_key": false,
  "description": "string (optional)"
}
```

**PATCH body** (all optional)
```json
{
  "name": "string",
  "control_ref": "string",
  "type": "Preventive|Detective|Corrective|Directive",
  "is_key": true,
  "description": "string",
  "design_effectiveness": 1,
  "operating_effectiveness": 4,
  "overall_effectiveness": "Effective|Partially Effective|Needs Improvement|Ineffective|Not Tested",
  "rationale": "string",
  "evidence_ref": "string"
}
```

---

## Documents

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| POST | `/api/v1/assessments/{id}/documents` | analyst | Upload a document (`multipart/form-data`) |
| GET | `/api/v1/assessments/{id}/documents` | viewer | List uploaded documents |
| DELETE | `/api/v1/assessments/{id}/documents/{doc_id}` | analyst | Delete document |

---

## Chat

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| POST | `/api/v1/chat` | viewer | Send message; returns SSE stream |
| GET | `/api/v1/chat/{session_id}/history` | viewer | Get chat history |

SSE event types: `chat:token`, `chat:done`, `chat:error`.

---

## Approvals

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| POST | `/api/v1/assessments/{id}/approvals` | analyst | Submit for approval |
| GET | `/api/v1/assessments/{id}/approvals` | viewer | List approval records |
| PATCH | `/api/v1/assessments/{id}/approvals/{approval_id}` | delivery_lead | Approve or reject |

---

## Admin

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/api/v1/admin/users` | delivery_lead | List users |
| POST | `/api/v1/admin/taxonomy` | delivery_lead | Create taxonomy schema |
| GET | `/api/v1/admin/taxonomy` | delivery_lead | List taxonomy schemas |

---

## Agent (Phase 2 — LLM-driven)

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| POST | `/api/v1/agent/risk-applicability` | analyst | LLM-generated risk applicability |

These endpoints degrade gracefully when `OPENAI_API_KEY` is unset.

---

## Error format

```json
{ "error": { "code": "NOT_FOUND", "message": "Assessment not found" } }
```

HTTP status codes: `400` validation, `401` unauthenticated, `403` insufficient role, `404` not found, `422` schema error, `500` server error.
