import { Clock, CheckCircle, XCircle, Gauge, Package, Users, ShoppingCart, Database } from 'lucide-react';
import { SyncMetrics } from '../types';

interface MetricsOverviewProps {
  metrics?: SyncMetrics;
}

export function MetricsOverview({ metrics }: MetricsOverviewProps) {
  if (!metrics) return null;

  const totalReq = metrics.total_requests || 0;
  const successRate = totalReq > 0 ? Math.round((metrics.successful_requests / totalReq) * 100) : 100;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Metric 1: Health & Latency */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">API Response</span>
          <Gauge className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {metrics.average_latency_ms || 0}
            </span>
            <span className="text-xs text-slate-400">ms avg</span>
          </div>
          <div className="text-[11px] text-emerald-400/90 mt-1 flex items-center space-x-1">
            <CheckCircle className="w-3 h-3" />
            <span>Success rate: {successRate}%</span>
          </div>
        </div>
      </div>

      {/* Metric 2: Sync Operations */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Sync Operations</span>
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <div className="mt-2">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight">{totalReq}</span>
            <span className="text-xs text-slate-400">requests</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
            <span className="text-emerald-400 font-medium">{metrics.successful_requests} ok</span>
            <span>•</span>
            <span className={metrics.failed_requests > 0 ? 'text-rose-400 font-medium' : 'text-slate-500'}>
              {metrics.failed_requests} err
            </span>
          </div>
        </div>
      </div>

      {/* Metric 3: Synced Catalog */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Catalog & Clients</span>
          <Package className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="mt-2">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {metrics.products_count}
            </span>
            <span className="text-xs text-slate-400">products</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
            <Users className="w-3 h-3 text-slate-400" />
            <span>{metrics.clients_count} registered clients</span>
          </div>
        </div>
      </div>

      {/* Metric 4: Orders & Stock */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Orders & Stock</span>
          <ShoppingCart className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {metrics.orders_count}
            </span>
            <span className="text-xs text-slate-400">orders</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
            <Database className="w-3 h-3 text-slate-400" />
            <span>{metrics.stock_items_count} warehouse items</span>
          </div>
        </div>
      </div>
    </div>
  );
}
