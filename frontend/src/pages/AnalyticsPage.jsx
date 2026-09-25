import React, { useState } from 'react';
import { formatRupees } from '../api/client';
import { TrendingUp, Package, DollarSign } from 'lucide-react';

export default function AnalyticsPage({ report, isLoading }) {
  const [hoveredHour, setHoveredHour] = useState(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm font-medium text-slate-500">Computing deterministic analytics...</span>
        </div>
      </div>
    );
  }

  const analytics = report?.analytics || {
    hourly_breakdown: [],
    peak_hour: null,
    peak_hour_interval: null,
    peak_revenue_paise: 0,
    top_medicines_by_quantity: [],
    top_medicines_by_revenue: [],
  };

  const peakHourInterval = analytics.peak_hour_interval || (analytics.peak_hour ? `${analytics.peak_hour}` : 'N/A');
  const peakRevenuePaise = analytics.peak_revenue_paise || 0;

  // Filter or show active clinic hours (or default typical clinic day 8am to 8pm if zero data)
  const allHours = analytics.hourly_breakdown || [];
  
  // Find range of hours that had transactions or default to 8am - 7pm
  const activeHoursList = allHours.filter(h => h.hour >= 8 && h.hour <= 19);
  const displayHours = activeHoursList.length > 0 ? activeHoursList : allHours.slice(8, 20);

  const maxRevenue = Math.max(...displayHours.map((h) => h.revenue_paise), 1);

  const topQuantity = analytics.top_medicines_by_quantity || [];
  const topRevenue = analytics.top_medicines_by_revenue || [];

  return (
    <div className="space-y-6">
      {/* 1. Revenue by Hour of Day Bar Chart (Page 6 Mockup) */}
      <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Revenue by Hour of Day
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hourly collected revenue across 24-hour UTC window
            </p>
          </div>

          {/* Peak hour banner matching Page 6 */}
          {peakRevenuePaise > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold tracking-tight">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Peak: {peakHourInterval} — {formatRupees(peakRevenuePaise)}</span>
            </div>
          )}
        </div>

        {/* Bar Chart Container */}
        <div className="pt-8 pb-4">
          <div className="h-56 flex items-end justify-between gap-2 md:gap-3 px-2">
            {displayHours.map((item) => {
              const heightPct = Math.max(
                item.revenue_paise > 0 ? (item.revenue_paise / maxRevenue) * 100 : 4,
                item.revenue_paise > 0 ? 12 : 4
              );
              const isPeak = item.revenue_paise === peakRevenuePaise && peakRevenuePaise > 0;
              const isHovered = hoveredHour === item.hour;

              return (
                <div
                  key={item.hour}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  onMouseEnter={() => setHoveredHour(item.hour)}
                  onMouseLeave={() => setHoveredHour(null)}
                >
                  {/* Tooltip on Hover */}
                  {isHovered && (
                    <div className="absolute -top-12 z-20 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-medium shadow-xl whitespace-nowrap animate-in fade-in zoom-in-95 pointer-events-none">
                      <div className="font-bold">{item.interval_label}</div>
                      <div className="text-emerald-300 font-semibold">{formatRupees(item.revenue_paise)}</div>
                    </div>
                  )}

                  {/* Peak label badge above bar if it's the peak */}
                  {isPeak && (
                    <div className="mb-2 text-[11px] font-bold text-blue-600 hidden md:block whitespace-nowrap animate-bounce">
                      Peak: {item.hour_label}
                    </div>
                  )}

                  {/* The Bar */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[48px] rounded-lg transition-all duration-300 ${
                      isPeak
                        ? 'bg-blue-600 shadow-md shadow-blue-500/20'
                        : item.revenue_paise > 0
                        ? 'bg-blue-100 hover:bg-blue-200'
                        : 'bg-slate-100/70 hover:bg-slate-200/50'
                    }`}
                  />

                  {/* X-axis Label */}
                  <span
                    className={`mt-3 text-[11px] font-medium transition ${
                      isPeak
                        ? 'font-bold text-blue-600'
                        : isHovered
                        ? 'text-slate-900 font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {item.hour_label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Two Distinct Side-by-Side Ranking Panels (Page 6 Mockup) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Top Medicines by Quantity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Package className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Top Medicines — by Quantity
              </h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Total units dispensed</span>
          </div>

          {topQuantity.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-medium">
              No medicine sales recorded for this date.
            </div>
          ) : (
            <div className="space-y-3">
              {topQuantity.slice(0, 5).map((item, index) => (
                <div
                  key={item.drug_name}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-300 w-4">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      {item.drug_name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {item.qty} units
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Top Medicines by Revenue */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <DollarSign className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Top Medicines — by Revenue
              </h3>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Total paise earned</span>
          </div>

          {topRevenue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-medium">
              No medicine sales recorded for this date.
            </div>
          ) : (
            <div className="space-y-3">
              {topRevenue.slice(0, 5).map((item, index) => (
                <div
                  key={item.drug_name}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-300 w-4">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800 tracking-wide">
                      {item.drug_name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-900 font-mono">
                    {formatRupees(item.revenue_paise)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
