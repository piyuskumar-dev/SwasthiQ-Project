import React from 'react';
import { X, Printer, CheckCircle2, ShieldCheck, FileText } from 'lucide-react';
import { printReceipt } from '../utils/receiptPrinter';
import { formatRupees } from '../api/client';

export default function ReceiptModal({
  isOpen,
  onClose,
  transaction,
  clinicName = 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh',
}) {
  if (!isOpen || !transaction) return null;

  const isRefund = Boolean(transaction.is_refund);
  const items = transaction.line_items || [];
  const paidPaise = Math.abs(transaction.amount_paid_paise || 0);
  const discountPaise = transaction.discount_paise || 0;

  const grossPaise = items.reduce((acc, it) => {
    return acc + ((it.qty || 1) * (it.unit_price_paise || 0));
  }, 0);

  const netBilledPaise = Math.max(0, grossPaise - discountPaise);
  const outstandingPaise = isRefund ? 0 : Math.max(0, netBilledPaise - paidPaise);

  let dateStr = '—';
  let timeStr = '—';
  try {
    const d = transaction.timestamp ? new Date(transaction.timestamp) : new Date();
    dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {}

  const handlePrint = () => {
    printReceipt(transaction, clinicName);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Patient Receipt & Pharmacy Invoice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Dispensary Slip • {transaction.visit_id || 'VST-0000'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Receipt Preview Body */}
        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Printable Card Preview */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-4">
            
            {/* Clinic Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg object-contain" />
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {clinicName}
                  </h4>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Reg No: UP-MED/2026/014 • Outpatient & Pharmacy
                  </div>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase ${
                isRefund 
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' 
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}>
                {isRefund ? 'Refund Voucher' : 'Payment Receipt'}
              </span>
            </div>

            {/* Patient & Doctor Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs py-1">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Patient Name</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{transaction.patient_name || 'Walk-in Patient'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Attending Doctor</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{transaction.doctor_name || 'Dr. R. K. Mehta'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Date & Time</span>
                <span className="text-slate-700 dark:text-slate-300">{dateStr} • {timeStr}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Payment Mode</span>
                <span className="font-mono font-bold uppercase text-blue-600 dark:text-blue-400">{transaction.payment_mode || 'UPI'}</span>
              </div>
            </div>

            {/* Prescribed Items Table */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Item / Medication</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                  {items.length > 0 ? (
                    items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-medium">{it.drug_name || 'Consultation'}</td>
                        <td className="px-3 py-2 text-center">{it.qty || 1}</td>
                        <td className="px-3 py-2 text-right">{formatRupees(it.unit_price_paise || 0)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatRupees((it.qty || 1) * (it.unit_price_paise || 0))}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-3 py-3 text-center text-slate-400 italic">
                        Outpatient Consultation & Clinical Examination
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Breakdown */}
            <div className="flex justify-end pt-1">
              <div className="w-56 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Subtotal Gross:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{formatRupees(grossPaise)}</span>
                </div>
                {discountPaise > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount:</span>
                    <span className="font-semibold">-{formatRupees(discountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Net Billed:</span>
                  <span className="font-semibold">{formatRupees(netBilledPaise)}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>{isRefund ? 'Refunded:' : 'Paid:'}</span>
                  <span className={isRefund ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}>
                    {isRefund ? `-${formatRupees(paidPaise)}` : formatRupees(paidPaise)}
                  </span>
                </div>
                {outstandingPaise > 0 && (
                  <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400 font-bold">
                    <span>Due:</span>
                    <span>{formatRupees(outstandingPaise)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Pharmacy instructions note */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span>Present this slip at the in-house dispensary counter for medicine handover.</span>
              <span className="font-mono text-[10px] text-slate-400">SwasthiQ Audit</span>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-xl transition"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt / Save as PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
