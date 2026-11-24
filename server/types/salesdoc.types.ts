/**
 * SalesDoc API V2 TypeScript Types Definition
 * Strictly based on SalesDoc API V2 Documentation
 */

// ================= Base Request & Response =================

export interface SalesDocAuthBlock {
  userId?: string;
  token?: string;
  login?: string;
  password?: string;
}

export interface SalesDocFilialBlock {
  filial_id: string;
}

export interface SalesDocPaginationParams {
  limit?: number;
  page?: number;
}

export interface SalesDocPeriodFilter {
  date?: {
    from?: string; // Y-m-d
    to?: string;   // Y-m-d
  };
  dateUpdate?: {
    from?: string;
    to?: string;
  };
}

export interface SalesDocRequest<TParams = any, TData = any> {
  method: string;
  auth: SalesDocAuthBlock;
  filial?: SalesDocFilialBlock;
  params?: TParams;
  data?: TData;
}

export interface SalesDocPagination {
  limit: number;
  total: number;
  page: number;
}

export interface SalesDocErrorBlock {
  code: number;
  message: string;
  data?: any;
}

export interface SalesDocResponse<T = any> {
  status: boolean;
  result?: T;
  pagination?: SalesDocPagination;
  error?: SalesDocErrorBlock;
}

export interface SalesDocSetResult<T = any> {
  completed: number;
  error: number;
  data?: T;
}

// Identification helper for nested objects (CS_id, SD_id, or code_1C)
export interface SalesDocRefIdentifier {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
}

// ================= Products & Pricing =================

export interface SalesDocCategory {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  active?: boolean | string;
  sort?: number;
}

export interface SalesDocSubCategory {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  active?: boolean | string;
}

export interface SalesDocProductGroup {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  active?: boolean | string;
}

export interface SalesDocUnit {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  short?: string;
  active?: boolean | string;
}

export interface SalesDocPriceType {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  active?: boolean;
  forClient?: boolean;
  paymentType?: SalesDocRefIdentifier;
  valyutaType?: SalesDocRefIdentifier;
}

export interface SalesDocPriceItem {
  code_1C?: string;
  SD_id?: string;
  document_1C?: string;
  priceType: {
    code_1C?: string;
    SD_id?: string;
    price: number;
  };
}

export interface SalesDocProduct {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: boolean | string;
  sort?: number;
  volume?: number;
  packQuantity?: number;
  barCode?: string;
  weight?: number;
  part_number?: string | null;
  category?: SalesDocCategory;
  subCategory?: SalesDocSubCategory;
  group?: SalesDocProductGroup;
  unit?: SalesDocUnit;
  brand?: SalesDocRefIdentifier;
  prices?: Array<{
    priceType_id?: string;
    priceTypeName?: string;
    price?: number;
    code_1C?: string;
  }>;
}

// ================= Clients =================

export interface SalesDocClientCategory {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  description?: string;
  active?: boolean | string;
}

export interface SalesDocClientType {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  color?: string;
  active?: boolean | string;
}

export interface SalesDocClientChannel {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
}

export interface SalesDocBankDetails {
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
}

export interface SalesDocClient {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  shortName: string;
  firmName?: string;
  address?: string;
  orentir?: string;
  tel?: string;
  phone_numbers?: string[];
  comment?: string;
  inn?: string;
  pinfl?: string | null;
  nspCode?: string | null;
  active?: boolean;
  lat?: number;
  lon?: number;
  balance?: number;
  clientCategory?: SalesDocClientCategory;
  clientType?: SalesDocClientType;
  clientChannel?: SalesDocClientChannel;
  territory?: SalesDocRefIdentifier;
  priceTypeList?: SalesDocRefIdentifier[];
  bankDetails?: SalesDocBankDetails;
  agent?: Array<{
    code_1C?: string;
    SD_id?: string;
    visitDays?: number[];
  }>;
}

// ================= Orders =================

export interface SalesDocOrderDetailItem {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  product?: SalesDocRefIdentifier;
  quantity: number;
  price: number;
  summa?: number;
  discount?: number;
  discount_summa?: number;
  vat?: number;
  comment?: string;
}

export interface SalesDocOrder {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  document_1C?: string;
  date: string;
  deliveryDate?: string;
  order_status?: string; // pending, confirmed, delivered, cancelled
  status_1C?: string;
  comment?: string;
  total_summa?: number;
  discount_summa?: number;
  paid_summa?: number;
  client: SalesDocRefIdentifier;
  store?: SalesDocRefIdentifier;
  priceType?: SalesDocRefIdentifier;
  agent?: SalesDocRefIdentifier;
  expeditor?: SalesDocRefIdentifier;
  detail: SalesDocOrderDetailItem[];
}

export interface SalesDocOrderDefect {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  date: string;
  client: SalesDocRefIdentifier;
  store?: SalesDocRefIdentifier;
  comment?: string;
  detail: Array<{
    product: SalesDocRefIdentifier;
    quantity: number;
    price: number;
    reason?: string;
  }>;
}

// ================= Warehouses & Stock =================

export interface SalesDocWarehouse {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: string | boolean;
}

export interface SalesDocStockItem {
  store_id?: string;
  store_name?: string;
  product_id?: string;
  product_code_1C?: string;
  product_name?: string;
  quantity: number;
  reserve?: number;
  available?: number;
}

export interface SalesDocMovement {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  date: string;
  from_store: SalesDocRefIdentifier;
  to_store: SalesDocRefIdentifier;
  detail: Array<{
    code_1C?: string;
    SD_id?: string;
    quantity: number;
  }>;
}

// ================= Payments & Finance =================

export interface SalesDocPayment {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  amount: number;
  paymentDate: string;
  expirationDate?: string | null;
  comment?: string;
  client: SalesDocRefIdentifier;
  agent?: SalesDocRefIdentifier;
  paymentType: SalesDocRefIdentifier;
  order?: SalesDocRefIdentifier;
}

export interface SalesDocBalance {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name?: string;
  active?: boolean;
  balance: number;
  by_currency?: Array<{
    currency_id: string;
    amount: number;
  }>;
}

export interface SalesDocCashbox {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: boolean | string;
}

export interface SalesDocConsumption {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  summa: number;
  date?: string;
  type?: string; // 'income' or 'debt'
  comment?: string;
  paymentType: SalesDocRefIdentifier;
  cashbox: SalesDocRefIdentifier;
}

// ================= Filials & References =================

export interface SalesDocFilial {
  CS_id?: string;
  SD_id?: string;
  name: string;
  domain?: string;
}

export interface SalesDocAgent {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: boolean | string;
  user?: Array<{
    CS_id?: string;
    SD_id?: string;
    login?: string;
    name?: string;
  }>;
}

export interface SalesDocExpeditor {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  tel?: string;
  active?: boolean | string;
}

export interface SalesDocTerritory {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: boolean;
}

export interface SalesDocBrand {
  CS_id?: string;
  SD_id?: string;
  code_1C?: string;
  name: string;
  active?: boolean;
}

// ================= Local Database & Sync Models =================

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'cancelled';

export interface LocalProduct {
  id: string; // local primary key
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
  id: string; // Unique local order ID (e.g. ORD-20260907-001)
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

export interface LocalWarehouse {
  id: string;
  salesdoc_id?: string;
  code_1c?: string;
  name: string;
  is_active: boolean;
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
