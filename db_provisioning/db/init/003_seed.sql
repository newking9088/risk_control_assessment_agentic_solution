-- ============================================================
-- 003_seed.sql — Demo seed data (non-user)
-- ============================================================

-- Default tenant is already inserted by 001_app_schema.sql.
-- This file adds a taxonomy demo row so the risk taxonomy
-- picker has at least one entry to show in development.

INSERT INTO app.taxonomy_schemas (id, tenant_id, name, version, schema, active)
VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    'Standard Risk Taxonomy v1',
    1,
    '{
        "categories": [
            {"id": "financial",    "label": "Financial",    "risks": ["Fraud", "Credit", "Liquidity"]},
            {"id": "operational",  "label": "Operational",  "risks": ["Process Failure", "Vendor Risk", "Human Error"]},
            {"id": "compliance",   "label": "Compliance",   "risks": ["Regulatory", "Legal", "Policy Breach"]},
            {"id": "technology",   "label": "Technology",   "risks": ["Cyber Security", "Data Loss", "System Outage"]},
            {"id": "strategic",    "label": "Strategic",    "risks": ["Reputational", "Market Change", "M&A Risk"]}
        ]
    }',
    true
)
ON CONFLICT DO NOTHING;
