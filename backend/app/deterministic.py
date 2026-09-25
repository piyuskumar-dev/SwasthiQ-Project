"""Deterministic calculation engine for EOD billing and clinic analytics.

CRITICAL INVARIANT:
This module contains zero LLM dependencies and performs all monetary calculations
strictly in integer paise to avoid IEEE-754 floating-point inaccuracies.
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple
from pydantic import ValidationError

from .schemas import PaymentMode, TransactionRow


def format_hour_label(hour: int) -> str:
    """
    Formats an integer hour (0-23) into standard 12-hour format:
    e.g. 0 -> '12am', 9 -> '9am', 12 -> '12pm', 13 -> '1pm', 23 -> '11pm'.
    """
    if hour == 0:
        return "12am"
    elif 1 <= hour < 12:
        return f"{hour}am"
    elif hour == 12:
        return "12pm"
    else:
        return f"{hour - 12}pm"


def format_hour_interval(hour: int) -> str:
    """
    Formats an integer hour into a 1-hour interval label:
    e.g. 12 -> '12pm–1pm', 9 -> '9am–10am', 23 -> '11pm–12am'.
    """
    start_label = format_hour_label(hour)
    end_label = format_hour_label((hour + 1) % 24)
    return f"{start_label}–{end_label}"


def compute_eod_reconciliation(transactions: List[TransactionRow]) -> dict:
    """
    Computes deterministic end-of-day reconciliation from validated transactions:
    - total_billed_paise: Gross sales less valid discounts.
    - total_collected_paise: Actual money received for sales.
    - total_outstanding_paise: Sum of unpaid balances per visit (billed - paid).
    - total_refunds_paise: Sum of refund amounts disbursed.
    - Splits each of these totals across payment modes: cash, card, upi.
    - Correctly attributes outstanding amounts per visit (billed - paid).
    """
    modes = [PaymentMode.cash.value, PaymentMode.card.value, PaymentMode.upi.value]
    by_payment_mode: Dict[str, Dict[str, int]] = {
        m: {
            "billed_paise": 0,
            "collected_paise": 0,
            "outstanding_paise": 0,
            "refunds_paise": 0,
        }
        for m in modes
    }

    total_billed_paise = 0
    total_collected_paise = 0
    total_outstanding_paise = 0
    total_refunds_paise = 0

    total_visits = 0
    pending_visits_count = 0
    refund_visits_count = 0

    per_visit: List[dict] = []

    for t in transactions:
        mode_str = t.payment_mode.value if hasattr(t.payment_mode, "value") else str(t.payment_mode).lower()
        if mode_str not in by_payment_mode:
            by_payment_mode[mode_str] = {
                "billed_paise": 0,
                "collected_paise": 0,
                "outstanding_paise": 0,
                "refunds_paise": 0,
            }

        billed = t.billed_paise
        collected = t.collected_paise
        outstanding = t.outstanding_paise
        refund = t.refund_paise

        if t.is_refund:
            refund_visits_count += 1
            total_refunds_paise += refund
            by_payment_mode[mode_str]["refunds_paise"] += refund
        else:
            total_visits += 1
            total_billed_paise += billed
            total_collected_paise += collected
            total_outstanding_paise += outstanding

            by_payment_mode[mode_str]["billed_paise"] += billed
            by_payment_mode[mode_str]["collected_paise"] += collected
            by_payment_mode[mode_str]["outstanding_paise"] += outstanding

            if outstanding > 0:
                pending_visits_count += 1

        per_visit.append({
            "visit_id": t.visit_id,
            "clinic_id": t.clinic_id,
            "timestamp": t.timestamp.isoformat(),
            "payment_mode": mode_str,
            "billed_paise": billed,
            "paid_paise": t.amount_paid_paise,
            "collected_paise": collected,
            "outstanding_paise": outstanding,
            "refund_paise": refund,
            "discount_paise": t.discount_paise,
            "is_refund": t.is_refund,
        })

    net_collected_paise = total_collected_paise - total_refunds_paise

    return {
        "total_billed_paise": total_billed_paise,
        "total_collected_paise": total_collected_paise,
        "total_outstanding_paise": total_outstanding_paise,
        "total_refunds_paise": total_refunds_paise,
        "net_collected_paise": net_collected_paise,
        "total_visits": total_visits,
        "pending_visits_count": pending_visits_count,
        "refund_visits_count": refund_visits_count,
        "by_payment_mode": by_payment_mode,
        "per_visit": per_visit,
    }


def compute_analytics(transactions: List[TransactionRow]) -> dict:
    """
    Computes deterministic clinic analytics:
    - Aggregates 24-hour revenue (grouped by hour like '12pm', '1pm').
    - Identifies peak hour and peak revenue.
    - Computes two separate rankings:
      1. Top medicines by quantity (drug_name, qty).
      2. Top medicines by revenue (drug_name, revenue_paise).
    """
    hourly_collected = [0] * 24
    hourly_billed = [0] * 24
    hourly_refund = [0] * 24
    hourly_tx_count = [0] * 24

    medicine_qty_map: Dict[str, int] = defaultdict(int)
    medicine_rev_map: Dict[str, int] = defaultdict(int)

    for t in transactions:
        hour = t.timestamp.hour
        hourly_tx_count[hour] += 1

        if t.is_refund:
            hourly_refund[hour] += t.refund_paise
        else:
            hourly_collected[hour] += t.collected_paise
            hourly_billed[hour] += t.billed_paise

            for item in t.line_items:
                drug = item.drug_name
                qty = item.qty
                rev = item.total_price_paise
                medicine_qty_map[drug] += qty
                medicine_rev_map[drug] += rev

    hourly_revenue_dict: Dict[str, int] = {}
    hourly_breakdown: List[dict] = []

    peak_hour_idx: Optional[int] = None
    peak_revenue_paise = 0

    for h in range(24):
        label = format_hour_label(h)
        interval = format_hour_interval(h)
        rev = hourly_collected[h]

        hourly_revenue_dict[label] = rev
        hourly_breakdown.append({
            "hour": h,
            "hour_label": label,
            "interval_label": interval,
            "revenue_paise": rev,
            "collected_paise": hourly_collected[h],
            "billed_paise": hourly_billed[h],
            "refund_paise": hourly_refund[h],
            "transaction_count": hourly_tx_count[h],
        })

        if rev > peak_revenue_paise:
            peak_revenue_paise = rev
            peak_hour_idx = h

    peak_hour: Optional[str] = None
    peak_hour_interval: Optional[str] = None

    if peak_hour_idx is not None and peak_revenue_paise > 0:
        peak_hour = format_hour_label(peak_hour_idx)
        peak_hour_interval = format_hour_interval(peak_hour_idx)

    top_medicines_by_quantity = [
        {"drug_name": drug, "qty": qty}
        for drug, qty in sorted(
            medicine_qty_map.items(),
            key=lambda x: (-x[1], x[0]),
        )
    ]

    top_medicines_by_revenue = [
        {"drug_name": drug, "revenue_paise": rev}
        for drug, rev in sorted(
            medicine_rev_map.items(),
            key=lambda x: (-x[1], x[0]),
        )
    ]

    return {
        "hourly_revenue": hourly_revenue_dict,
        "hourly_breakdown": hourly_breakdown,
        "peak_hour": peak_hour,
        "peak_hour_interval": peak_hour_interval,
        "peak_revenue_paise": peak_revenue_paise,
        "top_medicines_by_quantity": top_medicines_by_quantity,
        "top_medicines_by_revenue": top_medicines_by_revenue,
    }


def parse_and_validate_billing_log(
    raw_rows: List[Any],
    strict: bool = False,
) -> Tuple[List[TransactionRow], List[dict]]:
    """
    Parses and validates a raw billing log JSON array.
    Rejects malformed rows with actionable field-level errors rather than failing.
    """
    valid_transactions: List[TransactionRow] = []
    errors: List[dict] = []

    for index, row in enumerate(raw_rows):
        if not isinstance(row, dict):
            error_entry = {
                "row_index": index,
                "visit_id": None,
                "error": f"Row must be a JSON object, got {type(row).__name__}",
            }
            if strict:
                raise ValueError(error_entry["error"])
            errors.append(error_entry)
            continue

        visit_id = row.get("visit_id")

        try:
            tx = TransactionRow.model_validate(row)
            valid_transactions.append(tx)
        except ValidationError as e:
            field_errors = []
            for err in e.errors():
                loc = " -> ".join(str(loc_item) for loc_item in err["loc"])
                field_errors.append({
                    "field": loc,
                    "message": err["msg"],
                    "type": err["type"],
                })

            formatted_fields = [f"{f['field']}: {f['message']}" for f in field_errors]
            fields_summary = "; ".join(formatted_fields)
            error_msg = f"Validation failed for visit '{visit_id or 'UNKNOWN'}': {fields_summary}"
            if strict:
                raise ValueError(error_msg) from e

            errors.append({
                "row_index": index,
                "visit_id": str(visit_id) if visit_id is not None else None,
                "error": error_msg,
                "field_errors": field_errors,
            })

    return valid_transactions, errors
