/**
 * SwasthiQ Clinic OS — Patient Receipt & Dispensary Slip Printer
 * Generates an executive, print-ready clinic receipt / PDF with
 * hospital branding, medicine details, and integer-paise financial breakdown.
 */

export function printReceipt(transaction, clinicName = 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh') {
  if (!transaction) return;

  const isRefund = Boolean(transaction.is_refund);
  const items = transaction.line_items || [];
  const paidPaise = Math.abs(transaction.amount_paid_paise || 0);
  const discountPaise = transaction.discount_paise || 0;
  
  const grossPaise = items.reduce((acc, it) => {
    return acc + ((it.qty || 1) * (it.unit_price_paise || 0));
  }, 0);

  const netBilledPaise = Math.max(0, grossPaise - discountPaise);
  const outstandingPaise = isRefund ? 0 : Math.max(0, netBilledPaise - paidPaise);

  const formatRs = (paise) => '₹' + (Math.round(paise / 100)).toLocaleString('en-IN');

  let dateStr = '—';
  let timeStr = '—';
  try {
    const d = transaction.timestamp ? new Date(transaction.timestamp) : new Date();
    dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {}

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    alert('Please allow popups to print receipt.');
    return;
  }

  const itemsRows = items.length > 0 
    ? items.map((it, idx) => {
        const qty = it.qty || 1;
        const unitPrice = it.unit_price_paise || 0;
        const lineTotal = qty * unitPrice;
        return `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${idx + 1}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">
              ${it.drug_name || 'Medical Service / Consultation'}
              <div style="font-size: 11px; font-weight: normal; color: #64748b;">Oral / Dispensary fulfillment</div>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center; color: #334155;">${qty}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; color: #334155;">${formatRs(unitPrice)}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: 600; color: #0f172a;">${formatRs(lineTotal)}</td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="5" style="padding: 14px; text-align: center; color: #64748b; font-size: 13px;">
          Outpatient Consultation & Clinical Examination
        </td>
      </tr>
    `;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Receipt — ${transaction.visit_id || 'SwasthiQ'}</title>
      <style>
        @page { size: auto; margin: 12mm 15mm; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 24px;
        }
        .receipt-container {
          max-width: 680px;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 28px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        @media print {
          body { padding: 0; }
          .receipt-container {
            border: none;
            box-shadow: none;
            padding: 0;
            max-width: 100%;
          }
          .no-print { display: none !important; }
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 18px;
          border-bottom: 2px solid #0284c7;
        }
        .brand-col {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .logo-img {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          object-fit: contain;
        }
        .clinic-title {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          line-height: 1.2;
        }
        .clinic-subtitle {
          font-size: 11px;
          color: #64748b;
          margin-top: 3px;
        }
        .badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 6px;
        }
        .badge-sale {
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
        .badge-refund {
          background: #fff1f2;
          color: #9f1239;
          border: 1px solid #fecdd3;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          padding: 16px 0;
          border-bottom: 1px dashed #cbd5e1;
          font-size: 13px;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
        }
        .meta-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .meta-val {
          font-weight: 700;
          color: #1e293b;
          margin-top: 2px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 18px;
        }
        th {
          background: #f8fafc;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #e2e8f0;
          text-align: left;
        }
        .summary-box {
          margin-top: 18px;
          display: flex;
          justify-content: flex-end;
        }
        .summary-table {
          width: 280px;
          font-size: 13px;
        }
        .summary-table td {
          padding: 5px 8px;
        }
        .summary-table .total-row td {
          font-size: 15px;
          font-weight: 800;
          border-top: 2px solid #0f172a;
          color: #0f172a;
          padding-top: 8px;
        }
        .footer-notes {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 11px;
          color: #64748b;
        }
        .sign-area {
          text-align: center;
          width: 180px;
          border-top: 1px solid #94a3b8;
          padding-top: 4px;
          font-size: 11px;
          color: #334155;
          font-weight: 600;
        }
        .print-btn-bar {
          margin-bottom: 20px;
          display: flex;
          justify-content: center;
          gap: 12px;
        }
        .btn-print {
          background: #0284c7;
          color: #ffffff;
          border: none;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
        }
        .btn-print:hover {
          background: #0369a1;
        }
      </style>
    </head>
    <body>
      <div class="no-print print-btn-bar">
        <button class="btn-print" onclick="window.print()">🖨️ Print Receipt / Save as PDF</button>
      </div>

      <div class="receipt-container">
        <!-- Clinic Header -->
        <div class="header">
          <div class="brand-col">
            <img src="${window.location.origin}/logo.png" alt="Logo" class="logo-img" onerror="this.style.display='none'" />
            <div>
              <h1 class="clinic-title">${clinicName}</h1>
              <div class="clinic-subtitle">Outpatient Department & Pharmacy Dispensary • Reg No: UP-MED/2026/014</div>
            </div>
          </div>
          <div>
            <span class="badge ${isRefund ? 'badge-refund' : 'badge-sale'}">
              ${isRefund ? 'Refund Voucher' : 'Cash/UPI Receipt'}
            </span>
          </div>
        </div>

        <!-- Meta Details -->
        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Patient Name</span>
            <span class="meta-val">${transaction.patient_name || 'Walk-in Patient'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Invoice / Visit ID</span>
            <span class="meta-val" style="font-family: monospace;">${transaction.visit_id || 'VST-0000'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Attending Doctor</span>
            <span class="meta-val">${transaction.doctor_name || 'Dr. R. K. Mehta (MBBS, MD)'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Date & Time</span>
            <span class="meta-val">${dateStr} • ${timeStr}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Payment Mode</span>
            <span class="meta-val" style="text-transform: uppercase;">${transaction.payment_mode || 'UPI'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Status</span>
            <span class="meta-val" style="color: ${isRefund ? '#e11d48' : '#16a34a'};">
              ${isRefund ? 'Refund Disbursed' : 'Payment Settled'}
            </span>
          </div>
        </div>

        <!-- Medications & Services Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Prescription Medicine / Item</th>
              <th style="width: 60px; text-align: center;">Qty</th>
              <th style="width: 90px; text-align: right;">Rate</th>
              <th style="width: 100px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Summary -->
        <div class="summary-box">
          <table class="summary-table">
            <tr>
              <td style="color: #64748b;">Subtotal Gross:</td>
              <td style="text-align: right; font-weight: 600;">${formatRs(grossPaise)}</td>
            </tr>
            ${discountPaise > 0 ? `
              <tr>
                <td style="color: #059669;">Special Discount:</td>
                <td style="text-align: right; font-weight: 600; color: #059669;">-${formatRs(discountPaise)}</td>
              </tr>
            ` : ''}
            <tr>
              <td style="color: #64748b;">Net Billed:</td>
              <td style="text-align: right; font-weight: 600;">${formatRs(netBilledPaise)}</td>
            </tr>
            <tr class="total-row">
              <td>${isRefund ? 'Refunded Amount:' : 'Amount Paid:'}</td>
              <td style="text-align: right; color: ${isRefund ? '#e11d48' : '#0284c7'};">
                ${isRefund ? `-${formatRs(paidPaise)}` : formatRs(paidPaise)}
              </td>
            </tr>
            ${outstandingPaise > 0 ? `
              <tr>
                <td style="color: #d97706; font-weight: 600;">Outstanding Due:</td>
                <td style="text-align: right; font-weight: 700; color: #d97706;">${formatRs(outstandingPaise)}</td>
              </tr>
            ` : ''}
          </table>
        </div>

        <!-- Footer -->
        <div class="footer-notes">
          <div>
            <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Pharmacy Fulfillment Notice:</div>
            <div>Present this receipt at the clinic dispensary counter for medication handover.</div>
            <div style="margin-top: 4px; color: #94a3b8; font-size: 10px;">Generated by SwasthiQ Clinic OS • Deterministic EOD Audit Trail</div>
          </div>
          <div class="sign-area">
            Authorized Cashier / Stamp
          </div>
        </div>
      </div>

      <script>
        // Auto trigger print preview once loaded
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.print();
          }, 350);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
