import { useState, FormEvent } from 'react';
import { LocalCustomer, LocalOrder, LocalProduct } from '../types';
import { Search, Plus, UploadCloud, CheckCircle2, Clock, AlertCircle, ShoppingCart, Trash2, Calendar, FileText, Ban, Truck, Scale, Smartphone, Users } from 'lucide-react';
import { BatchShipModal } from './BatchShipModal';
import { Cat12ReconcileModal } from './Cat12ReconcileModal';

interface OrdersTabProps {
  orders: LocalOrder[];
  products: LocalProduct[];
  clients: LocalCustomer[];
  onCreateOrder: (order: { customer_id: string; items: any[]; comment?: string; delivery_date?: string }) => Promise<void>;
  onPushOrder: (id: string, force?: boolean) => Promise<void>;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onCancelOrder: (id: string) => Promise<void>;
  loadingActionId: string | null;
  agentFilterInitial?: string;
  deviceFilterInitial?: 'all' | 'dev_1' | 'dev_2';
}

export function OrdersTab({
  orders,
  products,
  clients,
  onCreateOrder,
  onPushOrder,
  onUpdateStatus,
  onCancelOrder,
  loadingActionId,
  agentFilterInitial,
  deviceFilterInitial
}: OrdersTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState<string>(agentFilterInitial || 'all');
  const [deviceFilter, setDeviceFilter] = useState<string>(deviceFilterInitial || 'all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchShipModal, setShowBatchShipModal] = useState(false);
  const [showCat12ReconcileModal, setShowCat12ReconcileModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Extract unique agents for filter dropdown
  const uniqueAgents = Array.from(
    new Map(
      orders
        .filter((o) => o.agent_id)
        .map((o) => [o.agent_id!, o.agent_name || o.agent_id!])
    ).entries()
  );

  // Dynamic order items builder
  const [orderItems, setOrderItems] = useState<Array<{ product_id: string; quantity: number; price: number }>>([
    { product_id: products[0]?.id || '', quantity: 10, price: products[0]?.price || 15000 }
  ]);

  const filtered = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      o.id.toLowerCase().includes(term) ||
      o.customer_name.toLowerCase().includes(term) ||
      o.code_1c?.toLowerCase().includes(term) ||
      o.salesdoc_id?.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesAgent = agentFilter === 'all' || o.agent_id === agentFilter;
    const matchesDevice = deviceFilter === 'all' || o.detected_device === deviceFilter;
    return matchesSearch && matchesStatus && matchesAgent && matchesDevice;
  });

  const handleAddItemRow = () => {
    const defaultProd = products[0];
    setOrderItems([
      ...orderItems,
      { product_id: defaultProd?.id || '', quantity: 1, price: defaultProd?.price || 0 }
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (orderItems.length <= 1) return;
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...orderItems];
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === value);
      updated[index] = {
        ...updated[index],
        product_id: value,
        price: prod ? prod.price : updated[index].price
      };
    } else if (field === 'quantity') {
      updated[index].quantity = Math.max(1, Number(value));
    } else if (field === 'price') {
      updated[index].price = Math.max(0, Number(value));
    }
    setOrderItems(updated);
  };

  const orderCalculatedTotal = orderItems.reduce((acc, it) => acc + (it.quantity * it.price), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedCustomerId) {
      setValidationError('Please select a customer for this order.');
      return;
    }

    if (orderItems.length === 0) {
      setValidationError('Order must contain at least one line item.');
      return;
    }

    // Check item completeness
    for (let i = 0; i < orderItems.length; i++) {
      const it = orderItems[i];
      if (!it.product_id) {
        setValidationError(`Item #${i + 1} has no product selected.`);
        return;
      }
      if (it.quantity <= 0) {
        setValidationError(`Item #${i + 1} quantity must be greater than 0.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const formattedItems = orderItems.map((it) => {
        const prod = products.find((p) => p.id === it.product_id);
        return {
          product_id: it.product_id,
          product_name: prod?.name || 'Product',
          product_code_1c: prod?.code_1c,
          quantity: it.quantity,
          price: it.price
        };
      });

      await onCreateOrder({
        customer_id: selectedCustomerId,
        items: formattedItems,
        comment,
        delivery_date: deliveryDate || undefined
      });

      setShowCreateModal(false);
      setComment('');
      setDeliveryDate('');
    } catch (err: any) {
      setValidationError(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="orders-search-input"
              type="text"
              placeholder="Search by Order ID, customer, 1C code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <select
            id="orders-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="delivered">Delivered</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            id="orders-agent-filter"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-hidden"
          >
            <option value="all">Barcha Agentlar ({uniqueAgents.length})</option>
            {uniqueAgents.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            id="orders-device-filter"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-hidden"
          >
            <option value="all">Barcha Qurilmalar</option>
            <option value="dev_1">📱 1-Qurilma (Oqim A)</option>
            <option value="dev_2">📱 2-Qurilma (Oqim B)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="batch-ship-orders-btn"
            onClick={() => setShowBatchShipModal(true)}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0 shadow-xs"
            title="Kechagacha boʻlgan barcha yangi zakazlarni +1 kunlik sana bilan otgrujen qilish"
          >
            <Truck className="w-4 h-4" />
            <span>Kechagacha zakazlarni otgrujen qilish</span>
          </button>

          <button
            id="cat12-reconcile-btn"
            onClick={() => setShowCat12ReconcileModal(true)}
            className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0 shadow-xs"
            title="SM-Причисленя Дукон (d0_12) mijozlar balansini tenglash va naqd (НАКД - d0_5) toʻlash"
          >
            <Scale className="w-4 h-4" />
            <span>d0_12 Oplata & Balans</span>
          </button>

          <button
            id="create-order-btn"
            onClick={() => {
              if (clients.length > 0 && !selectedCustomerId) {
                setSelectedCustomerId(clients[0].id);
              }
              setShowCreateModal(true);
            }}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Order ID / 1C</th>
                <th className="px-4 py-3">Agent / Qurilma</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">SalesDoc ID</th>
                <th className="px-4 py-3">Date / Delivery</th>
                <th className="px-4 py-3">Order Items</th>
                <th className="px-4 py-3 text-right">Total Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Sync</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No orders found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const isPushing = loadingActionId === order.id;

                  return (
                    <tr key={order.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <div>{order.id}</div>
                        <div className="text-[10px] font-mono text-slate-500">{order.code_1c || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {order.agent_name || order.agent_id ? (
                          <div>
                            <div className="font-semibold text-xs text-indigo-300">{order.agent_name || order.agent_id}</div>
                            {order.detected_device ? (
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    order.detected_device === 'dev_1'
                                      ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-700/50'
                                      : 'bg-amber-900/60 text-amber-200 border border-amber-700/50'
                                  }`}
                                >
                                  <Smartphone className="w-2.5 h-2.5" />
                                  {order.detected_device_name || (order.detected_device === 'dev_1' ? '1-Qurilma' : '2-Qurilma')}
                                </span>
                                {order.session_id && (
                                  <span className="text-[9px] text-slate-400 font-mono" title={`Sinxron: ${order.session_sync_time || ''}`}>
                                    {order.session_id}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">1 Qurilma</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        <div className="font-medium">{order.customer_name}</div>
                        {order.comment && (
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{order.comment}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {order.salesdoc_id ? (
                          <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                            {order.salesdoc_id}
                          </span>
                        ) : (
                          <span className="text-slate-600">Not synced</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div>{order.order_date}</div>
                        {order.delivery_date && (
                          <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>Del: {order.delivery_date}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div className="flex items-center space-x-1">
                          <ShoppingCart className="w-3 h-3 text-slate-500" />
                          <span>{order.items.length} item(s)</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-xs">
                          {order.items.map((it) => `${it.product_name} (${it.quantity})`).join(', ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-100">
                        {order.total_amount.toLocaleString()} UZS
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          id={`status-select-${order.id}`}
                          value={order.status}
                          onChange={(e) => onUpdateStatus(order.id, e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-hidden"
                        >
                          <option value="pending">1: Новый (New)</option>
                          <option value="confirmed">2: Отгружен (Shipped)</option>
                          <option value="delivered">3: Доставлен (Delivered)</option>
                          <option value="closed">4: Закрыт (Closed)</option>
                          <option value="cancelled">5: Отменен (Cancelled)</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {order.sync_status === 'synced' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Synced</span>
                          </span>
                        ) : order.sync_status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        ) : order.sync_status === 'cancelled' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                            <Ban className="w-3 h-3" />
                            <span>Cancelled</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            title={order.last_error}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {order.status !== 'confirmed' && (
                            <button
                              id={`ship-order-${order.id}`}
                              onClick={() => onUpdateStatus(order.id, 'confirmed')}
                              title="Отгрузить (+1 кунлик сана билан SalesDoc ga joʻnatish)"
                              className="inline-flex items-center space-x-1 text-xs px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Отгрузить</span>
                            </button>
                          )}
                          <button
                            id={`push-order-${order.id}`}
                            onClick={() => onPushOrder(order.id, order.sync_status === 'synced')}
                            disabled={isPushing}
                            className={`inline-flex items-center space-x-1 text-xs px-2 py-1 rounded border transition disabled:opacity-50 ${
                              order.sync_status === 'synced'
                                ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                                : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30'
                            }`}
                            title={
                              order.sync_status === 'synced'
                                ? 'Re-sync order (Idempotency override)'
                                : 'Push Order to SalesDoc API (setOrder)'
                            }
                          >
                            <UploadCloud className={`w-3.5 h-3.5 ${isPushing ? 'animate-bounce' : ''}`} />
                            <span>{isPushing ? '...' : order.sync_status === 'synced' ? 'Re-Sync' : 'Push SD'}</span>
                          </button>

                          {order.status !== 'cancelled' && (
                            <button
                              id={`cancel-order-${order.id}`}
                              onClick={() => onCancelOrder(order.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                              title="Cancel order in Local DB & SalesDoc"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl text-slate-200 my-8">
            <h3 className="text-base font-semibold text-white mb-2 flex items-center space-x-2">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <span>Create Order with Live Validation</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Pre-flight validation checks customer existence, line items count, positive quantities, and enforces duplicate order prevention.
            </p>

            {validationError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Customer & Delivery date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Select Customer *</label>
                  <select
                    id="new-order-customer-select"
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="">-- Choose registered customer --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code_1c || 'No 1C'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Delivery Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Order Items Table Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-slate-400 font-medium">Order Items</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <select
                          required
                          value={item.product_id}
                          onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.price.toLocaleString()} UZS
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs text-center"
                        />
                      </div>

                      <div className="w-28 text-right font-medium text-slate-300 text-xs">
                        {(item.quantity * item.price).toLocaleString()} UZS
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        disabled={orderItems.length <= 1}
                        className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="pt-2 mt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Total Calculated Order Sum:</span>
                    <span className="text-sm font-bold text-emerald-400">
                      {orderCalculatedTotal.toLocaleString()} UZS
                    </span>
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="block text-slate-400 mb-1">Order Comments / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Express delivery, call before arrival"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium"
              >
                {submitting ? 'Validating & Creating...' : 'Create Order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Batch Ship Old Orders Modal */}
      <BatchShipModal
        isOpen={showBatchShipModal}
        onClose={() => setShowBatchShipModal(false)}
        onSuccess={() => {
          // Success callback
        }}
      />

      {/* SM-Причисленя Дукон (d0_12) Reconcile & Cash Payment Modal */}
      <Cat12ReconcileModal
        isOpen={showCat12ReconcileModal}
        onClose={() => setShowCat12ReconcileModal(false)}
        onSuccess={() => {
          // Success callback
        }}
      />
    </div>
  );
}
