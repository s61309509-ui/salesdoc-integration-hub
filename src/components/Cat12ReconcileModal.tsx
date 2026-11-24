import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Building2,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

interface Cat12Client {
  clientId: string;
  clientName: string;
  shippedOrdersCount: number;
  shippedOrdersSum: number;
  currentBalance: number;
  preShippingBalance: number;
  amountToEqualize: number;
  netDebt: number;
  currencies: {
    goodsDebt_d0_2: number;
    cashPaid_d0_5: number;
    transferPaid_d0_6: number;
  };
  orders: Array<{
    id: string;
    dateCreate: string;
    dateDocument: string | null;
    summa: number;
  }>;
}

interface ReconSummary {
  totalClients: number;
  clientsWithShippedOrdersCount: number;
  totalShippedOrdersCount: number;
  totalShippedSum: number;
  totalNetDebt: number;
}

interface Cat12ReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function Cat12ReconcileModal({ isOpen, onClose, onSuccess }: Cat12ReconcileModalProps) {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [clients, setClients] = useState<Cat12Client[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'shipped_orders_sum' | 'net_debt'>('shipped_orders_sum');
  const [dryRun, setDryRun] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/salesdoc/reconcile-cat12');
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch reconciliation data');
      }
      setSummary(json.data.summary);
      setClients(json.data.clients);

