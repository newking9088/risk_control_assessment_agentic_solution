ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

MAGIC_BYTES = {
    "application/pdf": b"%PDF",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b"PK\x03\x04",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
    "application/vnd.ms-excel": b"\xd0\xcf\x11\xe0",
    "application/msword": b"\xd0\xcf\x11\xe0",
}

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

ASSESSMENT_STEPS = [
    "start_assessment",
    "identify_risks",
    "inherent_risk",
    "evaluate_controls",
    "residual_risk",
    "assessment_summary",
]

ROLES = ["viewer", "analyst", "delivery_lead"]
ROLE_WEIGHTS = {"viewer": 0, "analyst": 1, "delivery_lead": 2}
