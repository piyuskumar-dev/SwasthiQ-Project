"""Tests for Phase 2: Persistence Layer, State Consistency, and Narrative Tracing."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
import pytest
from fastapi.testclient import TestClient

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
WORKSPACE_ROOT = BACKEND_DIR.parent

for p in [str(WORKSPACE_ROOT), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.app.storage import DatabaseManager
    from backend.app.narrative import (
        format_rupees,
        generate_grounded_template,
        generate_narrative_summary,
        validate_grounding,
    )
    from backend.app.main import app
except ImportError:
    from app.storage import DatabaseManager
    from app.narrative import (
        format_rupees,
        generate_grounded_template,
        generate_narrative_summary,
        validate_grounding,
    )
    from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_db():
    """Provides a fresh temporary SQLite database instance for isolated testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    db = DatabaseManager(db_path=db_path)
    yield db

    db.close()
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture
def sample_raw_records():
    """Sample raw billing records."""
    return [
        {
            "clinic_id": "CLN-TEST-001",
            "visit_id": "V-001",
            "timestamp": "2026-07-27T10:00:00Z",
            "doctor_id": "DOC-1",
            "line_items": [
                {"drug_name": "PARACETAMOL", "qty": 4, "unit_price_paise": 2000}
            ],
            "payment_mode": "cash",
            "amount_paid_paise": 8000,
            "discount_paise": 0,
            "is_refund": False,
        },
        {
            "clinic_id": "CLN-TEST-001",
            "visit_id": "V-002",
            "timestamp": "2026-07-27T12:00:00Z",
            "doctor_id": "DOC-2",
            "line_items": [
                {"drug_name": "ATORVASTATIN", "qty": 2, "unit_price_paise": 10000}
            ],
            "payment_mode": "card",
            "amount_paid_paise": 18000,
            "discount_paise": 2000,
            "is_refund": False,
        },
    ]


# ---------------------------------------------------------------------------
# 1. Persistence & State Consistency Tests
# ---------------------------------------------------------------------------

def test_database_initialization_and_saving(temp_db, sample_raw_records):
    """Tests saving a billing log and verifying clean retrieval."""
    clinic_id = "CLN-TEST-001"
    date_str = "2026-07-27"

    result = temp_db.save_billing_log(
        clinic_id=clinic_id,
        date_str=date_str,
        raw_records=sample_raw_records,
        clinic_name="Mehta Test Clinic",
    )

    assert result["clinic_id"] == clinic_id
    assert result["date"] == date_str
    assert result["total_records"] == 2
    assert result["valid_records_count"] == 2
    assert result["rejected_records_count"] == 0
    assert result["reconciliation"]["total_billed_paise"] == 8000 + 18000

    retrieved = temp_db.get_billing_log(clinic_id, date_str)
    assert retrieved is not None
    assert retrieved["clinic_id"] == clinic_id
    assert retrieved["reconciliation"]["total_billed_paise"] == 26000
    assert retrieved["reconciliation"]["total_collected_paise"] == 26000


def test_state_consistency_upon_update(temp_db, sample_raw_records):
    """
    CRITICAL REQUIREMENT:
    Ensures that when a daily billing log is updated / re-ingested:
    1. Previous state is completely and cleanly replaced without duplicate rows.
    2. 'created_at' timestamp is preserved, while 'updated_at' is refreshed.
    3. Reconciliation and analytics are deterministically recomputed from scratch.
    """
    clinic_id = "CLN-TEST-001"
    date_str = "2026-07-27"

    res1 = temp_db.save_billing_log(clinic_id, date_str, sample_raw_records)
    initial_created_at = res1["created_at"]
    assert res1["reconciliation"]["total_billed_paise"] == 26000

    updated_records = list(sample_raw_records) + [
        {
            "clinic_id": "CLN-TEST-001",
            "visit_id": "V-003",
            "timestamp": "2026-07-27T16:00:00Z",
            "doctor_id": "DOC-1",
            "line_items": [
                {"drug_name": "AMOXICILLIN", "qty": 5, "unit_price_paise": 6000}
            ],
            "payment_mode": "upi",
            "amount_paid_paise": 25000,
            "discount_paise": 0,
            "is_refund": False,
        }
    ]

    res2 = temp_db.save_billing_log(clinic_id, date_str, updated_records)

    assert res2["total_records"] == 3
    assert res2["valid_records_count"] == 3
    assert res2["created_at"] == initial_created_at

    assert res2["reconciliation"]["total_billed_paise"] == 56000
    assert res2["reconciliation"]["total_collected_paise"] == 51000
    assert res2["reconciliation"]["total_outstanding_paise"] == 5000

    conn = temp_db.get_connection()
    cursor = conn.execute(
        "SELECT COUNT(*) as cnt FROM billing_logs WHERE clinic_id = ? AND date = ?;",
        (clinic_id, date_str),
    )
    count = cursor.fetchone()["cnt"]
    assert count == 1, "There must be exactly one row for a clinic on a given date"


