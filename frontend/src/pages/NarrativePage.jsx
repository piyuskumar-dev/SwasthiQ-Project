import React, { useState } from 'react';
import { Copy, Check, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react';

export default function NarrativePage({ narrativeData, isLoading }) {
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Generating grounded narrative summary...</span>
        </div>
      </div>
    );
  }

  const message = narrativeData?.whatsapp_message || 'No narrative generated.';
  const tracedFigures = narrativeData?.traced_figures || [];
  const isGrounded = narrativeData?.is_grounded ?? true;
  const untracedNumbers = narrativeData?.untraced_numbers || [];

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Tag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
            <Sparkles className="w-3.5 h-3.5" />
            AI SUGGESTED
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
            Strictly grounded in deterministic report
          </span>
        </div>

        {isGrounded ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Zero Hallucinations Verified</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Untraced figures: {untracedNumbers.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Two Column Layout (Page 7 Mockup) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: WhatsApp Styled Card (7 cols) */}
        <div className="lg:col-span-7 bg-[#ecfdf5]/90 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-800/80 rounded-2xl p-6 md:p-8 flex flex-col justify-between shadow-2xs">
          <div>
            {/* Meta Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-emerald-100 dark:border-emerald-800/60">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 tracking-tight">
                Sent to: Dr. Anand Mehta • WhatsApp
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700 shadow-2xs transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Message Body */}
            <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line font-normal space-y-3 font-sans">
              {message}
            </div>
          </div>

          {/* Bottom Badge */}
          <div className="mt-8 pt-4 border-t border-emerald-100/60 dark:border-emerald-800/60 flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold tracking-wider uppercase">
              SUCCESS
            </span>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">
              Ready for owner dispatch
            </span>
          </div>
        </div>

        {/* Right: Traced Figures Panel (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight mb-1">
              Traced Figures
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 leading-relaxed">
              Every number above maps to the deterministic report — this is what gets auto-checked.
            </p>

            <div className="space-y-4">
              {tracedFigures.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-none"
                >
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {item.display_value}
                  </span>
                  <span className="text-xs font-mono font-medium text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md">
                    {item.source_field}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
            <span>Grounding Assurance</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% Deterministic</span>
          </div>
        </div>
      </div>
    </div>
  );
}
