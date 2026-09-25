# SwasthiQ EOD Billing & Analytics Agent

A production-grade, deterministic End-Of-Day (EOD) billing reconciliation, analytics, and grounded AI WhatsApp narrative reporting service for clinic networks.

---

## 1. Architecture Overview

The system strictly decouples the **Deterministic Ground-Truth Layer** (FastAPI backend) from the **Generative AI & Interactive Layer** (React frontend) to guarantee absolute mathematical precision and zero numerical hallucinations.

```
swasthiq-eod-agent/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── init.py
│   │   ├── main.py                  # FastAPI REST API endpoints
│   │   ├── schemas.py               # Pydantic v2 schemas & validators
│   │   ├── deterministic.py         # Pure Python calculations (integer paise)
│   │   ├── storage.py               # SQLite ACID persistence & state consistency
│   │   └── narrative.py             # Grounded WhatsApp generator & tracer
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── init.py
│   │   ├── test_deterministic.py    # Phase 1 unit test suite
│   │   └── test_phase2_persistence_and_narrative.py # Phase 2 & 3 test suite
│   ├── Dockerfile                   # Container definition for Fly.io / Railway / GCP
│   ├── Procfile                     # Process runner for Render / Heroku
│   └── requirements.txt             # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx          # Persistent navigation & health indicator
│   │   │   ├── Header.jsx           # Clinic info & date dropdown
│   │   │   └── StatCard.jsx         # Metric card with contextual badges
│   │   ├── pages/
│   │   │   ├── ReconciliationPage.jsx # Screen 1: Billed / Collected / Table
│   │   │   ├── AnalyticsPage.jsx      # Screen 2: Hourly revenue & dual rankings
│   │   │   └── NarrativePage.jsx      # Screen 3: WhatsApp message & traced figures
│   │   ├── api/
│   │   │   ├── client.js            # API client with offline fallback
│   │   │   └── sampleData.js        # Seed datasets (27, 26, 25 Jul)
│   │   ├── App.jsx                  # Main application state orchestration
│   │   ├── index.css                # Tailwind CSS core directives
│   │   └── main.jsx                 # React DOM mount point
│   ├── index.html                   # HTML template with Inter typography
│   ├── package.json                 # Node dependencies (Vite + Tailwind CSS)
│   ├── vite.config.js               # Vite build configuration
│   ├── tailwind.config.js           # Tailwind design tokens
│   ├── postcss.config.js            # PostCSS plugin pipeline
│   ├── vercel.json                  # Vercel SPA routing redirects
│   ├── netlify.toml                 # Netlify SPA routing redirects
│   └── .env.example                 # Frontend environment variables
├── Dockerfile                       # Root container definition
├── Procfile                         # Root process runner
└── README.md                        # Project documentation & API contracts
```

---

## 2. Core Engineering Discipline & Data Invariants

### Integer Paise Throughout (Zero Floating-Point Drift)
In healthcare and retail billing, IEEE-754 binary floating-point numbers introduce insidious rounding inaccuracies (e.g., `0.1 + 0.2 = 0.30000000000000004`). 
- Every monetary value is represented, validated, stored, and aggregated strictly as an **integer in paise** (1 Rupee = 100 paise).
- Conversion to rupees is purely a display-level presentation concern.

### State Consistency Upon Update & Re-Ingestion (`backend/app/storage.py`)
Clinic billing logs frequently receive late-evening additions, corrections, or re-submissions:
1. **Atomic SQLite Transactions (`with conn:`)**: Log ingestion executes within an immediate transaction. If any validation fails, the transaction rolls back cleanly, leaving previous state unaltered.
2. **Idempotent Upsert (`ON CONFLICT(clinic_id, date) DO UPDATE`)**: Re-ingesting a clinic day updates `raw_json` and updates `updated_at`, while preserving the initial `created_at` timestamp for auditing. Exactly one row exists per `(clinic_id, date)`.
3. **Deterministic Recalculation**: Reconciliation and analytics are recomputed from scratch against the updated set of validated transactions. Stale cache and incremental drift are eliminated.

### Resilient Data Ingestion
Real-world datasets contain anomalies (e.g., row 19 in `billing_log_2026-07-27.json` is missing `payment_mode`). 
Rather than throwing an unhandled exception or 500 error, `parse_and_validate_billing_log()` isolates malformed rows, returns actionable field-level error messages (`rejected_errors`), and allows all valid visits to reconcile cleanly.

---

## 3. Deterministic Ground Truth Formulas

### Reconciliation Formulas (`compute_eod_reconciliation`)
- **Gross Line Items**: $\sum (\text{qty} \times \text{unit\_price\_paise})$
- **Visit Billed**: $\max(0, \text{Gross Line Items} - \text{discount\_paise})$ for sales; $0$ for refunds.
- **Visit Collected**: $\max(0, \text{amount\_paid\_paise})$ for sales; $0$ for refunds.
- **Visit Outstanding**: $\max(0, \text{Visit Billed} - \text{Visit Collected})$ for sales.
- **Visit Refund**: $\lvert \text{amount\_paid\_paise} \rvert$ for refund transactions (`is_refund: true`).
- **Payment Mode Split**: All totals are tracked by `cash`, `card`, and `upi`.

