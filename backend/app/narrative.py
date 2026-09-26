"""Narrative Layer for SwasthiQ EOD Billing & Analytics Agent.

Generates owner-facing WhatsApp summaries grounded strictly in deterministic report data.
Enforces zero hallucinated numbers via automatic numerical tracing and validation.
"""

from datetime import datetime
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class TracedFigure(BaseModel):
    """Represents a numeric figure in the narrative mapped back to ground truth."""
    metric_name: str
    display_value: str
    source_field: str
    raw_value: Any


class NarrativeResponse(BaseModel):
    """WhatsApp narrative summary with strict figure tracing."""
    clinic_name: str
    date: str
    whatsapp_message: str
    traced_figures: List[TracedFigure]
    is_grounded: bool
    untraced_numbers: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="deterministic-grounded-engine", description="Engine used to generate briefing")


def format_rupees(paise: int) -> str:
    """Formats integer paise into standard Indian Rupee string, e.g. 4285000 -> '₹42,850'."""
    rupees = paise // 100
    is_neg = rupees < 0
    s = str(abs(rupees))
    if len(s) > 3:
        last3 = s[-3:]
        rest = s[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        formatted = ",".join(groups) + "," + last3
    else:
        formatted = s

    prefix = "-₹" if is_neg else "₹"
    return f"{prefix}{formatted}"


def build_system_prompt() -> str:
    """Returns the strict grounding system prompt for LLM generation."""
    return """You are the SwasthiQ Clinic Intelligence Agent.
Generate a concise, owner-facing End-of-Day (EOD) summary suitable for WhatsApp.

STRICT GROUNDING RULES:
1. Every single number, currency figure, quantity, count, and percentage in your text must match the deterministic JSON ground-truth provided.
2. ZERO INVENTED NUMBERS: Do NOT estimate, extrapolate, calculate new metrics, or hallucinate figures.
3. If a metric cannot be computed from the data provided (for example, profit, when medicine cost price isn't given), explicitly state: "Note: cost data wasn't available today, so this is revenue, not profit — flagging rather than estimating."
4. Format:
   - Greeting and clinic name with date.
   - Billed vs Collected (with collection percentage) and visit count.
   - Outstanding balance with pending visits count, and refunds disbursed.
   - Busiest hour with peak revenue.
   - Top mover by quantity and top medicine by revenue.
   - Note about missing cost/profit data.
5. Tone: Professional, warm, concise, and direct for a clinic owner on WhatsApp.
"""


def generate_grounded_template(
    reconciliation: Dict[str, Any],
    analytics: Dict[str, Any],
    clinic_name: str = "Mehta Multi-Specialty Clinic",
    date_str: str = "",
) -> str:
    """
    Deterministically generates the WhatsApp narrative grounded 100% in ground-truth figures.
    Guarantees zero hallucinations and serves as the baseline ground truth.
    """
    billed_paise = reconciliation.get("total_billed_paise", 0)
    collected_paise = reconciliation.get("total_collected_paise", 0)
    outstanding_paise = reconciliation.get("total_outstanding_paise", 0)
    refunds_paise = reconciliation.get("total_refunds_paise", 0)
    total_visits = reconciliation.get("total_visits", 0)
    pending_visits = reconciliation.get("pending_visits_count", 0)
    refund_visits = reconciliation.get("refund_visits_count", 0)

    billed_str = format_rupees(billed_paise)
    collected_str = format_rupees(collected_paise)
    outstanding_str = format_rupees(outstanding_paise)
    refunds_str = format_rupees(refunds_paise)

    pct = 0
    if billed_paise > 0:
        pct = round((collected_paise / billed_paise) * 100)

    peak_interval = analytics.get("peak_hour_interval") or analytics.get("peak_hour") or "N/A"
    peak_rev_str = format_rupees(analytics.get("peak_revenue_paise", 0))

    top_qty_list = analytics.get("top_medicines_by_quantity", [])
    top_rev_list = analytics.get("top_medicines_by_revenue", [])

    top_qty_desc = "None"
    if top_qty_list:
        top_qty_desc = f"{top_qty_list[0]['drug_name']} ({top_qty_list[0]['qty']} units)"

    top_rev_desc = "None"
    if top_rev_list:
        top_rev_desc = f"{top_rev_list[0]['drug_name']} ({format_rupees(top_rev_list[0]['revenue_paise'])})"

    date_display = date_str if date_str else "Today"

    if total_visits > 0:
        refund_clause = (
            f", and {refunds_str} was refunded on {refund_visits} visit{'s' if refund_visits != 1 else ''}"
            if refund_visits > 0
            else ""
        )
        msg = (
            f"Good evening! Here's today's summary for {clinic_name} ({date_display}):\n\n"
            f"{billed_str} billed across {total_visits} visits, {collected_str} collected ({pct}%).\n"
            f"{outstanding_str} is still outstanding across {pending_visits} visits{refund_clause}.\n\n"
            f"Busiest hour: {peak_interval}, with {peak_rev_str} in revenue.\n\n"
            f"Top mover by quantity: {top_qty_desc}.\n"
            f"Top by revenue: {top_rev_desc}.\n\n"
            f"Note: cost data wasn't available today, so this is revenue, not profit — "
            f"flagging rather than estimating."
        )
    elif refund_visits > 0:
        msg = (
            f"Good evening! Here's today's summary for {clinic_name} ({date_display}):\n\n"
            f"No new sales billed today across 0 visits.\n"
            f"{refunds_str} was refunded across {refund_visits} visit{'s' if refund_visits != 1 else ''}.\n\n"
            f"Busiest hour: {peak_interval}, with {peak_rev_str} in revenue.\n\n"
            f"Top mover by quantity: {top_qty_desc}.\n"
            f"Top by revenue: {top_rev_desc}.\n\n"
            f"Note: cost data wasn't available today, so this is revenue, not profit — "
            f"flagging rather than estimating."
        )
    else:
        msg = (
            f"Good evening! Here's today's summary for {clinic_name} ({date_display}):\n\n"
            f"Clinic recorded 0 visits today ({billed_str} billed, {collected_str} collected).\n"
            f"0 visits pending, and 0 visits refunded.\n\n"
            f"Busiest hour: {peak_interval}, with {peak_rev_str} in revenue.\n\n"
            f"Top mover by quantity: {top_qty_desc}.\n"
            f"Top by revenue: {top_rev_desc}.\n\n"
            f"Note: cost data wasn't available today, so this is revenue, not profit — "
            f"flagging rather than estimating."
        )
    return msg


def extract_traced_figures(
    reconciliation: Dict[str, Any],
    analytics: Dict[str, Any],
) -> List[TracedFigure]:
    """
    Extracts the verifiable ground truth figures for the narrative report.
    """
    traced: List[TracedFigure] = []

    billed_paise = reconciliation.get("total_billed_paise", 0)
    collected_paise = reconciliation.get("total_collected_paise", 0)
    outstanding_paise = reconciliation.get("total_outstanding_paise", 0)
    refunds_paise = reconciliation.get("total_refunds_paise", 0)

    traced.append(
        TracedFigure(
            metric_name="Total Billed",
            display_value=format_rupees(billed_paise),
            source_field="total_billed",
            raw_value=billed_paise,
        )
    )
    traced.append(
        TracedFigure(
            metric_name="Total Collected",
            display_value=format_rupees(collected_paise),
            source_field="total_collected",
            raw_value=collected_paise,
        )
    )
    traced.append(
        TracedFigure(
            metric_name="Outstanding",
            display_value=format_rupees(outstanding_paise),
            source_field="outstanding",
            raw_value=outstanding_paise,
        )
    )
    traced.append(
        TracedFigure(
            metric_name="Refunds",
            display_value=format_rupees(refunds_paise),
            source_field="refunds",
            raw_value=refunds_paise,
        )
    )

    peak_interval = analytics.get("peak_hour_interval") or analytics.get("peak_hour") or "N/A"
    peak_rev = analytics.get("peak_revenue_paise", 0)
    traced.append(
        TracedFigure(
            metric_name="Busiest Hour Revenue",
            display_value=f"{peak_interval} / {format_rupees(peak_rev)}",
            source_field="revenue_by_hour[max]",
            raw_value={"interval": peak_interval, "revenue_paise": peak_rev},
        )
    )

    top_qty = analytics.get("top_medicines_by_quantity", [])
    if top_qty:
        item = top_qty[0]
        traced.append(
            TracedFigure(
                metric_name="Top Medicine by Quantity",
                display_value=f"{item['drug_name']} / {item['qty']}",
                source_field="top_drug_by_qty",
                raw_value=item,
            )
        )

    top_rev = analytics.get("top_medicines_by_revenue", [])
    if top_rev:
        item = top_rev[0]
        traced.append(
            TracedFigure(
                metric_name="Top Medicine by Revenue",
                display_value=f"{item['drug_name']} / {format_rupees(item['revenue_paise'])}",
                source_field="top_drug_by_revenue",
                raw_value=item,
            )
        )

    return traced


def validate_grounding(
    narrative_text: str,
    reconciliation: Dict[str, Any],
    analytics: Dict[str, Any],
) -> Tuple[bool, List[str]]:
    """
    Strictly verifies that numbers in the narrative correspond to genuine report metrics.
    Flags any ungrounded / hallucinated numbers.
    """
    valid_numbers = set()

    for k in [
        "total_billed_paise",
        "total_collected_paise",
        "total_outstanding_paise",
        "total_refunds_paise",
    ]:
        paise = reconciliation.get(k, 0)
        rupees = abs(paise) // 100
        valid_numbers.add(str(rupees))
        valid_numbers.add(f"{rupees:,}")

    billed = reconciliation.get("total_billed_paise", 0)
    collected = reconciliation.get("total_collected_paise", 0)
    if billed > 0:
        valid_numbers.add(str(round((collected / billed) * 100)))

    valid_numbers.add(str(reconciliation.get("total_visits", 0)))
    valid_numbers.add(str(reconciliation.get("pending_visits_count", 0)))
    valid_numbers.add(str(reconciliation.get("refund_visits_count", 0)))

    peak_paise = analytics.get("peak_revenue_paise", 0)
    peak_rupees = peak_paise // 100
    valid_numbers.add(str(peak_rupees))
    valid_numbers.add(f"{peak_rupees:,}")

    for item in analytics.get("top_medicines_by_quantity", []):
        valid_numbers.add(str(item.get("qty", 0)))

    for item in analytics.get("top_medicines_by_revenue", []):
        rev_rupees = item.get("revenue_paise", 0) // 100
        valid_numbers.add(str(rev_rupees))
        valid_numbers.add(f"{rev_rupees:,}")

    cleaned_text = re.sub(r"\b\d{1,2}(?:am|pm)\b", "", narrative_text, flags=re.IGNORECASE)
    cleaned_text = re.sub(
        r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
        "",
        cleaned_text,
        flags=re.IGNORECASE,
    )
    cleaned_text = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", "", cleaned_text)

    found_numbers = re.findall(r"\b\d[\d,]*\b", cleaned_text)
    untraced = []
    for num in found_numbers:
        norm = num.replace(",", "")
        if norm not in valid_numbers and num not in valid_numbers:
            if int(norm) in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]:
                continue
            untraced.append(num)

    is_grounded = len(untraced) == 0
    return is_grounded, untraced


