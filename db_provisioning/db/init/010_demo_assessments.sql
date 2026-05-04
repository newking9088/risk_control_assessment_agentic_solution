-- ============================================================
-- 010_demo_assessments.sql — Demo assessment units
-- ============================================================

INSERT INTO app.assessments (
    id, tenant_id, title, status, current_step,
    business_unit, unit_id,
    inherent_risk_rating, controls_effectiveness_rating, residual_risk_rating,
    assessment_date, assessment_end_date,
    created_by, created_at, updated_at
) VALUES
(
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    'Consumer Credit Card Opening',
    'in_progress',
    2,
    'Retail 2',
    'RET-228 2',
    'Very High',
    NULL,
    NULL,
    '2026-04-29',
    NULL,
    'demo-user',
    '2026-04-29 08:00:00+00',
    '2026-04-29 08:00:00+00'
),
(
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    'Consumer Credit Card Opening',
    'complete',
    7,
    'Retail',
    'RET-228',
    'Very High',
    'Ineffective',
    'Very High',
    '2026-04-22',
    '2026-04-22',
    'demo-user',
    '2026-04-22 08:00:00+00',
    '2026-04-22 17:00:00+00'
),
(
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    'Digital Banking Platform',
    'complete',
    7,
    'Digital',
    'RET-755',
    'Very High',
    'Moderately Effective',
    'Very High',
    '2026-03-15',
    '2026-03-15',
    'demo-user',
    '2026-03-15 08:00:00+00',
    '2026-03-15 17:00:00+00'
)
ON CONFLICT DO NOTHING;
