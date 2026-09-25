"""Unit tests for SwasthiQ EOD Billing & Analytics Agent Deterministic Layer.

Covers:
1. Happy path day with multiple transactions across payment modes (cash, card, upi).
2. Edge case 1: Non-happy path day with partial payments and refunds.
3. Edge case 2: Validation errors (invalid types, positive refund amounts, negative prices/quantities).
4. Analytics: Hourly bucketing, peak hour identification, and distinct rankings for quantity vs revenue.
5. Ingestion of real sample billing dataset (including malformed row detection & empty day).
6. FastAPI REST endpoints verification.
"""

import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
WORKSPACE_ROOT = BACKEND_DIR.parent

for p in [str(WORKSPACE_ROOT), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

try:
    from backend.app.schemas import LineItem, PaymentMode, TransactionRow
    from backend.app.deterministic import (
        compute_analytics,
        compute_eod_reconciliation,
        format_hour_interval,
        format_hour_label,
        parse_and_validate_billing_log,
    )
    from backend.app.main import app
except ImportError:
    from app.schemas import LineItem, PaymentMode, TransactionRow
    from app.deterministic import (
        compute_analytics,
        compute_eod_reconciliation,
        format_hour_interval,
        format_hour_label,
        parse_and_validate_billing_log,
    )
    from app.main import app


client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures / Helper Data
# ---------------------------------------------------------------------------

@pytest.fixture
def happy_path_transactions():
    """
    A typical happy-path clinic day with multiple visits:
    - Paid in full
    - Across cash, card, and upi
    - Normal discounts
    """
    return [
        TransactionRow(
            clinic_id="CLN-TEST-001",
            visit_id="V-001",
            timestamp=datetime(2026, 7, 27, 9, 30, tzinfo=timezone.utc),
            doctor_id="DOC-1",
            line_items=[
                LineItem(drug_name="PARACETAMOL", qty=5, unit_price_paise=2000),  # 10,000 paise
            ],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=10000,
            discount_paise=0,
            is_refund=False,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-001",
            visit_id="V-002",
            timestamp=datetime(2026, 7, 27, 10, 15, tzinfo=timezone.utc),
            doctor_id="DOC-1",
            line_items=[
                LineItem(drug_name="ATORVASTATIN", qty=2, unit_price_paise=12000),  # 24,000 paise
            ],
            payment_mode=PaymentMode.card,
            amount_paid_paise=22000,
            discount_paise=2000,  # net billed = 22,000 paise
            is_refund=False,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-001",
            visit_id="V-003",
            timestamp=datetime(2026, 7, 27, 12, 0, tzinfo=timezone.utc),
            doctor_id="DOC-2",
            line_items=[
                LineItem(drug_name="AMOXICILLIN", qty=3, unit_price_paise=6000),  # 18,000 paise
                LineItem(drug_name="OMEPRAZOLE", qty=2, unit_price_paise=4000),   # 8,000 paise
            ],
            payment_mode=PaymentMode.upi,
            amount_paid_paise=26000,
            discount_paise=0,
            is_refund=False,
        ),
    ]


@pytest.fixture
def non_happy_path_transactions():
    """
    Edge Case 1: Non-happy path day with partial payments and refunds:
    - V-101: Cash, billed 10,000, paid 6,000 (4,000 outstanding)
    - V-102: Card, billed 30,000, paid 30,000 (0 outstanding)
    - V-103: UPI, billed 15,000, discount 1,000, paid 12,000 (2,000 outstanding)
    - V-104: Card Refund, paid -8,000, is_refund=True
    - V-105: Cash Refund, paid -3,000, is_refund=True
    """
    return [
        TransactionRow(
            clinic_id="CLN-TEST-002",
            visit_id="V-101",
            timestamp=datetime(2026, 7, 27, 10, 0, tzinfo=timezone.utc),
            doctor_id="DOC-1",
            line_items=[
                LineItem(drug_name="PARACETAMOL", qty=5, unit_price_paise=2000),  # 10,000 paise
            ],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=6000,
            discount_paise=0,
            is_refund=False,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-002",
            visit_id="V-102",
            timestamp=datetime(2026, 7, 27, 11, 0, tzinfo=timezone.utc),
            doctor_id="DOC-2",
            line_items=[
                LineItem(drug_name="ATORVASTATIN", qty=2, unit_price_paise=15000),  # 30,000 paise
            ],
            payment_mode=PaymentMode.card,
            amount_paid_paise=30000,
            discount_paise=0,
            is_refund=False,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-002",
            visit_id="V-103",
            timestamp=datetime(2026, 7, 27, 14, 0, tzinfo=timezone.utc),
            doctor_id="DOC-1",
            line_items=[
                LineItem(drug_name="AMOXICILLIN", qty=2, unit_price_paise=7500),  # 15,000 paise
            ],
            payment_mode=PaymentMode.upi,
            amount_paid_paise=12000,
            discount_paise=1000,  # net billed = 14,000, paid 12,000 -> 2,000 outstanding
            is_refund=False,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-002",
            visit_id="V-104",
            timestamp=datetime(2026, 7, 27, 15, 0, tzinfo=timezone.utc),
            doctor_id="DOC-1",
            line_items=[
                LineItem(drug_name="ATORVASTATIN", qty=1, unit_price_paise=8000),
            ],
            payment_mode=PaymentMode.card,
            amount_paid_paise=-8000,
            discount_paise=0,
            is_refund=True,
        ),
        TransactionRow(
            clinic_id="CLN-TEST-002",
            visit_id="V-105",
            timestamp=datetime(2026, 7, 27, 16, 0, tzinfo=timezone.utc),
            doctor_id="DOC-2",
            line_items=[
                LineItem(drug_name="PARACETAMOL", qty=1, unit_price_paise=3000),
            ],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=-3000,
            discount_paise=0,
            is_refund=True,
        ),
    ]


# ---------------------------------------------------------------------------
# 1. Happy Path Tests
# ---------------------------------------------------------------------------

def test_happy_path_reconciliation(happy_path_transactions):
    """Verifies complete reconciliation calculation on a normal day with zero debt and zero refunds."""
    result = compute_eod_reconciliation(happy_path_transactions)

    assert result["total_billed_paise"] == 58000
    assert result["total_collected_paise"] == 58000
    assert result["total_outstanding_paise"] == 0
    assert result["total_refunds_paise"] == 0
    assert result["net_collected_paise"] == 58000

    assert result["total_visits"] == 3
    assert result["pending_visits_count"] == 0
    assert result["refund_visits_count"] == 0

    modes = result["by_payment_mode"]
    assert modes["cash"]["billed_paise"] == 10000
    assert modes["cash"]["collected_paise"] == 10000
    assert modes["cash"]["outstanding_paise"] == 0

    assert modes["card"]["billed_paise"] == 22000
    assert modes["card"]["collected_paise"] == 22000
    assert modes["card"]["outstanding_paise"] == 0

    assert modes["upi"]["billed_paise"] == 26000
    assert modes["upi"]["collected_paise"] == 26000
    assert modes["upi"]["outstanding_paise"] == 0


def test_happy_path_analytics(happy_path_transactions):
    """Verifies hourly revenue bucketing, peak hour, and distinct rankings for qty vs revenue."""
    result = compute_analytics(happy_path_transactions)

    hourly = result["hourly_revenue"]
    assert len(hourly) == 24
    assert hourly["9am"] == 10000
    assert hourly["10am"] == 22000
    assert hourly["12pm"] == 26000
    assert hourly["1pm"] == 0

    assert result["peak_hour"] == "12pm"
    assert result["peak_hour_interval"] == "12pm–1pm"
    assert result["peak_revenue_paise"] == 26000

    top_qty = result["top_medicines_by_quantity"]
    assert top_qty[0]["drug_name"] == "PARACETAMOL"
    assert top_qty[0]["qty"] == 5
    assert top_qty[1]["drug_name"] == "AMOXICILLIN"
    assert top_qty[1]["qty"] == 3

    top_rev = result["top_medicines_by_revenue"]
    assert top_rev[0]["drug_name"] == "ATORVASTATIN"
    assert top_rev[0]["revenue_paise"] == 24000
    assert top_rev[1]["drug_name"] == "AMOXICILLIN"
    assert top_rev[1]["revenue_paise"] == 18000
    assert top_rev[2]["drug_name"] == "PARACETAMOL"
    assert top_rev[2]["revenue_paise"] == 10000

    assert top_qty[0]["drug_name"] != top_rev[0]["drug_name"]


# ---------------------------------------------------------------------------
# 2. Edge Case 1: Non-Happy Path (Partial Payments + Refunds)
# ---------------------------------------------------------------------------

def test_edge_case_partial_payments_and_refunds(non_happy_path_transactions):
    """
    Tests edge case with:
    - Multiple partial payments resulting in outstanding amounts
    - Multiple refunds across different payment modes
    - Attribution of outstanding debt per visit
    """
    result = compute_eod_reconciliation(non_happy_path_transactions)

    assert result["total_billed_paise"] == 54000
    assert result["total_collected_paise"] == 48000
    assert result["total_outstanding_paise"] == 6000
    assert result["total_refunds_paise"] == 11000
    assert result["net_collected_paise"] == 48000 - 11000

    assert result["total_visits"] == 3
    assert result["pending_visits_count"] == 2
    assert result["refund_visits_count"] == 2

    modes = result["by_payment_mode"]

    assert modes["cash"]["billed_paise"] == 10000
    assert modes["cash"]["collected_paise"] == 6000
    assert modes["cash"]["outstanding_paise"] == 4000
    assert modes["cash"]["refunds_paise"] == 3000

    assert modes["card"]["billed_paise"] == 30000
    assert modes["card"]["collected_paise"] == 30000
    assert modes["card"]["outstanding_paise"] == 0
    assert modes["card"]["refunds_paise"] == 8000

    assert modes["upi"]["billed_paise"] == 14000
    assert modes["upi"]["collected_paise"] == 12000
    assert modes["upi"]["outstanding_paise"] == 2000
    assert modes["upi"]["refunds_paise"] == 0

    per_visit = {v["visit_id"]: v for v in result["per_visit"]}
    assert per_visit["V-101"]["outstanding_paise"] == 4000
    assert per_visit["V-103"]["outstanding_paise"] == 2000
    assert per_visit["V-104"]["refund_paise"] == 8000
    assert per_visit["V-105"]["refund_paise"] == 3000


# ---------------------------------------------------------------------------
# 3. Edge Case 2: Validation Errors (Invalid Types & Positive Refunds)
# ---------------------------------------------------------------------------

def test_refund_with_positive_amount_raises_validation_error():
    """Enforces that is_refund=True with a positive amount_paid_paise raises a ValidationError."""
    with pytest.raises(ValidationError) as excinfo:
        TransactionRow(
            clinic_id="CLN-001",
            visit_id="V-ERR-01",
            timestamp=datetime.now(timezone.utc),
            line_items=[LineItem(drug_name="PARACETAMOL", qty=1, unit_price_paise=2000)],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=2000,
            discount_paise=0,
            is_refund=True,
        )
    assert "amount_paid_paise must be negative or zero for a refund" in str(excinfo.value)


def test_non_refund_with_negative_amount_raises_validation_error():
    """Enforces that is_refund=False with a negative amount_paid_paise raises a ValidationError."""
    with pytest.raises(ValidationError) as excinfo:
        TransactionRow(
            clinic_id="CLN-001",
            visit_id="V-ERR-02",
            timestamp=datetime.now(timezone.utc),
            line_items=[LineItem(drug_name="PARACETAMOL", qty=1, unit_price_paise=2000)],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=-2000,
            discount_paise=0,
            is_refund=False,
        )
    assert "amount_paid_paise cannot be negative for a non-refund" in str(excinfo.value)


def test_invalid_payment_mode_raises_validation_error():
    """Enforces that unsupported payment modes raise ValidationError."""
    with pytest.raises(ValidationError):
        TransactionRow.model_validate({
            "clinic_id": "CLN-001",
            "visit_id": "V-ERR-03",
            "timestamp": "2026-07-27T10:00:00Z",
            "line_items": [{"drug_name": "PARACETAMOL", "qty": 1, "unit_price_paise": 2000}],
            "payment_mode": "crypto",
            "amount_paid_paise": 2000,
            "is_refund": False,
        })


def test_line_item_invalid_quantity_and_price():
    """Enforces quantity >= 1 and unit_price_paise >= 0."""
    with pytest.raises(ValidationError):
        LineItem(drug_name="PARACETAMOL", qty=0, unit_price_paise=2000)

    with pytest.raises(ValidationError):
        LineItem(drug_name="PARACETAMOL", qty=-2, unit_price_paise=2000)

    with pytest.raises(ValidationError):
        LineItem(drug_name="PARACETAMOL", qty=1, unit_price_paise=-500)

    with pytest.raises(ValidationError):
        LineItem(drug_name="   ", qty=1, unit_price_paise=500)


def test_negative_discount_raises_validation_error():
    """Enforces that discount_paise cannot be negative."""
    with pytest.raises(ValidationError):
        TransactionRow(
            clinic_id="CLN-001",
            visit_id="V-ERR-04",
            timestamp=datetime.now(timezone.utc),
            line_items=[LineItem(drug_name="PARACETAMOL", qty=1, unit_price_paise=2000)],
            payment_mode=PaymentMode.cash,
            amount_paid_paise=2000,
            discount_paise=-500,
            is_refund=False,
        )


# ---------------------------------------------------------------------------
# 4. Empty Day & Edge Cases
# ---------------------------------------------------------------------------

def test_empty_transaction_list_handling():
    """Ensures empty transaction list returns cleanly without division-by-zero or crashes."""
    rec = compute_eod_reconciliation([])
    assert rec["total_billed_paise"] == 0
    assert rec["total_collected_paise"] == 0
    assert rec["total_outstanding_paise"] == 0
    assert rec["total_refunds_paise"] == 0
    assert rec["total_visits"] == 0
    assert rec["pending_visits_count"] == 0
    assert rec["refund_visits_count"] == 0
    assert "cash" in rec["by_payment_mode"]

    ana = compute_analytics([])
    assert len(ana["hourly_revenue"]) == 24
    assert ana["peak_hour"] is None
    assert ana["peak_revenue_paise"] == 0
    assert ana["top_medicines_by_quantity"] == []
    assert ana["top_medicines_by_revenue"] == []


def test_hour_formatting_helpers():
    """Tests 12-hour clock label formatting."""
    assert format_hour_label(0) == "12am"
    assert format_hour_label(9) == "9am"
    assert format_hour_label(12) == "12pm"
    assert format_hour_label(13) == "1pm"
    assert format_hour_label(23) == "11pm"

    assert format_hour_interval(12) == "12pm–1pm"
    assert format_hour_interval(23) == "11pm–12am"


# ---------------------------------------------------------------------------
# 5. Ingestion with Sample Dataset (Real Files)
# ---------------------------------------------------------------------------

def test_sample_dataset_2026_07_27():
    """
    Tests against real billing_log_2026-07-27.json:
    - 19 raw rows
    - Row 19 is missing payment_mode -> rejected with actionable error
    - Exactly 18 valid visits reconciled
    - Exactly 3 pending visits with 1,800 paise outstanding
    - Top medicine by qty: OMEPRAZOLE (18)
    - Top medicine by revenue: ATORVASTATIN (120,000 paise)
    """
    zip_path = None
    for candidate in [
        WORKSPACE_ROOT / "swasthiq_sample_billing_dataset.zip",
        Path("swasthiq_sample_billing_dataset.zip"),
    ]:
        if candidate.exists():
            zip_path = candidate
            break

    if not zip_path:
        pytest.skip("swasthiq_sample_billing_dataset.zip not found")

    with zipfile.ZipFile(zip_path) as z:
        raw_data = json.loads(z.read("billing_log_2026-07-27.json").decode("utf-8"))

    valid_txs, errors = parse_and_validate_billing_log(raw_data, strict=False)

    assert len(raw_data) == 19
    assert len(valid_txs) == 18
    assert len(errors) == 1
    assert errors[0]["visit_id"] == "V-20260727-019"
    assert "payment_mode" in errors[0]["error"]

    reconciliation = compute_eod_reconciliation(valid_txs)
    assert reconciliation["total_visits"] == 18
    assert reconciliation["pending_visits_count"] == 3
    assert reconciliation["total_outstanding_paise"] == 1800
    assert reconciliation["total_billed_paise"] == 319000
    assert reconciliation["total_collected_paise"] == 317200
    assert reconciliation["total_refunds_paise"] == 0

    analytics = compute_analytics(valid_txs)
    assert analytics["top_medicines_by_quantity"][0]["drug_name"] == "OMEPRAZOLE"
    assert analytics["top_medicines_by_quantity"][0]["qty"] == 18
    assert analytics["top_medicines_by_revenue"][0]["drug_name"] == "ATORVASTATIN"
    assert analytics["top_medicines_by_revenue"][0]["revenue_paise"] == 120000


def test_sample_dataset_2026_07_25_all_refunds():
    """
    Tests against real billing_log_2026-07-25.json:
    - 3 refund visits totaling 49,000 paise
    - 0 billed, 0 collected, 0 outstanding
    """
    zip_path = None
    for candidate in [
        WORKSPACE_ROOT / "swasthiq_sample_billing_dataset.zip",
        Path("swasthiq_sample_billing_dataset.zip"),
    ]:
        if candidate.exists():
            zip_path = candidate
            break

    if not zip_path:
        pytest.skip("swasthiq_sample_billing_dataset.zip not found")

    with zipfile.ZipFile(zip_path) as z:
        raw_data = json.loads(z.read("billing_log_2026-07-25.json").decode("utf-8"))

    valid_txs, errors = parse_and_validate_billing_log(raw_data, strict=False)
    assert len(errors) == 0
    assert len(valid_txs) == 3

    reconciliation = compute_eod_reconciliation(valid_txs)
    assert reconciliation["total_billed_paise"] == 0
    assert reconciliation["total_collected_paise"] == 0
    assert reconciliation["total_outstanding_paise"] == 0
    assert reconciliation["total_refunds_paise"] == 49000
    assert reconciliation["refund_visits_count"] == 3


def test_sample_dataset_2026_07_26_empty_day():
    """Tests against real billing_log_2026-07-26.json: empty day."""
    zip_path = None
    for candidate in [
        WORKSPACE_ROOT / "swasthiq_sample_billing_dataset.zip",
        Path("swasthiq_sample_billing_dataset.zip"),
    ]:
        if candidate.exists():
            zip_path = candidate
            break

    if not zip_path:
        pytest.skip("swasthiq_sample_billing_dataset.zip not found")

    with zipfile.ZipFile(zip_path) as z:
        raw_data = json.loads(z.read("billing_log_2026-07-26.json").decode("utf-8"))

    valid_txs, errors = parse_and_validate_billing_log(raw_data, strict=False)
    assert len(valid_txs) == 0
    assert len(errors) == 0

    reconciliation = compute_eod_reconciliation(valid_txs)
    assert reconciliation["total_visits"] == 0
    assert reconciliation["total_billed_paise"] == 0


# ---------------------------------------------------------------------------
# 6. FastAPI REST Endpoints Tests
# ---------------------------------------------------------------------------

def test_api_health_endpoint():
    """Tests GET /health."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_eod_report_endpoint():
    """Tests POST /api/eod-report with raw payload containing valid and malformed rows."""
    payload = [
        {
            "clinic_id": "CLN-001",
            "visit_id": "V-001",
            "timestamp": "2026-07-27T10:00:00Z",
            "line_items": [{"drug_name": "PARACETAMOL", "qty": 2, "unit_price_paise": 2000}],
            "payment_mode": "cash",
            "amount_paid_paise": 4000,
            "discount_paise": 0,
            "is_refund": False,
        },
        {
            "clinic_id": "CLN-001",
            "visit_id": "V-BAD",
            "timestamp": "2026-07-27T11:00:00Z",
            "line_items": [{"drug_name": "OMEPRAZOLE", "qty": 1, "unit_price_paise": 4000}],
            "amount_paid_paise": 4000,
            "is_refund": False,
        },
    ]

    response = client.post("/api/eod-report", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "partial_success"
    assert data["total_records_ingested"] == 2
    assert data["valid_records_count"] == 1
    assert data["rejected_records_count"] == 1
    assert data["rejected_errors"][0]["visit_id"] == "V-BAD"
    assert data["reconciliation"]["total_billed_paise"] == 4000
    assert data["reconciliation"]["total_collected_paise"] == 4000