      // Default select all clients that have shipped orders or debt
      const activeIds = new Set<string>();
      for (const c of json.data.clients) {
        if (c.shippedOrdersCount > 0 || c.netDebt > 0) {
          activeIds.add(c.clientId);
        }
      }
      setSelectedIds(activeIds);
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReconciliationData();
      setExecutionResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    const next = new Set<string>();
    for (const c of clients) {
      if (c.shippedOrdersCount > 0 || c.netDebt > 0) {
        next.add(c.clientId);
      }
    }
    setSelectedIds(next);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleExecute = async (specificClientId?: string) => {
    setExecuting(true);
    setError(null);
    setExecutionResult(null);

    const clientIdsToPay = specificClientId ? [specificClientId] : Array.from(selectedIds);
    if (clientIdsToPay.length === 0) {
      setError('Hech qanday mijoz tanlanmadi.');
      setExecuting(false);
      return;
    }

    try {
      const res = await fetch('/api/salesdoc/reconcile-cat12/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          clientIds: clientIdsToPay,
          dryRun
        })
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Toʻlovlarni amalga oshirishda xatolik yuz berdi');
      }
      setExecutionResult(json.data);
      if (!dryRun) {
        // Refresh balance table
        await fetchReconciliationData();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setExecuting(false);
    }
  };

  const activeClients = clients.filter((c) => c.shippedOrdersCount > 0 || c.netDebt > 0);
  const totalSelectedPayAmount = activeClients
    .filter((c) => selectedIds.has(c.clientId))
    .reduce((sum, c) => sum + (mode === 'net_debt' ? c.netDebt : c.shippedOrdersSum), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="cat12-reconcile-modal"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                SM-Причисленя Дукон (d0_12) Balans & Naqd Oplata
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  SalesDoc V2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Otgrujen qilingan buyurtmalar boʻyicha balansni tenglash va qolgan summani naqd (НАКД - d0_5) toʻlov bilan yopish
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Summary Stat Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-medium">SM-Причисленя Mijozlar</div>
                <div className="text-lg font-bold text-slate-100 mt-1">
                  {summary.clientsWithShippedOrdersCount} <span className="text-xs text-slate-400 font-normal">/ {summary.totalClients} ta</span>
                </div>
                <div className="text-[10px] text-amber-400 mt-0.5">Otgrujen buyurtmali</div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-medium">Otgrujen Buyurtmalar</div>
                <div className="text-lg font-bold text-blue-400 mt-1">
                  {summary.totalShippedOrdersCount} <span className="text-xs text-slate-400 font-normal">ta zakaz</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Status: 2 (Отгружен)</div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-medium">Jami Otgrujen Summa</div>
                <div className="text-lg font-bold text-emerald-400 mt-1">
                  {summary.totalShippedSum.toLocaleString()} <span className="text-xs text-slate-400 font-normal">UZS</span>
                </div>
                <div className="text-[10px] text-emerald-300 mt-0.5">Tenglash toʻlovi summasi</div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-medium">Jami Qolgan Sof Qarzdorlik</div>
                <div className="text-lg font-bold text-amber-400 mt-1">
                  {summary.totalNetDebt.toLocaleString()} <span className="text-xs text-slate-400 font-normal">UZS</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Net debt balansi</div>
              </div>
            </div>
          )}

          {/* Configuration & Controls */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Mode selection */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                Toʻlov hisoblash usuli (Reconciliation Mode):
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('shipped_orders_sum')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    mode === 'shipped_orders_sum'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Otgrujen buyurtmalar summasi ({summary ? summary.totalShippedSum.toLocaleString() : '...'} UZS)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('net_debt')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    mode === 'net_debt'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Qolgan sof qarzdorlik boʻyicha ({summary ? summary.totalNetDebt.toLocaleString() : '...'} UZS)
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {mode === 'shipped_orders_sum'
                  ? 'Mijozlarning balansini aynan otgruzkadan oldingi holatiga qaytaradi (buyurtmalar summasi naqd toʻlov qilinadi).'
                  : 'Mijozlarning barcha qolgan qarzdorligini naqd toʻlov bilan yopib, balansini 0 ga tenglaydi.'}
              </p>
            </div>

            {/* Dry Run & Actions */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-800"
                />
                <span className="text-xs text-slate-300 font-medium">Sinov rejimi (Dry Run)</span>
              </label>

              <button
                type="button"
                onClick={fetchReconciliationData}
                disabled={loading}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                title="Maʻlumotlarni qayta yangilash"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Execution Results Alert */}
          {executionResult && (
            <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {executionResult.dryRun ? 'Sinov muvaffaqiyatli oʻtdi (Dry Run)' : 'Toʻlovlar SalesDoc ga yuborildi!'}
                  </span>
                </div>
                <div className="text-xs text-emerald-300">
                  {executionResult.completedCount} ta muvaffaqiyatli | Jami: {executionResult.totalPaidAmount?.toLocaleString()} UZS
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {executionResult.results.map((r: any, idx: number) => (
                  <div key={idx} className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="font-medium text-slate-200">{r.clientName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{r.code_1C} • {r.paymentType}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{r.amount.toLocaleString()} UZS</div>
                      <div className="text-[10px] text-emerald-300 font-semibold uppercase">{r.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3 flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Clients List Table */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-200">
                  SM-Причисленя Дукон mijozlari ({activeClients.length} ta faol)
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-blue-400 hover:text-blue-300 underline text-[11px]"
                  >
                    Barchasini tanlash
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-slate-400 hover:text-slate-300 underline text-[11px]"
                  >
                    Bekor qilish
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Toʻlov turi: <span className="font-semibold text-emerald-400">d0_5 (НАКД)</span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-xs">SalesDoc dan balanslar va otgrujen buyurtmalar hisoblanmoqda...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === activeClients.length}
                          onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                          className="rounded border-slate-600 text-amber-600 bg-slate-800"
                        />
                      </th>
                      <th className="px-3 py-2.5">Mijoz (SM-Причисленя)</th>
                      <th className="px-3 py-2.5 text-center">Otgrujen Buyurtmalar</th>
                      <th className="px-3 py-2.5 text-right">Hozirgi Balans</th>
                      <th className="px-3 py-2.5 text-right">Valyuta Taqsimoti</th>
                      <th className="px-3 py-2.5 text-right font-bold text-amber-400">
                        {mode === 'shipped_orders_sum' ? 'Tenglash Toʻlovi (Naqd)' : 'Qolgan Qarzdorlik (Naqd)'}
                      </th>
                      <th className="px-3 py-2.5 text-center">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeClients.map((client) => {
                      const isSelected = selectedIds.has(client.clientId);
                      const isExpanded = expandedClientId === client.clientId;
                      const payAmount = mode === 'net_debt' ? client.netDebt : client.shippedOrdersSum;

                      return (
                        <React.Fragment key={client.clientId}>
                          <tr
                            className={`hover:bg-slate-800/40 transition ${
                              isSelected ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(client.clientId)}
                                className="rounded border-slate-600 text-amber-600 bg-slate-800"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-semibold text-slate-100">{client.clientName}</div>
                              <div className="text-[10px] font-mono text-slate-500">ID: {client.clientId}</div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedClientId(isExpanded ? null : client.clientId)}
                                className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-blue-300 px-2 py-0.5 rounded text-[11px] font-medium"
                              >
                                {client.shippedOrdersCount} ta ({client.shippedOrdersSum.toLocaleString()} UZS)
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              <span
                                className={`font-semibold ${
                                  client.currentBalance < 0
                                    ? 'text-rose-400'
                                    : client.currentBalance > 0
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {client.currentBalance.toLocaleString()} UZS
                              </span>
                              <div className="text-[10px] text-slate-500">
                                Oldingi: ~{client.preShippingBalance.toLocaleString()} UZS
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-[11px] space-y-0.5">
                              <div className="text-slate-400">
                                Naqd (d0_5):{' '}
                                <span className="text-emerald-400 font-mono">
                                  {client.currencies.cashPaid_d0_5.toLocaleString()}
                                </span>
                              </div>
                              <div className="text-slate-400">
                                Bank (d0_6):{' '}
                                <span className="text-blue-400 font-mono">
                                  {client.currencies.transferPaid_d0_6.toLocaleString()}
                                </span>
                              </div>
                              <div className="text-slate-500 text-[10px]">
                                Yuk (d0_2): {client.currencies.goodsDebt_d0_2.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-bold text-amber-400 font-mono text-sm">
                                {payAmount.toLocaleString()} UZS
                              </span>
                              <div className="text-[10px] text-slate-400">d0_5 (НАКД)</div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                disabled={executing || payAmount <= 0}
                                onClick={() => handleExecute(client.clientId)}
                                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-[11px] px-2.5 py-1 rounded-md transition shadow-xs"
                              >
                                Naqd toʻlash
                              </button>
                            </td>
                          </tr>

                          {/* Expanded order details */}
                          {isExpanded && (
                            <tr className="bg-slate-900/70">
                              <td colSpan={7} className="px-6 py-3">
                                <div className="text-[11px] font-semibold text-slate-300 mb-2">
                                  {client.clientName} mijozining otgrujen qilingan buyurtmalari roʻyxati:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {client.orders.map((o) => (
                                    <div
                                      key={o.id}
                                      className="bg-slate-950/80 border border-slate-800 p-2 rounded-lg text-[11px] flex justify-between items-center"
                                    >
                                      <div>
                                        <div className="font-mono font-medium text-slate-200">{o.id}</div>
                                        <div className="text-[10px] text-slate-500">{o.dateCreate}</div>
                                      </div>
                                      <div className="text-right font-mono text-amber-300 font-semibold">
                                        {o.summa.toLocaleString()} UZS
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Tanlangan: <span className="font-semibold text-slate-200">{selectedIds.size} ta mijoz</span> | Jami toʻlov summasi:{' '}
            <span className="font-bold text-amber-400 text-sm">{totalSelectedPayAmount.toLocaleString()} UZS</span> (НАКД)
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              Yopish
            </button>
            <button
              type="button"
              id="execute-cat12-pay-btn"
              disabled={executing || selectedIds.size === 0 || totalSelectedPayAmount <= 0}
              onClick={() => handleExecute()}
              className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-lg transition shadow-md"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>SalesDoc ga toʻlanmoqda...</span>
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  <span>
                    {dryRun ? 'Sinov toʻlovini yuborish (Dry Run)' : 'Tanlanganlarni Naqtda Oplata Qilish'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
