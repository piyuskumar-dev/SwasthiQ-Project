"""FastAPI Application for SwasthiQ EOD Billing & Analytics Agent.

Provides complete REST endpoints for:
- Deterministic EOD reconciliation and analytics computation.
- Database persistence (SQLite) with strict state consistency upon update.
- Grounded AI WhatsApp narrative summaries with traced figures.
- Actionable HTTP error handling for invalid or malformed logs.
"""

import os
from dotenv import load_dotenv

load_dotenv()
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Path, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .deterministic import (
    compute_analytics,
    compute_eod_reconciliation,
    parse_and_validate_billing_log,
)
from .narrative import (
    NarrativeResponse,
    generate_narrative_summary,
)
from .schemas import (
    AnalyticsResponse,
    EODReconciliationResponse,
    TransactionRow,
)
from contextlib import asynccontextmanager
from .storage import db_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-seeds default sample days on startup so they are always available."""
    db_manager.seed_default_samples()
    yield


app = FastAPI(
    title="SwasthiQ EOD Billing & Analytics API",
    description="Deterministic ingestion, persistence, reconciliation, analytics, and narrative summaries for clinic daily billing logs.",
    version="2.0.0",
    lifespan=lifespan,
)

CORS_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.netlify\.app|.*\.onrender\.com)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestLogPayload(BaseModel):
    """Payload for ingesting a clinic billing log."""
    clinic_name: Optional[str] = "Mehta Multi-Specialty Clinic"
    records: List[Dict[str, Any]] = Field(
        ...,
        description="Array of visit records",
        json_schema_extra={
            "example": [
                {
                    "visit_id": "VST-1001",
                    "timestamp": "2026-07-28T10:30:00Z",
                    "payment_mode": "cash",
                    "amount_paid_paise": 40000,
                    "discount_paise": 0,
                    "is_refund": False,
                    "line_items": [
                        {
                            "drug_name": "Paracetamol 650mg",
                            "qty": 1,
                            "unit_price_paise": 40000,
                        }
                    ],
                }
            ]
        },
    )


class SingleTransactionPayload(BaseModel):
    """Payload for recording a single clinic transaction/payment."""
    date: str = Field(..., description="Billing date in YYYY-MM-DD format", json_schema_extra={"example": "2026-07-28"})
    clinic_name: Optional[str] = "Mehta Multi-Specialty Clinic"
    transaction: Dict[str, Any] = Field(
        ...,
        description="Single transaction record",
        json_schema_extra={
            "example": {
                "visit_id": "VST-2001",
                "doctor_id": "DOC-001",
                "timestamp": "2026-07-28T11:30:00Z",
                "payment_mode": "upi",
                "amount_paid_paise": 65000,
                "discount_paise": 5000,
                "is_refund": False,
                "line_items": [
                    {
                        "drug_name": "Amoxicillin 500mg",
                        "qty": 2,
                        "unit_price_paise": 35000,
                    }
                ],
            }
        },
    )


class GenerateNarrativePayload(BaseModel):
    """Payload for generating on-the-fly narrative summary."""
    clinic_name: str = "Mehta Multi-Specialty Clinic"
    date: str = ""
    reconciliation: Dict[str, Any]
    analytics: Dict[str, Any]


@app.get("/health", tags=["System"])
def health_check() -> Dict[str, Any]:
    """Health check endpoint confirming API availability."""
    return {
        "status": "healthy",
        "service": "swasthiq-eod-agent",
        "version": "2.0.0",
    }


@app.get("/", tags=["System"])
def root() -> Dict[str, Any]:
    """Root info endpoint."""
    return {
        "message": "SwasthiQ EOD Billing & Analytics Agent API",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/api/clinics", tags=["Clinics"])
def list_clinics() -> Dict[str, Any]:
    """Lists all registered clinics."""
    clinics = db_manager.list_clinics()
    return {"clinics": clinics}


@app.get("/api/clinics/{clinic_id}/dates", tags=["Clinics"])
def list_clinic_dates(
    clinic_id: str = Path(..., description="Clinic identifier e.g. CLN-KNP-014")
) -> Dict[str, Any]:
    """Lists all available ingested dates for a clinic."""
    dates = db_manager.list_dates_for_clinic(clinic_id)
    return {"clinic_id": clinic_id, "dates": dates}


@app.post(
    "/api/clinics/{clinic_id}/billing-logs/{date}",
    tags=["Billing Logs & Ingestion"],
    summary="Ingest or update a daily billing log atomically",
)
def ingest_billing_log(
    clinic_id: str = Path(..., description="Clinic ID e.g. CLN-KNP-014"),
    date: str = Path(..., description="Billing date in YYYY-MM-DD format"),
    payload: IngestLogPayload = ...,
) -> Dict[str, Any]:
    """
    Ingests or updates a clinic's daily billing log.
    Ensures data consistency upon update via atomic SQLite upsert.
    """
    if payload.records is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Billing log payload records cannot be null.",
        )

    result = db_manager.save_billing_log(
        clinic_id=clinic_id,
        date_str=date,
        raw_records=payload.records,
        clinic_name=payload.clinic_name,
    )

    return {
        "status": "success" if result["rejected_records_count"] == 0 else "partial_success",
        "message": f"Billing log for clinic '{clinic_id}' on {date} saved successfully.",
        "data": result,
    }


@app.post(
    "/api/clinics/{clinic_id}/transactions",
    tags=["Billing Logs & Ingestion"],
    summary="Record a single transaction/payment and recalculate EOD reports atomically",
)
def record_transaction(
    clinic_id: str = Path(..., description="Clinic ID e.g. CLN-KNP-014"),
    payload: SingleTransactionPayload = ...,
) -> Dict[str, Any]:
    """
    Appends a new billing transaction to the clinic's log for the given date.
    Recalculates deterministic reconciliation and analytics immediately.
    """
    tx_data = dict(payload.transaction)
    tx_data["clinic_id"] = clinic_id
    if not tx_data.get("timestamp"):
        tx_data["timestamp"] = f"{payload.date}T12:00:00Z"

    result = db_manager.append_transaction(
        clinic_id=clinic_id,
        date_str=payload.date,
        transaction=tx_data,
        clinic_name=payload.clinic_name,
    )

    return {
        "status": "success" if result["rejected_records_count"] == 0 else "partial_success",
        "message": f"Transaction recorded for clinic '{clinic_id}' on {payload.date}.",
        "data": result,
    }



@app.get(
    "/api/clinics/{clinic_id}/billing-logs/{date}",
    tags=["Billing Logs & Ingestion"],
    summary="Retrieve stored billing log with full EOD report",
)
def get_stored_billing_log(
    clinic_id: str = Path(..., description="Clinic ID"),
    date: str = Path(..., description="Billing date YYYY-MM-DD"),
) -> Dict[str, Any]:
    """Retrieves stored billing log and deterministic outputs for a clinic date."""
    log_data = db_manager.get_billing_log(clinic_id, date)
    if not log_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No billing log found for clinic '{clinic_id}' on date '{date}'.",
        )
    return log_data


@app.get(
    "/api/clinics/{clinic_id}/reconciliation/{date}",
    response_model=EODReconciliationResponse,
    tags=["Deterministic EOD"],
    summary="Get EOD reconciliation for a specific clinic date",
)
def get_clinic_reconciliation(
    clinic_id: str = Path(...),
    date: str = Path(...),
) -> EODReconciliationResponse:
    """Returns stored deterministic EOD reconciliation for a clinic on a given date."""
    log_data = db_manager.get_billing_log(clinic_id, date)
    if not log_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No billing data found for clinic '{clinic_id}' on date '{date}'.",
        )
    return EODReconciliationResponse(**log_data["reconciliation"])


@app.get(
    "/api/clinics/{clinic_id}/analytics/{date}",
    response_model=AnalyticsResponse,
    tags=["Deterministic Analytics"],
    summary="Get analytics for a specific clinic date",
)
def get_clinic_analytics(
    clinic_id: str = Path(...),
    date: str = Path(...),
) -> AnalyticsResponse:
    """Returns stored deterministic analytics for a clinic on a given date."""
    log_data = db_manager.get_billing_log(clinic_id, date)
    if not log_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No billing data found for clinic '{clinic_id}' on date '{date}'.",
        )
    return AnalyticsResponse(**log_data["analytics"])


@app.get(
    "/api/clinics/{clinic_id}/narrative/{date}",
    response_model=NarrativeResponse,
    tags=["Narrative Layer"],
    summary="Generate grounded WhatsApp narrative summary for a stored clinic date",
)
def get_clinic_narrative(
    clinic_id: str = Path(...),
    date: str = Path(...),
) -> NarrativeResponse:
    """
    Generates an owner-facing WhatsApp summary with verified numerical tracing.
    Every figure maps directly back to the deterministic report.
    """
    log_data = db_manager.get_billing_log(clinic_id, date)
    if not log_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No billing data found for clinic '{clinic_id}' on date '{date}'.",
        )

    clinic_name = f"Clinic {clinic_id}"
    clinics = db_manager.list_clinics()
    for c in clinics:
        if c["clinic_id"] == clinic_id and c.get("name"):
            clinic_name = c["name"]
            break

    narrative = generate_narrative_summary(
        reconciliation=log_data["reconciliation"],
        analytics=log_data["analytics"],
        clinic_name=clinic_name,
        date_str=date,
    )
    return narrative


@app.post(
    "/api/narrative",
    response_model=NarrativeResponse,
    tags=["Narrative Layer"],
    summary="Generate grounded WhatsApp summary from reconciliation and analytics",
)
def generate_narrative_endpoint(payload: GenerateNarrativePayload) -> NarrativeResponse:
    """Generates a grounded narrative summary on-the-fly from input reports."""
    narrative = generate_narrative_summary(
        reconciliation=payload.reconciliation,
        analytics=payload.analytics,
        clinic_name=payload.clinic_name,
        date_str=payload.date,
    )
    return narrative


@app.post(
    "/api/reconcile",
    response_model=EODReconciliationResponse,
    tags=["Deterministic EOD"],
    summary="Compute deterministic EOD reconciliation from validated transactions",
)
def reconcile_endpoint(transactions: List[TransactionRow]) -> EODReconciliationResponse:
    """Computes EOD reconciliation from validated transaction rows in-memory."""
    reconciliation = compute_eod_reconciliation(transactions)
    return EODReconciliationResponse(**reconciliation)


@app.post(
    "/api/analytics",
    response_model=AnalyticsResponse,
    tags=["Deterministic Analytics"],
    summary="Compute deterministic analytics from validated transactions",
)
def analytics_endpoint(transactions: List[TransactionRow]) -> AnalyticsResponse:
    """Computes deterministic analytics from validated transaction rows in-memory."""
    analytics = compute_analytics(transactions)
    return AnalyticsResponse(**analytics)


@app.post(
    "/api/eod-report",
    tags=["Ingestion & Reporting"],
    summary="Process raw billing log JSON, validate, reconcile, and generate analytics",
)
def process_eod_report(raw_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Ingests raw billing log records, reports malformed rows, and computes EOD outputs."""
    if not isinstance(raw_records, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Billing log payload must be a JSON array of visit records.",
        )

    valid_transactions, rejected_errors = parse_and_validate_billing_log(
        raw_records,
        strict=False,
    )

    reconciliation = compute_eod_reconciliation(valid_transactions)
    analytics = compute_analytics(valid_transactions)

    return {
        "status": "success" if not rejected_errors else "partial_success",
        "total_records_ingested": len(raw_records),
        "valid_records_count": len(valid_transactions),
        "rejected_records_count": len(rejected_errors),
        "rejected_errors": rejected_errors,
        "reconciliation": reconciliation,
        "analytics": analytics,
    }
