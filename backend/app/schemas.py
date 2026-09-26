from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class PaymentMode(str, Enum):
    """Supported payment modes for clinic transactions."""
    cash = "cash"
    card = "card"
    upi = "upi"

    @classmethod
    def _missing_(cls, value: Any):
        if isinstance(value, str):
            val_lower = value.strip().lower()
            for member in cls:
                if member.value == val_lower:
                    return member
        return None


class LineItem(BaseModel):
    """Individual line item representing a prescribed/dispensed medication."""
    drug_name: str = Field(
        ...,
        min_length=1,
        description="Name of the prescribed drug or medication",
    )
    qty: int = Field(
        ...,
        ge=1,
        description="Quantity dispensed, must be an integer >= 1",
    )
    unit_price_paise: int = Field(
        ...,
        ge=0,
        description="Unit price in integer paise, must be >= 0",
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_line_item(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            if "qty" not in d:
                if "quantity" in d:
                    d["qty"] = d["quantity"]
                elif "count" in d:
                    d["qty"] = d["count"]
            if "unit_price_paise" not in d:
                if "price_paise" in d:
                    d["unit_price_paise"] = d["price_paise"]
                elif "unit_price" in d:
                    val = d["unit_price"]
                    d["unit_price_paise"] = int(val * 100) if isinstance(val, float) else int(val)
                elif "price" in d:
                    val = d["price"]
                    d["unit_price_paise"] = int(val * 100) if isinstance(val, float) else int(val)
            return d
        return data

    @field_validator("drug_name")
    @classmethod
    def validate_drug_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("drug_name cannot be blank or empty")
        return cleaned

    @property
    def total_price_paise(self) -> int:
        """Total price for this line item in paise."""
        return self.qty * self.unit_price_paise


class TransactionRow(BaseModel):
    """Raw billing log transaction record for a clinic visit."""
    clinic_id: str = Field(..., min_length=1, description="Unique clinic identifier")
    visit_id: str = Field(..., min_length=1, description="Unique visit identifier")
    timestamp: datetime = Field(..., description="ISO 8601 timestamp of transaction in UTC")
    doctor_id: Optional[str] = Field(None, description="Doctor identifier (optional)")
    line_items: List[LineItem] = Field(default_factory=list, description="Array of line items")
    payment_mode: PaymentMode = Field(..., description="Payment mode: cash, card, or upi")
    amount_paid_paise: int = Field(..., description="Amount collected or refunded in integer paise")
    discount_paise: int = Field(default=0, ge=0, description="Discount given in integer paise (>= 0)")
    is_refund: bool = Field(default=False, description="Flag indicating if this transaction is a refund")

    @model_validator(mode="before")
    @classmethod
    def normalize_transaction_row(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            if not d.get("clinic_id"):
                d["clinic_id"] = "CLN-KNP-014"
            if not d.get("visit_id"):
                if d.get("bill_id"):
                    d["visit_id"] = str(d["bill_id"])
                elif d.get("id"):
                    d["visit_id"] = str(d["id"])
                elif d.get("transaction_id"):
                    d["visit_id"] = str(d["transaction_id"])
            if "line_items" not in d and "items" in d:
                d["line_items"] = d["items"]
            if "payment_mode" not in d and "mode" in d:
                d["payment_mode"] = d["mode"]
            if "timestamp" not in d or not d["timestamp"]:
                d["timestamp"] = datetime.now().isoformat()
            elif isinstance(d["timestamp"], str) and len(d["timestamp"]) == 10:
                d["timestamp"] = f"{d['timestamp']}T12:00:00"
            return d
        return data

    @field_validator("clinic_id", "visit_id")
    @classmethod
    def validate_non_empty_ids(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Identifier cannot be empty or whitespace")
        return cleaned

    @model_validator(mode="after")
    def validate_refund_and_amounts(self) -> "TransactionRow":
        """
        Validates business invariants:
        - If is_refund is True, amount_paid_paise must be negative or zero.
        - If is_refund is False, amount_paid_paise must be >= 0.
        - discount_paise cannot be negative.
        """
        if self.is_refund:
            if self.amount_paid_paise > 0:
                raise ValueError("amount_paid_paise must be negative or zero for a refund transaction")
        else:
            if self.amount_paid_paise < 0:
                raise ValueError("amount_paid_paise cannot be negative for a non-refund transaction")

        if self.discount_paise < 0:
            raise ValueError("discount_paise must be non-negative")

        return self

    @property
    def gross_line_items_paise(self) -> int:
        """Sum of all line items (qty * unit_price_paise) in paise."""
        return sum(item.total_price_paise for item in self.line_items)

    @property
    def billed_paise(self) -> int:
        """
        Net billed amount owed by the patient for this visit.
        Refunds are not new billings (0 paise).
        Sales are gross line items less discounts, bounded below by 0.
        """
        if self.is_refund:
            return 0
        return max(0, self.gross_line_items_paise - self.discount_paise)

    @property
    def collected_paise(self) -> int:
        """
        Actual money collected for sales in this visit.
        For refunds, money collected is 0 (refund amount is tracked separately).
        """
        if self.is_refund:
            return 0
        return max(0, self.amount_paid_paise)

    @property
    def refund_paise(self) -> int:
        """
        Money disbursed back to customer for refund transactions in integer paise (positive).
        """
        if not self.is_refund:
            return 0
        return abs(self.amount_paid_paise)

    @property
    def outstanding_paise(self) -> int:
        """
        Unpaid balance on this visit (billed - collected).
        Only applies to sales (non-refunds).
        """
        if self.is_refund:
            return 0
        return max(0, self.billed_paise - self.collected_paise)


# ---------------------------------------------------------------------------
# Output / Reporting Schemas
# ---------------------------------------------------------------------------

class PaymentModeBreakdown(BaseModel):
    """Reconciliation metrics split by payment mode."""
    billed_paise: int = 0
    collected_paise: int = 0
    outstanding_paise: int = 0
    refunds_paise: int = 0


class VisitReconciliationItem(BaseModel):
    """Detailed reconciliation breakdown for a single visit."""
    visit_id: str
    clinic_id: str
    timestamp: str
    payment_mode: str
    billed_paise: int
    paid_paise: int
    collected_paise: int
    outstanding_paise: int
    refund_paise: int
    discount_paise: int
    is_refund: bool


class EODReconciliationResponse(BaseModel):
    """Complete EOD reconciliation report."""
    total_billed_paise: int
    total_collected_paise: int
    total_outstanding_paise: int
    total_refunds_paise: int
    net_collected_paise: int
    total_visits: int
    pending_visits_count: int
    refund_visits_count: int
    by_payment_mode: Dict[str, PaymentModeBreakdown]
    per_visit: List[VisitReconciliationItem]


class HourlyRevenue(BaseModel):
    """Revenue metrics for a single hour of the day."""
    hour: int
    hour_label: str
    interval_label: str
    revenue_paise: int
    collected_paise: int
    billed_paise: int
    refund_paise: int
    transaction_count: int


class MedicineQtyRanking(BaseModel):
    """Medicine movement ranked by quantity dispensed."""
    drug_name: str
    qty: int


class MedicineRevenueRanking(BaseModel):
    """Medicine movement ranked by revenue generated."""
    drug_name: str
    revenue_paise: int


class AnalyticsResponse(BaseModel):
    """Complete clinic analytics report."""
    hourly_revenue: Dict[str, int]
    hourly_breakdown: List[HourlyRevenue]
    peak_hour: Optional[str]
    peak_hour_interval: Optional[str]
    peak_revenue_paise: int
    top_medicines_by_quantity: List[MedicineQtyRanking]
    top_medicines_by_revenue: List[MedicineRevenueRanking]


class IngestionRowError(BaseModel):
    """Actionable validation error for a rejected row in raw billing log."""
    row_index: int
    visit_id: Optional[str] = None
    error: str
    field_errors: Optional[List[Dict[str, Any]]] = None
