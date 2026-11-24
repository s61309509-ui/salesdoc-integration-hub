export type SyncStatus = 'synced' | 'pending' | 'failed' | 'cancelled';

export interface LocalProduct {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  name: string;
  barcode?: string;
  unit: string;
  category?: string;
  price: number;
  stock_quantity: number;
  sync_status: SyncStatus;
  last_synced_at?: string;
  last_error?: string;
  updated_at: string;
}

export interface LocalCustomer {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  name: string;
  phone?: string;
  address?: string;
  inn?: string;
  balance: number;
  category?: string;
  sync_status: SyncStatus;
  last_synced_at?: string;
  last_error?: string;
  updated_at: string;
}

export interface LocalOrderItem {
  product_id: string;
  product_name: string;
  product_code_1c?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface LocalOrder {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  customer_id: string;
  customer_name: string;
  customer_code_1c?: string;
  order_date: string;
  delivery_date?: string;
  status: 'draft' | 'pending' | 'confirmed' | 'delivered' | 'closed' | 'cancelled';
  total_amount: number;
  comment?: string;
  items: LocalOrderItem[];
  agent_id?: string;
  agent_name?: string;
  detected_device?: 'dev_1' | 'dev_2';
  detected_device_name?: string;
  session_id?: string;
  session_sync_time?: string;
  date_create?: string;
  order_created?: string;
  sync_status: SyncStatus;
  last_synced_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceSession {
  sessionId: string;
  syncTime: string;
  deviceKey: 'dev_1' | 'dev_2';
  ordersCount: number;
  totalSum: number;
  minDraft: string;
  maxDraft: string;
  clients: string[];
  orders: Array<{
    id: string;
    clientName: string;
    dateCreate: string;
    orderCreated: string;
    totalSum: number;
    status: number | string;
    itemsCount: number;
  }>;
}

export interface DeviceCollision {
  id: string;
  sessionA: string;
  sessionB: string;
  deviceA: string;
  deviceB: string;
  rangeA: string;
  rangeB: string;
  clientsA: string[];
  clientsB: string[];
  description: string;
}

export interface DeviceMetrics {
  deviceKey: 'dev_1' | 'dev_2';
  defaultName: string;
  alias: string;
  displayName: string;
  ordersCount: number;
  totalSum: number;
  averageCheck: number;
  uniqueClientsCount: number;
  clients: string[];
  sessionsCount: number;
  firstActive?: string;
  lastActive?: string;
}

export interface AgentDeviceProfile {
  agentId: string;
  agentName: string;
  userLogin?: string;
  userId?: string;
  totalOrders: number;
  totalRevenue: number;
  isDualDevice: boolean;
  collisionsCount: number;
  dev1: DeviceMetrics;
  dev2: DeviceMetrics;
  collisions: DeviceCollision[];
  sessions: DeviceSession[];
}

export interface AgentDeviceAnalysisResult {
  agents: AgentDeviceProfile[];
  summary: {
    totalAgents: number;
    dualDeviceProfilesCount: number;
    totalOrdersAnalyzed: number;
    totalRevenue: number;
    totalCollisionsDetected: number;
    analyzedAt: string;
    apiErrors?: string[];
    usedFallback?: boolean;
  };
}

export interface LocalWarehouse {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  name: string;
  is_active: boolean;
}

export interface LocalStockItem {
  store_id?: string;
  store_name?: string;
  product_id?: string;
  product_code_1C?: string;
  product_name?: string;
  quantity: number;
  reserve?: number;
  available?: number;
}

export interface LocalPayment {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  order_id?: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  payment_date: string;
  payment_type: string;
  sync_status: SyncStatus;
  last_synced_at?: string;
  last_error?: string;
  created_at: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  method: string;
  direction: 'inbound' | 'outbound';
  entity: 'product' | 'client' | 'order' | 'stock' | 'payment' | 'reference' | 'system';
  records_processed: number;
  records_failed: number;
  status: 'success' | 'partial' | 'failed';
  duration_ms: number;
  error_message?: string;
  dry_run?: boolean;
}

export interface SyncMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_latency_ms: number;
  last_sync_time?: string;
  products_count: number;
  clients_count: number;
  orders_count: number;
  stock_items_count: number;
  payments_count: number;
  is_connected: boolean;
  connection_status: 'connected' | 'error' | 'not_configured';
  connection_message?: string;
}

export interface StatusData {
  baseUrl: string;
  hasToken: boolean;
  tokenMasked: string;
  userId: string;
  filialId: string;
  savedLogin?: string;
  hasSavedCredentials?: boolean;
  lastLoginAt?: string;
  lastTokenRefreshAt?: string;
  isPersistent?: boolean;
  dryRun: boolean;
  timeoutMs: number;
  metrics: SyncMetrics;
}

export interface ConnectionTestResult {
  connected: boolean;
  status: 'connected' | 'error' | 'not_configured';
  latencyMs: number;
  message: string;
  url: string;
  hasToken: boolean;
  tokenMasked: string;
  userId: string;
  filialId: string;
}

export interface AgentManagementItem {
  id: string;
  name: string;
  login: string;
  phone: string;
  code1c?: string;
  active?: boolean;
  teamMode: 'single' | 'dual';
  isCombinedWorker: boolean;
  team1ChatId: string;
  team1TopicId: string;
  team2ChatId: string;
  team2TopicId: string;
  notes?: string;
  todayViolationsCount?: number;
  todayFakePolkaCount?: number;
  todayCoveredCameraCount?: number;
  deviceSummary?: {
    isDualDevice: boolean;
    collisionsCount: number;
    totalOrders: number;
  } | null;
  todayStats?: {
    worked: boolean;
    okbTotal: number;
    visitedCount: number;
    team1Sales: number;
    team2Sales: number;
    totalSales: number;
    team1Returns: number;
    team2Returns: number;
    totalReturns: number;
    akb: number;
  } | null;
}

export type PhotoAiVerdict =
  | 'polka_inside'
  | 'store_front'
  | 'covered_or_dark'
  | 'screen_or_rephoto'
  | 'unclear_or_irrelevant'
  | 'unreadable';

export interface PhotoAiAnalysisRecord {
  photoKey: string;
  photoUrl: string;
  verdict: PhotoAiVerdict;
  confidence: number;
  isPolka: boolean;
  isOutside: boolean;
  isCoveredOrDark: boolean;
  isScreenOrRephoto?: boolean;
  matchesClaimedCategory?: boolean;
  mismatchReasonUz?: string;
  detectedItems: string[];
  summaryUz: string;
  model: string;
  analyzedAt: string;
}

export interface AiServiceStatus {
  configured: boolean;
  model: string;
  message: string;
}
