import { Database, Warehouse, ShieldAlert, ArrowRightLeft } from 'lucide-react';
import { LocalStockItem, LocalWarehouse } from '../types';

interface StockTabProps {
  stock: LocalStockItem[];
  warehouses: LocalWarehouse[];
  onSyncStock: () => void;
  isSyncing: boolean;
}

export function StockTab({
  stock,
  warehouses,
  onSyncStock,
  isSyncing
}: StockTabProps) {
  return (
    <div className="space-y-6">
      {/* Warehouses Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Warehouse className="w-4 h-4 text-emerald-400" />
            <span>Active Warehouses ({warehouses.length})</span>
          </h3>
          <button
            id="stock-tab-sync-btn"
            onClick={onSyncStock}
            disabled={isSyncing}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium disabled:opacity-50"
          >
            {isSyncing ? 'Refreshing stock...' : '↻ Refresh Stock Balance'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {warehouses.length === 0 ? (
            <div className="col-span-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-500 text-center">
              No warehouses synced yet. Click "Refresh Stock Balance" to pull from SalesDoc.
            </div>
          ) : (
            warehouses.map((wh) => (
              <div key={wh.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-slate-200 text-xs">{wh.name}</h4>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      1C: {wh.code_1c || '—'} | SD: {wh.salesdoc_id || '—'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      wh.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {wh.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stock Levels Table */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
          <Database className="w-4 h-4 text-blue-400" />
          <span>Real-Time Warehouse Stock & Reserves ({stock.length} lines)</span>
        </h3>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Warehouse / Store</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">1C Code</th>
                  <th className="px-4 py-3 text-right">On Hand Qty</th>
                  <th className="px-4 py-3 text-right">Reserved Qty</th>
                  <th className="px-4 py-3 text-right">Available for Sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No stock data recorded yet.
                    </td>
                  </tr>
                ) : (
                  stock.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 text-slate-300 font-medium">
                        {item.store_name || item.store_id || 'Central Warehouse'}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {item.product_name || item.product_id || 'Product'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {item.product_code_1C || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-100">
                        {item.quantity?.toLocaleString() || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-400 font-medium">
                        {item.reserve?.toLocaleString() || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                        {(item.available !== undefined ? item.available : (item.quantity || 0) - (item.reserve || 0)).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
