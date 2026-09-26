import React from 'react';
import { LayoutDashboard, BarChart3, Bot, Database, Sparkles, CheckCircle2 } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Sidebar({ currentTab, setCurrentTab, isBackendOnline, onSeedData, isSeeding }) {
  const navItems = [
    { id: 'reconciliation', label: 'EOD Reconciliation', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'narrative', label: 'AI Narrative', icon: Bot, badge: 'AI' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Logo & Name */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="SwasthiQ Logo"
            className="w-9 h-9 rounded-xl object-contain shadow-xs border border-slate-200/80 p-0.5 bg-white shrink-0"
          />
          <div>
            <div className="font-bold text-slate-900 tracking-tight text-base leading-tight">SwasthiQ</div>
            <div className="text-[11px] font-medium text-slate-400">EOD Agent v2.0</div>
          </div>
        </div>

        {/* Backend health pill */}
        <div
          title={isBackendOnline ? 'Connected to FastAPI Backend (localhost:8000)' : 'Backend offline (using local calculation)'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            isBackendOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isBackendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {isBackendOnline ? 'Live API' : 'Fallback'}
        </div>
      </div>

      {/* Navigation Links */}
      <div className="p-3 flex-1 space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                  ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100/80 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Database / Seeding Action */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="text-xs text-slate-500 mb-2 font-medium flex items-center justify-between">
          <span>Data Ingestion</span>
          <span className="text-[10px] text-slate-400">SQLite</span>
        </div>
        <button
          onClick={onSeedData}
          disabled={isSeeding}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition disabled:opacity-50"
        >
          {isSeeding ? (
            <span className="animate-spin w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
          ) : (
            <Database className="w-3.5 h-3.5 text-blue-600" />
          )}
          {isSeeding ? 'Seeding...' : 'Seed Sample Days'}
        </button>
        <p className="text-[10px] text-slate-400 mt-2 leading-tight text-center">
          Loads 25, 26, & 27 Jul sample data into backend
        </p>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
        <span>SwasthiQ Kaagazy</span>
        <span className="text-[10px] text-slate-400 font-mono">INR (paise)</span>
      </div>
    </aside>
  );
}