def test_list_clinics_and_dates(temp_db, sample_raw_records):
    """Tests listing all registered clinics and available dates."""
    temp_db.save_billing_log("CLN-001", "2026-07-25", sample_raw_records, "Clinic One")
    temp_db.save_billing_log("CLN-001", "2026-07-27", sample_raw_records, "Clinic One")
    temp_db.save_billing_log("CLN-002", "2026-07-27", sample_raw_records, "Clinic Two")

    clinics = temp_db.list_clinics()
    assert len(clinics) == 2
    assert {c["clinic_id"] for c in clinics} == {"CLN-001", "CLN-002"}

    dates_001 = temp_db.list_dates_for_clinic("CLN-001")
    assert dates_001 == ["2026-07-27", "2026-07-25"]


def test_delete_billing_log(temp_db, sample_raw_records):
    """Tests deleting an existing billing log."""
    temp_db.save_billing_log("CLN-001", "2026-07-27", sample_raw_records)
    assert temp_db.get_billing_log("CLN-001", "2026-07-27") is not None

    deleted = temp_db.delete_billing_log("CLN-001", "2026-07-27")
    assert deleted is True
    assert temp_db.get_billing_log("CLN-001", "2026-07-27") is None


# ---------------------------------------------------------------------------
# 2. Grounded AI Narrative Tests
# ---------------------------------------------------------------------------

def test_format_rupees_helper():
    """Tests Indian currency formatting."""
    assert format_rupees(0) == "₹0"
    assert format_rupees(4000) == "₹40"
    assert format_rupees(4285000) == "₹42,850"
    assert format_rupees(123456700) == "₹12,34,567"
    assert format_rupees(-24000) == "-₹240"


def test_narrative_grounding_and_traced_figures():
    """
    Verifies that the generated WhatsApp narrative contains only traceable figures
    matching the deterministic report.
    """
    reconciliation = {
        "total_billed_paise": 4285000,
        "total_collected_paise": 3820000,
        "total_outstanding_paise": 465000,
        "total_refunds_paise": 60000,
        "total_visits": 18,
        "pending_visits_count": 3,
        "refund_visits_count": 1,
    }
    analytics = {
        "peak_hour": "12pm",
        "peak_hour_interval": "12pm–1pm",
        "peak_revenue_paise": 840000,
        "top_medicines_by_quantity": [{"drug_name": "PARACETAMOL", "qty": 142}],
        "top_medicines_by_revenue": [{"drug_name": "ATORVASTATIN", "revenue_paise": 648000}],
    }

    narrative = generate_narrative_summary(
        reconciliation=reconciliation,
        analytics=analytics,
        clinic_name="Mehta Clinic",
        date_str="27 Jul",
    )

    assert narrative.is_grounded is True
    assert len(narrative.untraced_numbers) == 0

    msg = narrative.whatsapp_message
    assert "₹42,850" in msg
    assert "₹38,200" in msg
    assert "₹4,650" in msg
    assert "₹600" in msg
    assert "12pm–1pm" in msg
    assert "₹8,400" in msg
    assert "PARACETAMOL (142 units)" in msg
    assert "ATORVASTATIN (₹6,480)" in msg
    assert "Note: cost data wasn't available today" in msg

    traced_map = {t.source_field: t for t in narrative.traced_figures}
    assert "total_billed" in traced_map
    assert traced_map["total_billed"].display_value == "₹42,850"
    assert "outstanding" in traced_map
    assert traced_map["outstanding"].display_value == "₹4,650"
    assert "revenue_by_hour[max]" in traced_map
    assert "top_drug_by_qty" in traced_map


