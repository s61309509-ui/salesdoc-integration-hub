import { useState, FormEvent } from 'react';
import { LocalCustomer, LocalPayment } from '../types';
import { Plus, UploadCloud, CheckCircle2, Clock, AlertCircle, CreditCard, DollarSign } from 'lucide-react';

interface PaymentsTabProps {
  payments: LocalPayment[];
  clients: LocalCustomer[];
  onAddPayment: (payment: { customer_id: string; amount: number; payment_type: string; order_id?: string }) => Promise<void>;
  onPushPayment: (id: string) => Promise<void>;
  loadingActionId: string | null;
}

export function PaymentsTab({
  payments,
  clients,
  onAddPayment,
  onPushPayment,
  loadingActionId
}: PaymentsTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('000000001'); // Standard cash type
  const [orderId, setOrderId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId || !amount) return;

    setSubmitting(true);
    try {
      await onAddPayment({
        customer_id: customerId,
        amount: parseFloat(amount),
        payment_type: paymentType,
        order_id: orderId.trim() || undefined
      });
      setShowAddModal(false);
      setAmount('');
      setOrderId('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Payment Transactions & Collections
          </h3>
          <p className="text-xs text-slate-500">
            Manage debt settlements and receipts synced with SalesDoc API V2.
          </p>
        </div>

        <button
          id="record-payment-btn"
          onClick={() => {
            if (clients.length > 0 && !customerId) {
              setCustomerId(clients[0].id);
            }
            setShowAddModal(true);
          }}
          className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Payment ID / 1C</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Linked Order</th>
                <th className="px-4 py-3">SalesDoc ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount (UZS)</th>
                <th className="px-4 py-3 text-center">Sync Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No payment records logged yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isPushing = loadingActionId === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <div>{p.id}</div>
                        <div className="text-[10px] font-mono text-slate-500">{p.code_1c || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-medium">
                        {p.customer_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {p.order_id || 'Direct payment'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {p.salesdoc_id ? (
                          <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                            {p.salesdoc_id}
                          </span>
                        ) : (
                          <span className="text-slate-600">Not synced</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {p.payment_date}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                        +{p.amount.toLocaleString()} UZS
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.sync_status === 'synced' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Synced</span>
                          </span>
                        ) : p.sync_status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            title={p.last_error}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          id={`push-payment-${p.id}`}
                          onClick={() => onPushPayment(p.id)}
                          disabled={isPushing}
                          className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition disabled:opacity-50"
                          title="Push to SalesDoc API (setPayment)"
                        >
                          <UploadCloud className={`w-3.5 h-3.5 ${isPushing ? 'animate-bounce' : ''}`} />
                          <span>{isPushing ? 'Pushing...' : 'Push SD'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>Record Client Payment</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Customer *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="">-- Choose client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Balance: {c.balance.toLocaleString()} UZS)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Payment Amount (UZS) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 500000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Payment Type</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden"
                  >
                    <option value="000000001">Cash (Naqd)</option>
                    <option value="000000002">Bank Transfer (Perechisleniye)</option>
                    <option value="000000003">Card / Terminal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Linked Order ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ORD-001"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium"
              >
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
