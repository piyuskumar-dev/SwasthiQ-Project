import React from 'react';
import StatCard from '../components/StatCard';
import { formatRupees } from '../api/client';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function ReconciliationPage({ report, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm font-medium text-slate-500">Computing deterministic reconciliation...</span>
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

  const collectionPct = billedPaise > 0 ? Math.round((collectedPaise / billedPaise) * 100) : 0;

  const modes = ['cash', 'card', 'upi'];
  const byMode = reconciliation.by_payment_mode || {};

  const totalModeBilled = modes.reduce((acc, m) => acc + (byMode[m]?.billed_paise || 0), 0);
  const totalModeCollected = modes.reduce((acc, m) => acc + (byMode[m]?.collected_paise || 0), 0);
  const totalModeOutstanding = modes.reduce((acc, m) => acc + (byMode[m]?.outstanding_paise || 0), 0);
  const totalModeRefunds = modes.reduce((acc, m) => acc + (byMode[m]?.refunds_paise || 0), 0);

  const rejectedErrors = report?.rejected_errors || [];

  return (
    <div className="space-y-6">
      {/* Resilient Ingestion Alert (Page 2 Requirement: actionable error) */}
      {rejectedErrors.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Ingestion Notice: {rejectedErrors.length} Malformed Row Isolated
            </div>
            <p className="text-xs text-amber-700 mt-0.5">
              The deterministic pipeline rejected malformed records with actionable errors rather than failing with a 500:
            </p>
            <ul className="mt-1.5 space-y-1">
              {rejectedErrors.map((err, i) => (
                <li key={i} className="text-xs font-mono bg-amber-100/60 px-2 py-1 rounded-md text-amber-900 inline-block mr-2">
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
          subtext={`${reconciliation.total_visits} visits`}
          subtextColor="text-blue-600"
        />
        <StatCard
          label="Total Collected"
          value={formatRupees(collectedPaise)}
          subtext={`${collectionPct}% of billed`}
          subtextColor="text-emerald-600"
        />
        <StatCard
          label="Outstanding"
          value={formatRupees(outstandingPaise)}
          subtext={`${reconciliation.pending_visits_count} pending visits`}
          subtextColor="text-amber-600"
        />
        <StatCard
          label="Refunds"
          value={formatRupees(refundsPaise)}
          subtext={`${reconciliation.refund_visits_count} refund${reconciliation.refund_visits_count === 1 ? '' : 's'}`}
          subtextColor="text-rose-500"
        />
      </div>

      {/* Payment Mode Breakdown Table (Page 5 Mockup) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Payment Mode Breakdown
          </h2>
          <span className="text-xs font-medium text-slate-400">Strict integer paise totals</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Mode</th>
                <th className="px-6 py-3.5">Billed</th>
                <th className="px-6 py-3.5">Collected</th>
                <th className="px-6 py-3.5">Outstanding</th>
                <th className="px-6 py-3.5">Refunds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {modes.map((mode) => {
                const data = byMode[mode] || { billed_paise: 0, collected_paise: 0, outstanding_paise: 0, refunds_paise: 0 };
                const label = mode === 'upi' ? 'UPI' : mode.charAt(0).toUpperCase() + mode.slice(1);
                return (
                  <tr key={mode} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900">{label}</td>
                    <td className="px-6 py-4 font-medium">{formatRupees(data.billed_paise)}</td>
                    <td className="px-6 py-4 font-medium">{formatRupees(data.collected_paise)}</td>
                    <td className={`px-6 py-4 font-medium ${data.outstanding_paise > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {formatRupees(data.outstanding_paise)}
                    </td>
                    <td className={`px-6 py-4 font-medium ${data.refunds_paise > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                      {formatRupees(data.refunds_paise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/70 border-t-2 border-slate-100 text-slate-900 font-bold">
                <td className="px-6 py-4">Total</td>
                <td className="px-6 py-4">{formatRupees(totalModeBilled)}</td>
                <td className="px-6 py-4 text-emerald-700">{formatRupees(totalModeCollected)}</td>
                <td className={`px-6 py-4 ${totalModeOutstanding > 0 ? 'text-amber-700' : ''}`}>
                  {formatRupees(totalModeOutstanding)}
                </td>
                <td className={`px-6 py-4 ${totalModeRefunds > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {formatRupees(totalModeRefunds)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
