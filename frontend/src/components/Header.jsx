import React, { useState } from 'react';
import { Calendar, ChevronDown, Building2, Check } from 'lucide-react';

export default function Header({
  title,
  subtitle,
  selectedDate,
  setSelectedDate,
  availableDates,
  selectedClinic,
  setSelectedClinic,
  clinics,
}) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isClinicPickerOpen, setIsClinicPickerOpen] = useState(false);

  // Helper to format ISO date e.g. "2026-07-27" to "27 Jul 2026"
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'Select Date';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          {title}
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-0.5">
          {subtitle || 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Clinic Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsClinicPickerOpen(!isClinicPickerOpen);
              setIsDatePickerOpen(false);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
          >
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="max-w-[140px] truncate">
              {clinics.find((c) => c.clinic_id === selectedClinic)?.name?.split('—')[0] || selectedClinic}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isClinicPickerOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Select Clinic
              </div>
              {clinics.map((c) => (
                <button
                  key={c.clinic_id}
                  onClick={() => {
                    setSelectedClinic(c.clinic_id);
                    setIsClinicPickerOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between text-slate-700"
                >
                  <span className="truncate">{c.name || c.clinic_id}</span>
                  {selectedClinic === c.clinic_id && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date Selector Dropdown (matches Page 5 mockup) */}
        <div className="relative">
          <button
            onClick={() => {
              setIsDatePickerOpen(!isDatePickerOpen);
              setIsClinicPickerOpen(false);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatDateDisplay(selectedDate)}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isDatePickerOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sample Clinic Days
              </div>
              {availableDates.map((date) => (
                <button
                  key={date}
                  onClick={() => {
                    setSelectedDate(date);
                    setIsDatePickerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition ${
                    selectedDate === date
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{formatDateDisplay(date)}</span>
                  {selectedDate === date && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
