import React, { useState, useMemo } from 'react';
import StatCard from '../components/StatCard';
import { formatRupees, ingestBillingLog } from '../api/client';
import {
  AlertCircle,
  Calculator,
  ArrowRight,
  ShieldCheck,
  Printer,
  CheckCircle2,
  Clock,
  Edit3,
  X,
  Check,
  QrCode,
  Banknote,
  CreditCard,
} from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';

export default function ReconciliationPage({
  report,
  isLoading,
  selectedClinic,
  selectedDate,
  clinicName,
  onRefresh,
}) {
  const [activeReceiptTx, setActiveReceiptTx] = useState(null);
  const [resolvingTx, setResolvingTx] = useState(null);
  const [selectedModeForResolve, setSelectedModeForResolve] = useState('upi');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Computing deterministic reconciliation...</span>
        </div>
      </div>
    );
  }

  const reconciliation = report?.reconciliation || {
    total_billed_paise: 0,
    total_collected_paise: 0,
    total_outstanding_paise: 0,
    total_refunds_paise: 0,
    total_visits: 0,
    pending_visits_count: 0,
    refund_visits_count: 0,
    by_payment_mode: {},
  };

  const billedPaise = reconciliation.total_billed_paise || 0;
  const collectedPaise = reconciliation.total_collected_paise || 0;
  const outstandingPaise = reconciliation.total_outstanding_paise || 0;
  const refundsPaise = reconciliation.total_refunds_paise || 0;

  // Realized Net Collection = Gross Collected - Refunds Disbursed
  const netCollectedPaise = reconciliation.net_collected_paise !== undefined
    ? reconciliation.net_collected_paise
    : (collectedPaise - refundsPaise);

  const collectionPct = billedPaise > 0 ? Math.round((collectedPaise / billedPaise) * 100) : 0;

  const modes = ['cash', 'card', 'upi'];
  const byMode = reconciliation.by_payment_mode || {};

  const totalModeBilled = modes.reduce((acc, m) => acc + (byMode[m]?.billed_paise || 0), 0);
  const totalModeCollected = modes.reduce((acc, m) => acc + (byMode[m]?.collected_paise || 0), 0);
  const totalModeOutstanding = modes.reduce((acc, m) => acc + (byMode[m]?.outstanding_paise || 0), 0);
  const totalModeRefunds = modes.reduce((acc, m) => acc + (byMode[m]?.refunds_paise || 0), 0);
  const totalModeNet = totalModeCollected - totalModeRefunds;

  const rejectedErrors = report?.rejected_errors || [];

  const rejectedMap = useMemo(() => {
    const map = new Map();
    for (const err of rejectedErrors) {
      if (err.visit_id) {
        map.set(err.visit_id, err);
      }
    }
    return map;
  }, [rejectedErrors]);

  const perVisitMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(reconciliation?.per_visit)) {
      for (const v of reconciliation.per_visit) {
        if (v.visit_id) {
          map.set(v.visit_id, v);
        }
      }
    }
    return map;
  }, [reconciliation]);

  const rawRecords = report?.raw_records || [];
  const totalRecordsCount = rawRecords.length;
  const incompleteCount = rawRecords.filter((r) => !r.payment_mode || rejectedMap.has(r.visit_id)).length;
  const pendingVisitsCount = reconciliation.pending_visits_count || 0;
  const refundVisitsCount = reconciliation.refund_visits_count || 0;
  const completedCount = Math.max(0, totalRecordsCount - incompleteCount - pendingVisitsCount - refundVisitsCount);

  const handleSaveResolvedMode = async () => {
    if (!resolvingTx || !selectedModeForResolve) return;
    setIsResolving(true);
    setResolveError(null);
    try {
      const updatedRecords = rawRecords.map((rec) => {
        if (rec.visit_id === resolvingTx.visit_id) {
          return {
            ...rec,
            payment_mode: selectedModeForResolve,
          };
        }
        return rec;
      });

      await ingestBillingLog(
        selectedClinic || 'CLN-KNP-014',
        selectedDate || '2026-07-27',
        updatedRecords,
        clinicName || 'Mehta Multi-Specialty Clinic'
      );

      setResolvingTx(null);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      setResolveError(err.message || 'Failed to update payment mode');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* 4 Stat Cards Grid (Page 5 Mockup) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <StatCard
          label="Total Billed"
          value={formatRupees(billedPaise)}
          subtext={`${reconciliation.total_visits} patient visits`}
          subtextColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Total Collected"
          value={formatRupees(collectedPaise)}
          subtext={refundsPaise > 0 ? `Net in-hand: ${formatRupees(netCollectedPaise)}` : `${collectionPct}% collected`}
          subtextColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Outstanding"
          value={formatRupees(outstandingPaise)}
          subtext={`${reconciliation.pending_visits_count} pending visits`}
          subtextColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Refunds"
          value={formatRupees(refundsPaise)}
          subtext={`${reconciliation.refund_visits_count} refund${reconciliation.refund_visits_count === 1 ? '' : 's'} disbursed`}
          subtextColor="text-rose-500 dark:text-rose-400"
        />
      </div>

      {/* Register Settlement Equation Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Daily Closing Settlement Breakdown
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                Net Collections in register = Gross Collected minus Refunds
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Gross Collected:</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatRupees(collectedPaise)}</span>
            </div>

            <span className="text-slate-400 font-bold">−</span>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60">
              <span className="text-rose-700 dark:text-rose-300">Refunds:</span>
              <span className="font-bold text-rose-700 dark:text-rose-300">{formatRupees(refundsPaise)}</span>
            </div>

            <span className="text-slate-400 font-bold">=</span>

            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 shadow-2xs">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">Net Realized:</span>
              <span className="font-extrabold text-emerald-800 dark:text-emerald-200 text-sm">{formatRupees(netCollectedPaise)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Mode Breakdown Table (Page 5 Mockup) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Payment Mode Breakdown
          </h2>
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Strict integer paise totals</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3.5">Mode</th>
                <th className="px-6 py-3.5">Billed</th>
                <th className="px-6 py-3.5">Collected</th>
                <th className="px-6 py-3.5">Outstanding</th>
                <th className="px-6 py-3.5">Refunds</th>
                <th className="px-6 py-3.5">Net Realized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {modes.map((mode) => {
                const data = byMode[mode] || { billed_paise: 0, collected_paise: 0, outstanding_paise: 0, refunds_paise: 0 };
                const netMode = data.collected_paise - data.refunds_paise;
                const label = mode === 'upi' ? 'UPI' : mode.charAt(0).toUpperCase() + mode.slice(1);
                return (
                  <tr key={mode} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{label}</td>
                    <td className="px-6 py-4 font-medium">{formatRupees(data.billed_paise)}</td>
                    <td className="px-6 py-4 font-medium">{formatRupees(data.collected_paise)}</td>
                    <td className={`px-6 py-4 font-medium ${data.outstanding_paise > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {formatRupees(data.outstanding_paise)}
                    </td>
                    <td className={`px-6 py-4 font-medium ${data.refunds_paise > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      {formatRupees(data.refunds_paise)}
                    </td>
                    <td className={`px-6 py-4 font-bold ${netMode >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatRupees(netMode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/70 dark:bg-slate-800/60 border-t-2 border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white font-bold">
                <td className="px-6 py-4">Total</td>
                <td className="px-6 py-4">{formatRupees(totalModeBilled)}</td>
                <td className="px-6 py-4 text-emerald-700 dark:text-emerald-400">{formatRupees(totalModeCollected)}</td>
                <td className={`px-6 py-4 ${totalModeOutstanding > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                  {formatRupees(totalModeOutstanding)}
                </td>
                <td className={`px-6 py-4 ${totalModeRefunds > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {formatRupees(totalModeRefunds)}
                </td>
                <td className="px-6 py-4 text-emerald-800 dark:text-emerald-200 font-extrabold">
                  {formatRupees(totalModeNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Recorded Payment Transactions & Patient Ledger */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Recorded Payment Transactions & Patient Ledger
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Complete transaction log for this clinic date ({totalRecordsCount} recorded) • Preserved and reconciled
              </span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {completedCount} Completed
                </span>
                {pendingVisitsCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {pendingVisitsCount} Partially Paid
                  </span>
                )}
                {incompleteCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium border border-amber-500/30">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    {incompleteCount} Incomplete
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 self-start sm:self-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Audit Ledger Active
          </span>
        </div>

        {(!rawRecords || rawRecords.length === 0) ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            No payment transactions recorded for this clinic date yet. Use "Add Payment" to record a new transaction.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Visit / Bill ID</th>
                  <th className="px-6 py-3.5">Time</th>
                  <th className="px-6 py-3.5">Patient / Doctor</th>
                  <th className="px-6 py-3.5">Medications / Items</th>
                  <th className="px-6 py-3.5">Payment Mode</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5 text-center">Receipt Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {[...rawRecords].reverse().map((r, idx) => {
                  const isRefund = Boolean(r.is_refund);
                  const isMalformed = rejectedMap.has(r.visit_id) || !r.payment_mode;
                  const mode = (r.payment_mode || '').toLowerCase();
                  const paidPaise = Math.abs(r.amount_paid_paise || 0);
                  const perVisit = perVisitMap.get(r.visit_id);
                  const outstandingPaise = perVisit?.outstanding_paise || 0;
                  const isPartial = !isRefund && !isMalformed && outstandingPaise > 0;
                  const itemsList = r.line_items || [];
                  const itemsSummary = itemsList.length > 0
                    ? itemsList.map((it) => `${it.drug_name || 'Item'} (${it.qty || 1})`).join(', ')
                    : 'Consultation / Service';

                  let timeStr = '—';
                  if (r.timestamp) {
                    try {
                      const d = new Date(r.timestamp);
                      if (!isNaN(d.getTime())) {
                        timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      }
                    } catch (_) {}
                  }

                  return (
                    <tr key={r.visit_id || idx} className={`transition ${isMalformed ? 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60 dark:hover:bg-amber-950/40' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'}`}>
                      <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {r.visit_id || `TX-${idx + 1}`}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {timeStr}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-white text-xs">
                          {r.patient_name || 'Patient'}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">
                          {r.doctor_name || r.doctor_id || 'Dr. Mehta'}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={itemsSummary}>
                        {itemsSummary}
                      </td>
                      <td className="px-6 py-3.5">
                        {r.payment_mode ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                            mode === 'upi'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800'
                              : mode === 'cash'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                              : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800'
                          }`}>
                            {mode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/30">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        {isMalformed ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            title={rejectedMap.get(r.visit_id)?.error || 'Payment mode required'}
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>Incomplete (Payment mode required)</span>
                          </span>
                        ) : isRefund ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Refund
                          </span>
                        ) : isPartial ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            title={`Billed: ${formatRupees(perVisit?.billed_paise || 0)}, Paid: ${formatRupees(perVisit?.paid_paise || 0)}`}
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>Partially Paid ({formatRupees(outstandingPaise)} due)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>Completed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-xs">
                        <span className={isRefund ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                          {isRefund ? `-${formatRupees(paidPaise)}` : formatRupees(paidPaise)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isMalformed && (
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingTx(r);
                                setSelectedModeForResolve('upi');
                                setResolveError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition active:scale-95 cursor-pointer"
                              title="Set payment mode to complete and reconcile this transaction"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Set Mode</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveReceiptTx(r)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                            title="View / Print Receipt Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Slip</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patient Receipt & Pharmacy Invoice Modal */}
      <ReceiptModal
        isOpen={Boolean(activeReceiptTx)}
        onClose={() => setActiveReceiptTx(null)}
        transaction={activeReceiptTx}
      />

      {/* Resolve Incomplete Transaction Modal */}
      {resolvingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Resolve Incomplete Payment
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Set missing payment mode for Visit <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{resolvingTx.visit_id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResolvingTx(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Visit ID:</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{resolvingTx.visit_id}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Doctor:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{resolvingTx.doctor_id || 'DOC-014-01'}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Medications:</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                    {(resolvingTx.line_items || []).map((it) => `${it.drug_name} (${it.qty})`).join(', ') || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Amount Paid:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatRupees(resolvingTx.amount_paid_paise || 0)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Select Collected Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'upi', label: 'UPI / QR', icon: QrCode, color: 'text-blue-500' },
                    { id: 'cash', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
                    { id: 'card', label: 'Card / POS', icon: CreditCard, color: 'text-purple-500' },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = selectedModeForResolve === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedModeForResolve(m.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-xs font-medium cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${m.color}`} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {resolveError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resolveError}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setResolvingTx(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResolving}
                onClick={handleSaveResolvedMode}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isResolving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save & Reconcile</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