### Analytics Formulas (`compute_analytics`)
- **24-Hour Revenue Bucketing**: Collected amounts aggregated across 24 UTC hours (`0` to `23`) with 12-hour labels (`12am`, `9am`, `12pm`, `1pm`).
- **Peak Business Hour**: The 1-hour interval with maximum collected revenue (e.g. `12pm–1pm`).
- **Two Distinct Rankings**:
  1. **Top Medicines by Quantity**: Sum of `qty` grouped by `drug_name`, sorted descending.
  2. **Top Medicines by Revenue**: Sum of $(\text{qty} \times \text{unit\_price\_paise})$ grouped by `drug_name`, sorted descending.

---

## 4. Grounded AI Narrative Architecture (`backend/app/narrative.py`)

To satisfy the **zero-hallucination requirement**:
1. **Structured Input**: The LLM prompt receives only the deterministic JSON outputs as context.
2. **Grounding Validator (`validate_grounding`)**:
   - Parses the generated text and extracts every numeric value, currency mention, and count.
   - Asserts that every number exists in the allowed set of ground-truth values (`total_billed`, `total_collected`, `outstanding`, `refunds`, `peak_revenue`, visit counts, or medicine metrics).
   - If an unverified number is discovered, the output is flagged with `is_grounded: false`.
3. **Explicit Missing Data Handling**: If a metric cannot be derived (such as net profit without cost prices), the narrative explicitly flags: *"Note: cost data wasn't available today, so this is revenue, not profit — flagging rather than estimating."*
4. **Deterministic Fallback**: If an external LLM provider times out or outputs invalid schema, the system uses the built-in deterministic template, preventing service disruption.

---

## 5. REST API Specification

### Endpoints Table

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check endpoint |
| `GET` | `/api/clinics` | List all registered clinics |
| `GET` | `/api/clinics/{clinic_id}/dates` | List available billing dates for a clinic |
| `POST` | `/api/clinics/{clinic_id}/billing-logs/{date}` | Ingest/update daily billing log atomically |
| `GET` | `/api/clinics/{clinic_id}/billing-logs/{date}` | Retrieve stored log with full EOD outputs |
| `GET` | `/api/clinics/{clinic_id}/reconciliation/{date}` | Get deterministic reconciliation |
| `GET` | `/api/clinics/{clinic_id}/analytics/{date}` | Get 24-hr analytics and dual rankings |
| `GET` | `/api/clinics/{clinic_id}/narrative/{date}` | Get grounded WhatsApp narrative with traced figures |
| `POST` | `/api/narrative` | On-the-fly narrative generation from payload |
| `POST` | `/api/reconcile` | Direct in-memory reconciliation computation |
| `POST` | `/api/analytics` | Direct in-memory analytics computation |
| `POST` | `/api/eod-report` | Full pipeline ingestion and error reporting |

### Sample Payload: Ingest Daily Billing Log
`POST /api/clinics/CLN-KNP-014/billing-logs/2026-07-27`
```json
{
  "clinic_name": "Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh",
  "records": [
    {
      "clinic_id": "CLN-KNP-014",
      "visit_id": "V-20260727-001",
      "timestamp": "2026-07-27T09:10:00Z",
      "doctor_id": "DOC-014-01",
      "line_items": [
        {
          "drug_name": "PARACETAMOL",
          "qty": 3,
          "unit_price_paise": 2000
        }
      ],
      "payment_mode": "cash",
      "amount_paid_paise": 6000,
      "discount_paise": 0,
      "is_refund": false
    }
  ]
}
```

---

## 6. Local Setup & Testing

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm 9+

### 1. Backend Setup & Test Suite
```bash
# From workspace root
python3 -m venv .venv
source .venv/bin/activate
pip install -r swasthiq-eod-agent/backend/requirements.txt

# Run all 24 unit and integration tests
cd swasthiq-eod-agent
pytest -v
```
*Test suite validates happy-path days, partial payments, refund-only days (25 Jul), empty days (26 Jul), malformed row rejection, SQLite upserts, and hallucination detection.*

### 2. Start the Backend API Server
```bash
cd swasthiq-eod-agent
uvicorn backend.app.main:app --reload --port 8000
```
- Interactive Swagger API docs: `http://localhost:8000/docs`
- Health probe: `http://localhost:8000/health`

### 3. Start the React Frontend
```bash
cd swasthiq-eod-agent/frontend
npm install
npm run dev
```
Open `http://localhost:5173` to explore the dashboard.

---

## 7. Production Deployment Guide

### Frontend Deployment (Vercel / Netlify)
- **Root Directory**: `swasthiq-eod-agent/frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variable**: `VITE_API_BASE_URL=https://your-backend-api.onrender.com`
- Configuration files included:
  - `swasthiq-eod-agent/frontend/vercel.json`
  - `swasthiq-eod-agent/frontend/netlify.toml`

### Backend Deployment (Render / Railway / Fly.io)
- **Root Directory**: `swasthiq-eod-agent/backend` (or repo root)
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `PORT=8000`
  - `ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173`
- Configuration files included:
  - `swasthiq-eod-agent/backend/Procfile`
  - `swasthiq-eod-agent/backend/Dockerfile`
