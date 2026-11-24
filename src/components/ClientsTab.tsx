import { useState, FormEvent } from 'react';
import { LocalCustomer } from '../types';
import { Search, Plus, UploadCloud, CheckCircle2, Clock, AlertCircle, Phone, MapPin, Building } from 'lucide-react';

interface ClientsTabProps {
  clients: LocalCustomer[];
  onAddClient: (client: { name: string; phone: string; address: string; inn: string; category: string }) => Promise<void>;
  onPushClient: (id: string) => Promise<void>;
  loadingActionId: string | null;
}

export function ClientsTab({
  clients,
  onAddClient,
  onPushClient,
  loadingActionId
}: ClientsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('+998');
  const [clientAddress, setClientAddress] = useState('');
  const [clientInn, setClientInn] = useState('');
  const [clientCategory, setClientCategory] = useState('Chakana savdo');
  const [submitting, setSubmitting] = useState(false);

  const filtered = clients.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.code_1c?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.inn?.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    setSubmitting(true);
    try {
      await onAddClient({
        name: clientName.trim(),
        phone: clientPhone.trim(),
        address: clientAddress.trim(),
        inn: clientInn.trim(),
        category: clientCategory.trim()
      });
      setShowAddModal(false);
      setClientName('');
      setClientPhone('+998');
      setClientAddress('');
      setClientInn('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="clients-search-input"
            type="text"
            placeholder="Search clients by name, phone, INN, 1C code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <button
          id="add-client-btn"
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Clients Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Client / Business Name</th>
                <th className="px-4 py-3">1C Code</th>
                <th className="px-4 py-3">SalesDoc ID</th>
                <th className="px-4 py-3">Phone & Address</th>
                <th className="px-4 py-3 text-right">Balance / Debt</th>
                <th className="px-4 py-3 text-center">Sync Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No clients found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const isPushing = loadingActionId === client.id;
                  const isDebt = client.balance < 0;

                  return (
                    <tr key={client.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <div>{client.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Building className="w-3 h-3 text-slate-500" />
                            <span>{client.category || 'Retail'}</span>
                          </span>
                          {client.inn && (
                            <span className="text-slate-500 font-mono">INN: {client.inn}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {client.code_1c || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {client.salesdoc_id ? (
                          <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                            {client.salesdoc_id}
                          </span>
                        ) : (
                          <span className="text-slate-600">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {client.phone && (
                          <div className="flex items-center space-x-1 text-[11px]">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-center space-x-1 text-[10px] text-slate-500 truncate max-w-xs mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{client.address}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                            isDebt
                              ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                              : client.balance > 0
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                              : 'text-slate-400'
                          }`}
                        >
                          {client.balance.toLocaleString()} UZS
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {client.sync_status === 'synced' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Synced</span>
                          </span>
                        ) : client.sync_status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            title={client.last_error}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          id={`push-client-${client.id}`}
                          onClick={() => onPushClient(client.id)}
                          disabled={isPushing}
                          className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition disabled:opacity-50"
                          title="Push/Update to SalesDoc API (setClient)"
                        >
                          <UploadCloud className={`w-3.5 h-3.5 ${isPushing ? 'animate-bounce' : ''}`} />
                          <span>{isPushing ? 'Pushing...' : 'Push to SD'}</span>
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

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Register New Client</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Business / Store Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Makro Supermarket"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+99890..."
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">INN / Tax ID</label>
                  <input
                    type="text"
                    placeholder="9-digit INN"
                    value={clientInn}
                    onChange={(e) => setClientInn(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Category / Channel</label>
                <input
                  type="text"
                  placeholder="e.g. Supermarket, Minimarket, HoReCa"
                  value={clientCategory}
                  onChange={(e) => setClientCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Delivery Address</label>
                <textarea
                  rows={2}
                  placeholder="Toshkent sh., Yunusobod..."
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
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
                {submitting ? 'Saving...' : 'Save Client'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