def generate_gemini_narrative(
    reconciliation: Dict[str, Any],
    analytics: Dict[str, Any],
    clinic_name: str,
    date_str: str,
    api_key: str,
    model: str = "gemini-2.5-flash",
) -> Optional[str]:
    """
    Calls Google Gemini REST API to dynamically generate a natural language
    WhatsApp summary grounded strictly in the deterministic data.
    """
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        prompt = (
            f"{build_system_prompt()}\n\n"
            f"CLINIC NAME: {clinic_name}\n"
            f"RECONCILIATION DATE: {date_str}\n"
            f"GROUND TRUTH RECONCILIATION JSON:\n{json.dumps(reconciliation, indent=2)}\n\n"
            f"GROUND TRUTH ANALYTICS JSON:\n{json.dumps(analytics, indent=2)}\n\n"
            f"Generate the WhatsApp EOD briefing now following the exact grounding rules."
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 600,
            },
        }
        res = httpx.post(url, json=payload, timeout=12.0)
        if res.status_code == 200:
            data = res.json()
            candidates = data.get("candidates", [])
            if candidates:
                text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text and text.strip():
                    return text.strip()
        else:
            print(f"Gemini API returned status {res.status_code}: {res.text}")
    except Exception as err:
        print(f"Gemini API call exception: {err}")
    return None


