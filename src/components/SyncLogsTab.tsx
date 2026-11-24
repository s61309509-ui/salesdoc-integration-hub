import { useState } from 'react';
import { SyncLogEntry } from '../types';
import { CheckCircle2, AlertCircle, Clock, ArrowDownLeft, ArrowUpRight, ShieldCheck, Filter } from 'lucide-react';

interface SyncLogsTabProps {
  logs: SyncLogEntry[];
  onRefreshLogs: () => void;
  isLoading: boolean;
}

export function SyncLogsTab({ logs, onRefreshLogs, isLoading }: SyncLogsTabProps) {
  const [filterEntity, setFilterEntity] = useState('all');
  const [selectedLog, setSelectedLog] = useState<SyncLogEntry | null>(null);

  const filtered = logs.filter((log) => {
    if (filterEntity === 'all') return true;
    return log.entity === filterEntity;
  });

  return (
    <div>
      {/* Filters Bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            id="sync-logs-entity-filter"
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-hidden"
          >
            <option value="all">All Entities</option>
            <option value="product">Products</option>
            <option value="client">Clients</option>
            <option value="order">Orders</option>
            <option value="stock">Stock</option>
            <option value="payment">Payments</option>
          </select>
        </div>

        <button
          id="refresh-logs-btn"
          onClick={onRefreshLogs}
          disabled={isLoading}
          className="text-xs text-emerald-400 hover:text-emerald-300 font-medium disabled:opacity-50"
        >
          {isLoading ? 'Loading logs...' : '↻ Refresh Logs'}
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3 text-right">Processed / Failed</th>
                <th className="px-4 py-3 text-right">Latency</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-sans">
                    No sync logs recorded yet.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const isSuccess = log.status === 'success';
                  const isInbound = log.direction === 'inbound';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="px-4 py-2.5 text-slate-400 text-[11px] whitespace-nowrap font-sans">
                        {new Date(log.timestamp).toLocaleTimeString()} {new Date(log.timestamp).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 font-sans">
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] ${
                            isInbound
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {isInbound ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span>{isInbound ? 'Pull (In)' : 'Push (Out)'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-200">
                        {log.method}
                      </td>
                      <td className="px-4 py-2.5 capitalize font-sans text-slate-400">
                        {log.entity}
                      </td>
                      <td className="px-4 py-2.5 text-right font-sans">
                        <span className="text-emerald-400">{log.records_processed}</span>
                        {log.records_failed > 0 && (
                          <span className="text-rose-400 font-semibold ml-1">/ {log.records_failed} failed</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 font-sans">
                        {log.duration_ms} ms
                      </td>
                      <td className="px-4 py-2.5 text-center font-sans">
                        {isSuccess ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>OK</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 text-rose-400 text-[11px]"
                            title={log.error_message}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full text-slate-200 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3 flex items-center justify-between">
              <span>Log Entry Details</span>
              <span className="text-xs font-mono text-slate-400">{selectedLog.id}</span>
            </h3>

            <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Timestamp:</span>
                <span className="text-slate-300">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Method:</span>
                <span className="text-slate-200 font-bold">{selectedLog.method}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Direction:</span>
                <span className="text-slate-300">{selectedLog.direction.toUpperCase()}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Processed Count:</span>
                <span className="text-emerald-400">{selectedLog.records_processed}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Failed Count:</span>
                <span className={selectedLog.records_failed > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                  {selectedLog.records_failed}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">Duration:</span>
                <span className="text-slate-300">{selectedLog.duration_ms} ms</span>
              </div>
              {selectedLog.error_message && (
                <div className="pt-2">
                  <span className="text-rose-400 font-semibold block mb-1">Error Message:</span>
                  <p className="text-rose-300 bg-rose-950/40 p-2 rounded border border-rose-900/40 text-[11px] break-words whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
