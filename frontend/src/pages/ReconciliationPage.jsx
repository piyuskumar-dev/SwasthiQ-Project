import React from 'react';
import StatCard from '../components/StatCard';
import { formatRupees } from '../api/client';
import { AlertCircle, Calculator, ArrowRight, ShieldCheck } from 'lucide-react';

export default function ReconciliationPage({ report, isLoading }) {
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

  return (
    <div className="space-y-6">
      {/* Resilient Ingestion Notice */}
      {rejectedErrors.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl p-4 flex items-start gap-3 text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Ingestion Notice: {rejectedErrors.length} Malformed Row Isolated
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
              The deterministic pipeline rejected malformed records with actionable errors rather than failing with a 500:
            </p>
            <ul className="mt-1.5 space-y-1">
              {rejectedErrors.map((err, i) => (
                <li key={i} className="text-xs font-mono bg-amber-100/60 dark:bg-amber-900/50 px-2 py-1 rounded-md text-amber-900 dark:text-amber-200 inline-block mr-2">
                  Visit {err.visit_id || 'UNKNOWN'}: {err.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Recorded Payment Transactions & Patient Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Complete transaction log for this clinic date ({report?.raw_records?.length || 0} recorded) • Preserved and reconciled
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Audit Ledger Active
          </span>
        </div>

        {(!report?.raw_records || report.raw_records.length === 0) ? (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {[...report.raw_records].reverse().map((r, idx) => {
                  const isRefund = Boolean(r.is_refund);
                  const mode = (r.payment_mode || 'upi').toLowerCase();
                  const paidPaise = Math.abs(r.amount_paid_paise || 0);
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
                    <tr key={r.visit_id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                          mode === 'upi'
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800'
                            : mode === 'cash'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                            : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800'
                        }`}>
                          {mode}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {isRefund ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800">
                            Refund
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-xs">
                        <span className={isRefund ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                          {isRefund ? `-${formatRupees(paidPaise)}` : formatRupees(paidPaise)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