def generate_narrative_summary(
    reconciliation: Dict[str, Any],
    analytics: Dict[str, Any],
    clinic_name: str = "Mehta Multi-Specialty Clinic",
    date_str: str = "",
) -> NarrativeResponse:
    """
    Main generator producing the complete narrative report.
    Supports hybrid execution: calls Gemini LLM when GEMINI_API_KEY is configured,
    audits the output via mathematical guardrails, and safely falls back to the
    deterministic grounded engine whenever offline or unconfigured.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("LLM_MODEL", "gemini-2.5-flash")
    
    message = None
    engine_used = "deterministic-grounded-engine"

    if api_key:
        candidate_msg = generate_gemini_narrative(
            reconciliation=reconciliation,
            analytics=analytics,
            clinic_name=clinic_name,
            date_str=date_str,
            api_key=api_key,
            model=model,
        )
        if candidate_msg:
            is_valid, _ = validate_grounding(candidate_msg, reconciliation, analytics)
            if is_valid:
                message = candidate_msg
                engine_used = f"gemini-llm ({model})"

    if not message:
        message = generate_grounded_template(
            reconciliation=reconciliation,
            analytics=analytics,
            clinic_name=clinic_name,
            date_str=date_str,
        )

    traced_figures = extract_traced_figures(reconciliation, analytics)
    is_grounded, untraced = validate_grounding(message, reconciliation, analytics)

    return NarrativeResponse(
        clinic_name=clinic_name,
        date=date_str,
        whatsapp_message=message,
        traced_figures=traced_figures,
        is_grounded=is_grounded,
        untraced_numbers=untraced,
        generated_by=engine_used,
    )
