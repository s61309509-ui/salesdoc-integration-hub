import { useState } from 'react';
import { Send, Play, Terminal, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

const PRESET_METHODS: Record<string, { params: any; data: any; description: string }> = {
  getProduct: {
    params: { limit: 10, page: 1 },
    data: {},
    description: 'Fetch products catalog with prices and barcodes (9.1)'
  },
  getClient: {
    params: { limit: 10, page: 1 },
    data: {},
    description: 'Fetch registered clients with addresses, phones, and categories (9.7)'
  },
  getOrder: {
    params: { limit: 10, page: 1, filter: { include: 'all' } },
    data: {},
    description: 'Fetch sales orders with details and statuses (9.26)'
  },
  getWarehouse: {
    params: {},
    data: {},
    description: 'Fetch company warehouse list (9.22)'
  },
  getStock: {
    params: {},
    data: {},
    description: 'Fetch real-time stock balances grouped by warehouse (9.24)'
  },
  getFilials: {
    params: {},
    data: {},
    description: 'Fetch company filials and branches (9.39)'
  },
  getAgent: {
    params: {},
    data: {},
    description: 'Fetch sales agents and representatives (9.11)'
  },
  getBalance: {
    params: {},
    data: {},
    description: 'Fetch client debt balances (9.29)'
  },
  getPayment: {
    params: { limit: 10, page: 1 },
    data: {},
    description: 'Fetch incoming payments and receipts (9.15)'
  },
  setProduct: {
    params: {},
    data: {
      product: [
        {
          code_1C: 'TEST_PROD_001',
          name: 'Explorer Test Product 1L',
          active: true,
          unit: { code_1C: 'dona', name: 'dona' },
          category: { code_1C: 'CAT_TEST', name: 'Test Category' }
        }
      ]
    },
    description: 'Create or update products in SalesDoc catalog (10.6)'
  },
  setOrder: {
    params: {},
    data: {
      order: [
        {
          code_1C: 'ORD-TEST-001',
          document_1C: 'ORD-TEST-001',
          date: '2026-09-07 10:00:00',
          client: { code_1C: '000000100' },
          comment: 'Test order from API Explorer',
          detail: [
            {
              code_1C: '000000015',
              quantity: 5,
              price: 15000,
              summa: 75000
            }
          ]
        }
      ]
    },
    description: 'Create or update sales order (12.2)'
  }
};

export function ApiExplorerTab() {
  const [selectedMethod, setSelectedMethod] = useState('getProduct');
  const [paramsJson, setParamsJson] = useState(JSON.stringify(PRESET_METHODS['getProduct'].params, null, 2));
  const [dataJson, setDataJson] = useState(JSON.stringify(PRESET_METHODS['getProduct'].data, null, 2));
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [responseOutput, setResponseOutput] = useState<any>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSelectMethod = (m: string) => {
    setSelectedMethod(m);
    const preset = PRESET_METHODS[m] || { params: {}, data: {} };
    setParamsJson(JSON.stringify(preset.params, null, 2));
    setDataJson(JSON.stringify(preset.data, null, 2));
  };

  const handleExecute = async () => {
    setLoading(true);
    setErrorText(null);
    setResponseOutput(null);
    setLatency(null);

    let parsedParams = {};
    let parsedData = {};

    try {
      if (paramsJson.trim()) parsedParams = JSON.parse(paramsJson);
    } catch (e: any) {
      setErrorText(`JSON syntax error in "params": ${e.message}`);
      setLoading(false);
      return;
    }

    try {
      if (dataJson.trim()) parsedData = JSON.parse(dataJson);
    } catch (e: any) {
      setErrorText(`JSON syntax error in "data": ${e.message}`);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/salesdoc/raw-invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: selectedMethod,
          params: parsedParams,
          data: parsedData,
          dryRun
        })
      });

      const body = await res.json();
      if (!res.ok && !body.data) {
        setErrorText(body.error || `HTTP ${res.status} Error`);
      } else {
        setResponseOutput(body);
        if (body.latencyMs !== undefined) setLatency(body.latencyMs);
      }
    } catch (err: any) {
      setErrorText(err.message || 'Request network failure');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Description */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>SalesDoc API V2 Interactive Explorer</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute live SalesDoc requests with custom params & data payloads.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-xs text-amber-300 cursor-pointer bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-amber-500 text-amber-500 focus:ring-0"
              />
              <span>Dry Run Simulation</span>
            </label>

            <button
              id="api-explorer-execute-btn"
              onClick={handleExecute}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs px-4 py-2 rounded-lg transition shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{loading ? 'Sending...' : 'Send Request'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Request Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Method (SalesDoc API V2)
            </label>
            <select
              id="api-explorer-method-select"
              value={selectedMethod}
              onChange={(e) => handleSelectMethod(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-hidden focus:border-emerald-500"
            >
              {Object.keys(PRESET_METHODS).map((m) => (
                <option key={m} value={m}>
                  {m} — {PRESET_METHODS[m].description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Query "params" (JSON)
            </label>
            <textarea
              rows={4}
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Body "data" (JSON for set* methods)
            </label>
            <textarea
              rows={6}
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Right: Response Output */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <span>API Response</span>
              {latency !== null && (
                <span className="text-emerald-400 font-mono text-[11px]">({latency} ms)</span>
              )}
            </div>
            {responseOutput && (
              <span className="text-[11px] text-slate-500">
                Status: {responseOutput.data?.status ? 'true' : 'false'}
              </span>
            )}
          </div>

          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs overflow-auto max-h-[460px]">
            {errorText ? (
              <div className="text-rose-400 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorText}</span>
              </div>
            ) : responseOutput ? (
              <pre className="text-slate-300 whitespace-pre-wrap">
                {JSON.stringify(responseOutput, null, 2)}
              </pre>
            ) : (
              <div className="text-slate-600 italic h-full flex items-center justify-center">
                Select a method and click "Send Request" to test SalesDoc live API.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
