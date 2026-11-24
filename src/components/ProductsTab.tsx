import { useState, FormEvent } from 'react';
import { LocalProduct } from '../types';
import { Search, Plus, UploadCloud, CheckCircle2, Clock, AlertCircle, Tag, Barcode } from 'lucide-react';

interface ProductsTabProps {
  products: LocalProduct[];
  onAddProduct: (product: { name: string; price: number; category: string; barcode: string; unit: string }) => Promise<void>;
  onPushProduct: (id: string) => Promise<void>;
  loadingActionId: string | null;
}

export function ProductsTab({
  products,
  onAddProduct,
  onPushProduct,
  loadingActionId
}: ProductsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('15000');
  const [newProdCategory, setNewProdCategory] = useState('Ichimliklar');
  const [newProdBarcode, setNewProdBarcode] = useState('4780001239999');
  const [newProdUnit, setNewProdUnit] = useState('dona');
  const [submitting, setSubmitting] = useState(false);

  const filtered = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.code_1c?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term) ||
      p.category?.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdPrice) return;

    setSubmitting(true);
    try {
      await onAddProduct({
        name: newProdName.trim(),
        price: parseFloat(newProdPrice),
        category: newProdCategory.trim(),
        barcode: newProdBarcode.trim(),
        unit: newProdUnit.trim()
      });
      setShowAddModal(false);
      setNewProdName('');
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
            id="products-search-input"
            type="text"
            placeholder="Search by name, 1C code, barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <button
          id="add-product-btn"
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Product</span>
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">1C Code</th>
                <th className="px-4 py-3">SalesDoc ID</th>
                <th className="px-4 py-3">Category / Unit</th>
                <th className="px-4 py-3 text-right">Price (UZS)</th>
                <th className="px-4 py-3 text-center">Sync Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const isPushing = loadingActionId === product.id;

                  return (
                    <tr key={product.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <div>{product.name}</div>
                        {product.barcode && (
                          <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                            <Barcode className="w-3 h-3" />
                            <span>{product.barcode}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {product.code_1c || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {product.salesdoc_id ? (
                          <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                            {product.salesdoc_id}
                          </span>
                        ) : (
                          <span className="text-slate-600">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1 text-slate-400">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span>{product.category || 'General'}</span>
                          <span className="text-slate-600">({product.unit})</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-100">
                        {product.price.toLocaleString()} UZS
                      </td>
                      <td className="px-4 py-3 text-center">
                        {product.sync_status === 'synced' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Synced</span>
                          </span>
                        ) : product.sync_status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            title={product.last_error}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          id={`push-prod-${product.id}`}
                          onClick={() => onPushProduct(product.id)}
                          disabled={isPushing}
                          className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition disabled:opacity-50"
                          title="Push/Update to SalesDoc API (setProduct)"
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

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl text-slate-200">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Create New Local Product</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sprite 1.5L"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Price (UZS) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Ichimliklar"
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Barcode</label>
                <input
                  type="text"
                  placeholder="478000..."
                  value={newProdBarcode}
                  onChange={(e) => setNewProdBarcode(e.target.value)}
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
                {submitting ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
