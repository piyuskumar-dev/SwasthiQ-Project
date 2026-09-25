import React from 'react';

export default function StatCard({ label, value, subtext, subtextColor = 'text-blue-600' }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs hover:shadow-xs transition duration-200">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        {label}
      </div>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
        {value}
      </div>
      {subtext && (
        <div className={`text-xs font-medium ${subtextColor}`}>
          {subtext}
        </div>
      )}
    </div>
  );
}
