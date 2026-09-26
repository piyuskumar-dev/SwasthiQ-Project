import React from 'react';
import { LayoutDashboard, BarChart3, Bot, Database, Plus, IndianRupee } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Sidebar({
  currentTab,
  setCurrentTab,
  isBackendOnline,
  onSeedData,
  isSeeding,
  onOpenAddPayment,
}) {
  const navItems = [
    { id: 'reconciliation', label: 'EOD Reconciliation', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'narrative', label: 'AI Narrative', icon: Bot, badge: 'AI' },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 shrink-0 select-none transition-colors">
      {/* Brand Logo & Name */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="SwasthiQ Logo"
            className="w-9 h-9 rounded-xl object-contain shadow-xs border border-slate-200/80 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800 shrink-0"
          />
          <div>
            <div className="font-bold text-slate-900 dark:text-white tracking-tight text-base leading-tight">SwasthiQ</div>
            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">EOD Agent v2.0</div>
          </div>
        </div>

        {/* Backend health pill */}
        <div
          title={isBackendOnline ? 'Connected to FastAPI Backend (localhost:8000)' : 'Backend offline (using local calculation)'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            isBackendOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isBackendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {isBackendOnline ? 'Live API' : 'Fallback'}
        </div>
      </div>

      {/* Quick Action: Add Payment */}
      {onOpenAddPayment && (
        <div className="px-4 pt-3 pb-1">
          <button
            onClick={onOpenAddPayment}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <div className="p-3 flex-1 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Core Dashboards
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-xs border border-blue-100/80 dark:border-blue-900/60 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Database / Seeding Action */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium flex items-center justify-between">
          <span>Data Ingestion</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">SQLite</span>
        </div>
        <button
          onClick={onSeedData}
          disabled={isSeeding}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition disabled:opacity-50"
        >
          {isSeeding ? (
            <span className="animate-spin w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : (
            <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          )}
          {isSeeding ? 'Seeding...' : 'Seed Sample Days'}
        </button>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-tight text-center">
          Loads 25, 26, & 27 Jul sample data
        </p>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
        <span>SwasthiQ Kaagazy</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">INR (paise)</span>
      </div>
    </aside>
  );
}
