import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, IndianRupee, AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { recordSingleTransaction } from '../api/client';

export default function AddPaymentModal({
  isOpen,
  onClose,
  selectedClinic,
  clinicName,
  onTransactionAdded,
}) {
  const getTodayISO = () => new Date().toISOString().split('T')[0];

  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('');
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('Dr. R. K. Mehta');
  const [paymentMode, setPaymentMode] = useState('upi');
  const [isRefund, setIsRefund] = useState(false);
  const [discountRupees, setDiscountRupees] = useState('0');
  const [amountPaidRupees, setAmountPaidRupees] = useState('');
  const [items, setItems] = useState([
    { drug_name: '', qty: 1, unit_price_rupees: '' },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Live system clock updater for audit proof of truth
  useEffect(() => {
    if (!isOpen) return;
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeDisplay(
        now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' • ' +
        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // The transaction date and time are strictly bound to the live system clock
  const effectiveDate = getTodayISO();

  // Calculate gross line items in rupees
  const grossRupees = items.reduce((sum, item) => {
    const qty = parseInt(item.qty, 10) || 0;
    const price = parseFloat(item.unit_price_rupees) || 0;
    return sum + (qty * price);
  }, 0);

  const discount = parseFloat(discountRupees) || 0;
  const netBilledRupees = Math.max(0, grossRupees - discount);

  // Auto fill amount paid if user hasn't explicitly set it
  const suggestedAmountPaid = isRefund ? grossRupees : netBilledRupees;

  const handleAddItem = () => {
    setItems([...items, { drug_name: '', qty: 1, unit_price_rupees: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation
    const validItems = items.filter(it => it.drug_name.trim());
    if (validItems.length === 0) {
      setErrorMsg('Please specify at least one medication item.');
      return;
    }

    const paidVal = amountPaidRupees === '' ? suggestedAmountPaid : parseFloat(amountPaidRupees);
    if (isNaN(paidVal) || (paidVal === 0 && !isRefund)) {
      setErrorMsg('Please enter a valid payment amount.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert rupees to integer paise
      const amountPaidPaise = Math.round(paidVal * 100);
      const discountPaise = Math.round(discount * 100);

      const lineItems = validItems.map(it => ({
        drug_name: it.drug_name.trim(),
        qty: parseInt(it.qty, 10) || 1,
        unit_price_paise: Math.round((parseFloat(it.unit_price_rupees) || 0) * 100),
      }));

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const visitId = `VST-${Date.now().toString().slice(-4)}-${randomSuffix}`;
      const nowIso = new Date().toISOString();

      const transactionPayload = {
        clinic_id: selectedClinic,
        visit_id: visitId,
        patient_name: patientName.trim() || undefined,
        doctor_name: doctorName.trim() || undefined,
        timestamp: nowIso,
        created_at: nowIso,
        is_audit_override: false,
        payment_mode: paymentMode,
        amount_paid_paise: isRefund ? -Math.abs(amountPaidPaise) : Math.abs(amountPaidPaise),
        discount_paise: isRefund ? 0 : discountPaise,
        is_refund: isRefund,
        line_items: lineItems,
      };

      await recordSingleTransaction(selectedClinic, effectiveDate, transactionPayload, clinicName);

      setSuccessMsg(`Payment recorded successfully (${isRefund ? 'Refund' : 'Sale'}: ₹${paidVal.toLocaleString('en-IN')})!`);
      setTimeout(() => {
        if (onTransactionAdded) onTransactionAdded(effectiveDate);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to record transaction:', err);
      setErrorMsg(err.message || 'Failed to record transaction. Please check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Record New Payment / Transaction
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                Immutable System Audit
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {clinicName || selectedClinic} • Instant deterministic recalculation
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* System Audit Timestamp Bar (Tamper-Proof & Anti-Fraud Proof of Truth) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span>System Audit Clock:</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800">
                    {currentTimeDisplay || 'Fetching system time...'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  <strong>Tamper-Proof Integrity:</strong> Timestamp is strictly enforced by the server system clock. Date and time cannot be manually backdated, future-dated, or altered by receptionists.
                </p>
              </div>
            </div>
          </div>

          {/* Row: Payment Mode & Refund Switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {['upi', 'cash', 'card'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 text-xs font-bold uppercase rounded-xl border transition ${
                      paymentMode === mode
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 cursor-pointer h-[38px]">
                <input
                  type="checkbox"
                  checked={isRefund}
                  onChange={(e) => setIsRefund(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  This transaction is a Refund
                </span>
              </label>
            </div>
          </div>

          {/* Row: Patient Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Patient Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Ramesh Kumar"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Medication Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Prescribed Medications / Line Items
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>

            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Drug name (e.g. Paracetamol 650mg)"
                    value={item.drug_name}
                    onChange={(e) => handleItemChange(idx, 'drug_name', e.target.value)}
                    className="flex-2 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                    className="w-16 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-center"
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1.5 text-xs text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      placeholder="Price"
                      value={item.unit_price_rupees}
                      onChange={(e) => handleItemChange(idx, 'unit_price_rupees', e.target.value)}
                      className="w-full pl-5 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            {!isRefund && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Gross Amount:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  ₹{grossRupees.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            {!isRefund && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Discount (₹):</span>
                <div className="relative w-24">
                  <span className="absolute left-2 top-1 text-xs text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discountRupees}
                    onChange={(e) => setDiscountRupees(e.target.value)}
                    className="w-full pl-5 pr-2 py-0.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-right font-medium"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {isRefund ? 'Refund Amount Disbursed (₹):' : 'Amount Paid by Patient (₹):'}
              </span>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1 text-xs text-slate-400">₹</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder={suggestedAmountPaid.toString()}
                  value={amountPaidRupees !== '' ? amountPaidRupees : suggestedAmountPaid}
                  onChange={(e) => setAmountPaidRupees(e.target.value)}
                  className={`w-full pl-6 pr-2 py-1 text-xs rounded-lg border font-bold text-right ${
                    isRefund
                      ? 'border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/40'
                      : 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/40'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>{isRefund ? 'Record Refund' : 'Record Payment'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
