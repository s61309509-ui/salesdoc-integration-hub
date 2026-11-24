import { useState, useEffect } from 'react';
import {
  LocalCustomer,
  LocalOrder,
  LocalPayment,
  LocalProduct,
  LocalStockItem,
  LocalWarehouse,
  StatusData,
  SyncLogEntry
} from './types';
import { Header } from './components/Header';
import { MetricsOverview } from './components/MetricsOverview';
import { SyncControlPanel } from './components/SyncControlPanel';
import { ProductsTab } from './components/ProductsTab';
import { ClientsTab } from './components/ClientsTab';
import { OrdersTab } from './components/OrdersTab';
import { StockTab } from './components/StockTab';
import { PaymentsTab } from './components/PaymentsTab';
import { SyncLogsTab } from './components/SyncLogsTab';
import { ApiExplorerTab } from './components/ApiExplorerTab';
import { AgentsTab } from './components/AgentsTab';
import { VisitsMonitoringTab } from './components/VisitsMonitoringTab';
import { GoogleSheetsTab } from './components/GoogleSheetsTab';
import { AiAnalystTab } from './components/AiAnalystTab';
import {
  Package,
  Users,
  ShoppingCart,
  Database,
  CreditCard,
  History,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  Camera,
  FileSpreadsheet,
  Sparkles,
  X
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'sheets' | 'visits' | 'orders' | 'agents' | 'products' | 'clients' | 'stock' | 'payments' | 'logs' | 'explorer' | 'ai'>('sheets');
  const [orderAgentFilterInitial, setOrderAgentFilterInitial] = useState<string>('all');
  const [orderDeviceFilterInitial, setOrderDeviceFilterInitial] = useState<'all' | 'dev_1' | 'dev_2'>('all');

  // Backend state
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [clients, setClients] = useState<LocalCustomer[]>([]);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [stock, setStock] = useState<LocalStockItem[]>([]);
  const [warehouses, setWarehouses] = useState<LocalWarehouse[]>([]);
  const [payments, setPayments] = useState<LocalPayment[]>([]);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);

  // State flags
  const [testingConnection, setTestingConnection] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | undefined>();
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  // Initial load - lightweight status only
  const loadAllData = async () => {
    try {
      const statusRes = await fetch('/api/salesdoc/status').then((r) => r.json());
      if (statusRes.success) setStatusData(statusRes.data);
    } catch (err: any) {
      console.error('Error fetching status:', err);
    }
  };

  // Load specific tab data on-demand to save memory and avoid freezing
  const loadTabData = async (tab: string) => {
    try {
      if (tab === 'products') {
        const prodRes = await fetch('/api/salesdoc/products').then((r) => r.json());
        if (prodRes.success) setProducts(prodRes.data);
      } else if (tab === 'clients') {
        const clientRes = await fetch('/api/salesdoc/clients').then((r) => r.json());
        if (clientRes.success) setClients(clientRes.data);
      } else if (tab === 'orders') {
        const orderRes = await fetch('/api/salesdoc/orders').then((r) => r.json());
        if (orderRes.success) setOrders(orderRes.data);
      } else if (tab === 'stock') {
        const [stockRes, whRes] = await Promise.all([
          fetch('/api/salesdoc/stock').then((r) => r.json()),
          fetch('/api/salesdoc/warehouses').then((r) => r.json())
        ]);
        if (stockRes.success) setStock(stockRes.data);
        if (whRes.success) setWarehouses(whRes.data);
      } else if (tab === 'payments') {
        const payRes = await fetch('/api/salesdoc/payments').then((r) => r.json());
        if (payRes.success) setPayments(payRes.data);
      } else if (tab === 'logs') {
        const logsRes = await fetch('/api/salesdoc/sync/logs').then((r) => r.json());
        if (logsRes.success) setLogs(logsRes.data);
      }
    } catch (err: any) {
      console.error('Error fetching tab data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  // Handlers
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/salesdoc/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data.connected) {
        showToast(`SalesDoc Connected successfully (${data.data.latencyMs}ms)!`, 'success');
      } else {
        showToast(data.data?.message || data.error || 'Connection failed', 'error');
      }
      loadAllData();
      return data.data;
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleToggleDryRun = async (enabled: boolean) => {
    try {
      const res = await fetch('/api/salesdoc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: enabled })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Dry Run mode set to ${enabled ? 'ENABLED' : 'DISABLED'}`, 'info');
        loadAllData();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateConfig = async (updates: { baseUrl?: string; token?: string; userId?: string; filialId?: string }) => {
    try {
      const res = await fetch('/api/salesdoc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        showToast('SalesDoc sozlamalari yangilandi', 'success');
        await loadAllData();
        return true;
      } else {
        showToast(data.error || 'Sozlamalarni yangilab bo\'lmadi', 'error');
        return false;
      }
    } catch (err: any) {
      showToast(err.message, 'error');
      return false;
    }
  };

  const handleSyncOperation = async (endpoint: string, label: string) => {
    setIsSyncing(true);
    setSyncStep(label);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`${label} completed successfully!`, 'success');
      } else {
        showToast(`${label} error: ${data.error || 'Check logs'}`, 'error');
      }
      await loadAllData();
    } catch (err: any) {
      showToast(`Sync network error: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
      setSyncStep(undefined);
    }
  };

  // Products
  const handleAddProduct = async (productData: any) => {
    const res = await fetch('/api/salesdoc/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Product "${productData.name}" created locally`, 'success');
      loadAllData();
    } else {
      showToast(data.error || 'Failed to create product', 'error');
    }
  };

  const handlePushProduct = async (id: string) => {
    setLoadingActionId(id);
    try {
      const res = await fetch(`/api/salesdoc/products/${id}/push`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Product synced to SalesDoc successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to push product to SalesDoc', 'error');
      }
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Clients
  const handleAddClient = async (clientData: any) => {
    const res = await fetch('/api/salesdoc/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Client "${clientData.name}" registered locally`, 'success');
      loadAllData();
    } else {
      showToast(data.error || 'Failed to add client', 'error');
    }
  };

  const handlePushClient = async (id: string) => {
    setLoadingActionId(id);
    try {
      const res = await fetch(`/api/salesdoc/clients/${id}/push`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Client synced to SalesDoc successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to push client to SalesDoc', 'error');
      }
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Orders
  const handleCreateOrder = async (orderData: any) => {
    const res = await fetch('/api/salesdoc/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Order created successfully! Ready to push to SalesDoc.`, 'success');
      loadAllData();
    } else {
      showToast(data.error || 'Order creation failed', 'error');
      throw new Error(data.error);
    }
  };

  const handlePushOrder = async (id: string, force: boolean = false) => {
    setLoadingActionId(id);
    try {
      const res = await fetch(`/api/salesdoc/orders/${id}/push${force ? '?force=true' : ''}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Order #${id} dispatched and synced with SalesDoc!`, 'success');
      } else {
        showToast(data.error || 'Failed to push order to SalesDoc', 'error');
      }
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleUpdateOrderStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/salesdoc/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Order status updated to ${status}`, 'success');
        loadAllData();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCancelOrder = async (id: string) => {
    try {
      const res = await fetch(`/api/salesdoc/orders/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Order #${id} cancelled and marked in SalesDoc`, 'info');
        loadAllData();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Payments
  const handleAddPayment = async (paymentData: any) => {
    const res = await fetch('/api/salesdoc/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Payment transaction logged', 'success');
      loadAllData();
    } else {
      showToast(data.error || 'Failed to log payment', 'error');
    }
  };

  const handlePushPayment = async (id: string) => {
    setLoadingActionId(id);
    try {
      const res = await fetch(`/api/salesdoc/payments/${id}/push`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Payment pushed to SalesDoc successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to push payment', 'error');
      }
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Header */}
      <Header
        statusData={statusData}
        onTestConnection={handleTestConnection}
        testingConnection={testingConnection}
        onToggleDryRun={handleToggleDryRun}
        onUpdateConfig={handleUpdateConfig}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`mb-5 p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all shadow-md ${
              toast.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
                : toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/30 text-rose-300'
                : 'bg-blue-950/80 border-blue-500/30 text-blue-300'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span className="font-medium">{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-white/10 rounded-md transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <MetricsOverview metrics={statusData?.metrics} />

        {/* Sync Control Center */}
        <SyncControlPanel
          onSyncAll={() => handleSyncOperation('/api/salesdoc/sync/all', 'Full System Sync')}
          onSyncProducts={() => handleSyncOperation('/api/salesdoc/sync/products', 'Syncing Products')}
          onSyncClients={() => handleSyncOperation('/api/salesdoc/sync/clients', 'Syncing Clients')}
          onSyncOrders={() => handleSyncOperation('/api/salesdoc/sync/orders', 'Syncing Orders')}
          onSyncStock={() => handleSyncOperation('/api/salesdoc/sync/stock', 'Syncing Stock')}
          onSyncPayments={() => handleSyncOperation('/api/salesdoc/sync/payments', 'Syncing Payments')}
          isSyncing={isSyncing}
          syncStep={syncStep}
        />

        {/* Navigation Tabs */}
        <div className="border-b border-slate-800 mb-6 flex items-center space-x-1 sm:space-x-2 overflow-x-auto pb-1 text-xs font-medium">
          <button
            id="nav-tab-sheets"
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'sheets'
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Google Sheets (1 & 2-Komanda)</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
              Doimiy to'ldirish
            </span>
          </button>

          <button
            id="nav-tab-visits"
            onClick={() => setActiveTab('visits')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'visits'
                ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>Tashrif & Polka Nazorati</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full">
              Avto-Monitoring
            </span>
          </button>

          <button
            id="nav-tab-orders"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'orders'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Orders ({orders.length})</span>
          </button>

          <button
            id="nav-tab-agents"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'agents'
                ? 'bg-slate-800 text-indigo-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Agentlar & Komandalar</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
              1 / 2 Komanda
            </span>
          </button>

          <button
            id="nav-tab-products"
            onClick={() => setActiveTab('products')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'products'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Products ({products.length})</span>
          </button>

          <button
            id="nav-tab-clients"
            onClick={() => setActiveTab('clients')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'clients'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Clients & Debt ({clients.length})</span>
          </button>

          <button
            id="nav-tab-stock"
            onClick={() => setActiveTab('stock')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'stock'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Warehouses & Stock ({stock.length})</span>
          </button>

          <button
            id="nav-tab-payments"
            onClick={() => setActiveTab('payments')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'payments'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Payments ({payments.length})</span>
          </button>

          <button
            id="nav-tab-logs"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Logs ({logs.length})</span>
          </button>

          <button
            id="nav-tab-explorer"
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'explorer'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>API Explorer</span>
          </button>

          <button
            id="nav-tab-ai"
            onClick={() => setActiveTab('ai')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg transition shrink-0 ${
              activeTab === 'ai'
                ? 'bg-slate-800 text-purple-300 border border-purple-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>AI Tahlilchi</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
              Gemini Vision & Audit
            </span>
          </button>
        </div>

        {/* Tab Content Panes */}
        <div>
          {activeTab === 'sheets' && (
            <GoogleSheetsTab onShowToast={showToast} />
          )}

          {activeTab === 'visits' && (
            <VisitsMonitoringTab onShowToast={showToast} />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              products={products}
              clients={clients}
              onCreateOrder={handleCreateOrder}
              onPushOrder={handlePushOrder}
              onUpdateStatus={handleUpdateOrderStatus}
              onCancelOrder={handleCancelOrder}
              loadingActionId={loadingActionId}
              agentFilterInitial={orderAgentFilterInitial}
              deviceFilterInitial={orderDeviceFilterInitial}
            />
          )}

          {activeTab === 'agents' && (
            <AgentsTab
              onSelectAgentFilter={(agentId, deviceKey) => {
                setOrderAgentFilterInitial(agentId);
                setOrderDeviceFilterInitial(deviceKey || 'all');
                setActiveTab('orders');
              }}
            />
          )}

          {activeTab === 'products' && (
            <ProductsTab
              products={products}
              onAddProduct={handleAddProduct}
              onPushProduct={handlePushProduct}
              loadingActionId={loadingActionId}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsTab
              clients={clients}
              onAddClient={handleAddClient}
              onPushClient={handlePushClient}
              loadingActionId={loadingActionId}
            />
          )}

          {activeTab === 'stock' && (
            <StockTab
              stock={stock}
              warehouses={warehouses}
              onSyncStock={() => handleSyncOperation('/api/salesdoc/sync/stock', 'Syncing Stock')}
              isSyncing={isSyncing}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsTab
              payments={payments}
              clients={clients}
              onAddPayment={handleAddPayment}
              onPushPayment={handlePushPayment}
              loadingActionId={loadingActionId}
            />
          )}

          {activeTab === 'logs' && (
            <SyncLogsTab
              logs={logs}
              onRefreshLogs={loadAllData}
              isLoading={false}
            />
          )}

          {activeTab === 'explorer' && <ApiExplorerTab />}

          {activeTab === 'ai' && <AiAnalystTab onShowToast={showToast} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 mt-12 text-center text-xs text-slate-500">
        <p>
          SalesDoc API V2 Production Integration Architecture • Enterprise Client & Idempotent Order Dispatcher
        </p>
      </footer>
    </div>
  );
}
