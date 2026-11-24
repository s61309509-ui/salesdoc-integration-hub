import { RefreshCw, Package, Users, ShoppingCart, Database, CreditCard, Sparkles } from 'lucide-react';

interface SyncControlPanelProps {
  onSyncAll: () => void;
  onSyncProducts: () => void;
  onSyncClients: () => void;
  onSyncOrders: () => void;
  onSyncStock: () => void;
  onSyncPayments: () => void;
  isSyncing: boolean;
  syncStep?: string;
}

export function SyncControlPanel({
  onSyncAll,
  onSyncProducts,
  onSyncClients,
  onSyncOrders,
  onSyncStock,
  onSyncPayments,
  isSyncing,
  syncStep
}: SyncControlPanelProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Title and Active Status */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <span>SalesDoc Sync Control Center</span>
            {isSyncing && (
              <span className="flex items-center space-x-1.5 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full lowercase tracking-normal">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{syncStep || 'Synchronizing...'}</span>
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Trigger automated two-way synchronization between your local ERP repository and SalesDoc API V2.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selective Triggers */}
          <button
            id="sync-products-btn"
            onClick={onSyncProducts}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
          >
            <Package className="w-3.5 h-3.5 text-indigo-400" />
            <span>Sync Products</span>
          </button>

          <button
            id="sync-clients-btn"
            onClick={onSyncClients}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
          >
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>Sync Clients</span>
          </button>

          <button
            id="sync-orders-btn"
            onClick={onSyncOrders}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
            <span>Sync Orders</span>
          </button>

          <button
            id="sync-stock-btn"
            onClick={onSyncStock}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sync Stock</span>
          </button>

          <button
            id="sync-payments-btn"
            onClick={onSyncPayments}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700 transition"
          >
            <CreditCard className="w-3.5 h-3.5 text-violet-400" />
            <span>Sync Payments</span>
          </button>

          {/* Master Full Sync Action */}
          <button
            id="sync-all-master-btn"
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-sm transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Full System Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