def test_hallucination_guardrails_detection():
    """Tests that validate_grounding flags invented/hallucinated numbers."""
    reconciliation = {
        "total_billed_paise": 1000000,
        "total_collected_paise": 1000000,
        "total_outstanding_paise": 0,
        "total_refunds_paise": 0,
        "total_visits": 5,
        "pending_visits_count": 0,
        "refund_visits_count": 0,
    }
    analytics = {
        "peak_hour": "10am",
        "peak_revenue_paise": 500000,
        "top_medicines_by_quantity": [{"drug_name": "ASPIRIN", "qty": 10}],
        "top_medicines_by_revenue": [{"drug_name": "ASPIRIN", "revenue_paise": 500000}],
    }

    hallucinated_msg = "Hello! Today we made a profit of ₹99,999 across 5 visits!"
    is_grounded, untraced = validate_grounding(hallucinated_msg, reconciliation, analytics)

    assert is_grounded is False
    assert "99,999" in untraced or "99999" in untraced


# ---------------------------------------------------------------------------
# 3. REST API Integration Tests
# ---------------------------------------------------------------------------

def test_api_ingest_and_get_lifecycle(sample_raw_records):
    """End-to-end API lifecycle: ingest log, query reconciliation, analytics, and narrative."""
    clinic_id = "CLN-API-001"
    date_str = "2026-07-27"

    ingest_res = client.post(
        f"/api/clinics/{clinic_id}/billing-logs/{date_str}",
        json={"clinic_name": "API Test Clinic", "records": sample_raw_records},
    )
    assert ingest_res.status_code == 200
    data = ingest_res.json()
    assert data["status"] == "success"
    assert data["data"]["clinic_id"] == clinic_id

    rec_res = client.get(f"/api/clinics/{clinic_id}/reconciliation/{date_str}")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["total_billed_paise"] == 26000

    ana_res = client.get(f"/api/clinics/{clinic_id}/analytics/{date_str}")
    assert ana_res.status_code == 200
    ana_data = ana_res.json()
    assert ana_data["peak_revenue_paise"] > 0

    narrative_res = client.get(f"/api/clinics/{clinic_id}/narrative/{date_str}")
    assert narrative_res.status_code == 200
    nar_data = narrative_res.json()
    assert nar_data["is_grounded"] is True
    assert len(nar_data["traced_figures"]) > 0

    not_found_res = client.get(f"/api/clinics/{clinic_id}/reconciliation/1999-01-01")
    assert not_found_res.status_code == 404
    assert "No billing data found" in not_found_res.json()["detail"]


def test_api_on_the_fly_narrative():
    """Tests POST /api/narrative on-the-fly generation."""
    payload = {
        "clinic_name": "Test Clinic",
        "date": "2026-07-27",
        "reconciliation": {
            "total_billed_paise": 1000000,
            "total_collected_paise": 900000,
            "total_outstanding_paise": 100000,
            "total_refunds_paise": 0,
            "total_visits": 5,
            "pending_visits_count": 1,
            "refund_visits_count": 0,
        },
        "analytics": {
            "peak_hour": "11am",
            "peak_hour_interval": "11am–12pm",
            "peak_revenue_paise": 400000,
            "top_medicines_by_quantity": [{"drug_name": "PARACETAMOL", "qty": 10}],
            "top_medicines_by_revenue": [{"drug_name": "PARACETAMOL", "revenue_paise": 400000}],
        },
    }
    response = client.post("/api/narrative", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["is_grounded"] is True
    assert "₹10,000" in res_data["whatsapp_message"]


def test_record_single_transaction_api():
    """Tests POST /api/clinics/{clinic_id}/transactions appends and recalculates correctly."""
    clinic_id = "CLN-TEST-TX-001"
    date_str = "2026-07-29"

    tx_payload = {
        "date": date_str,
        "clinic_name": "Test Clinic Single Tx",
        "transaction": {
            "visit_id": "V-SINGLE-01",
            "doctor_id": "DOC-99",
            "timestamp": "2026-07-29T10:00:00Z",
            "payment_mode": "upi",
            "amount_paid_paise": 50000,
            "discount_paise": 0,
            "is_refund": False,
            "line_items": [
                {"drug_name": "AZITHROMYCIN", "qty": 1, "unit_price_paise": 50000}
            ],
        },
    }

    res = client.post(f"/api/clinics/{clinic_id}/transactions", json=tx_payload)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["valid_records_count"] == 1
    assert data["reconciliation"]["total_billed_paise"] == 50000
    assert data["reconciliation"]["total_collected_paise"] == 50000
    assert data["analytics"]["top_medicines_by_quantity"][0]["drug_name"] == "AZITHROMYCIN"

