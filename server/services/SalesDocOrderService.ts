import { SalesDocClient } from '../client/SalesDocClient.js';
import { DuplicateOrderError, SalesDocValidationError } from '../client/errors.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import {
  LocalOrder,
  SalesDocOrder,
  SalesDocOrderDefect,
  SalesDocSetResult
} from '../types/salesdoc.types.js';
import { getTashkentTodayIso } from '../utils/timezone.js';

export class SalesDocOrderService {
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  /**
   * 9.26. getOrder - Orders list with filters and pagination
   */
  public async getOrders(params: {
    limit?: number;
    page?: number;
    filter?: {
      period?: {
        date?: { from?: string; to?: string };
        dateUpdate?: { from?: string; to?: string };
        deliveryDate?: { from?: string; to?: string };
      };
      client?: { code_1C?: string; SD_id?: string; CS_id?: string };
      agent?: { code_1C?: string; SD_id?: string; CS_id?: string };
      store?: { code_1C?: string; SD_id?: string; CS_id?: string };
      include?: 'sd' | '1c' | 'all';
    };
  } = {}) {
    return this.client.request<{ order: SalesDocOrder[] }>('getOrder', params);
  }

  /**
   * 9.27. getOrderDefect - Defect orders
   */
  public async getOrderDefect(params: any = {}) {
    return this.client.request<{ defect: SalesDocOrderDefect[] }>('getOrderDefect', params);
  }

  /**
   * 9.28. getOrderReplace - Product replacements
   */
  public async getOrderReplace(params: any = {}) {
    return this.client.request<{ replace: any[] }>('getOrderReplace', params);
  }

  /**
   * 12.2. setOrder - Create or update orders
   */
  public async setOrder(orders: any[]) {
    return this.client.request<SalesDocSetResult>('setOrder', undefined, { order: orders });
  }

  /**
   * 12.3. setDeletedOrder - Delete / cancel orders in SalesDoc
   */
  public async setDeletedOrder(deletedOrders: Array<{ code_1C?: string; SD_id?: string; CS_id?: string }>) {
    return this.client.request<SalesDocSetResult>('setDeletedOrder', undefined, { order: deletedOrders });
  }

  /**
   * Helper: add 1 day to YYYY-MM-DD
   */
  public getNextDay(dateStr: string): string {
    const dPart = dateStr.slice(0, 10);
    const [y, m, d] = dPart.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  }

  /**
   * 12.3. setStatus - Update order statuses in SalesDoc
   * Accepts code_1C or SD_id, status (int), dateShipment (Y-m-d)
   */
  public async setStatus(statuses: Array<{ code_1C?: string; SD_id?: string; CS_id?: string; status: string | number; dateShipment?: string }>) {
    return this.client.request<SalesDocSetResult>('setStatus', undefined, { order: statuses });
  }

  /**
   * Preview orders with status 1 (new) created before or on cutoffDate
   */
  public async previewOldOrders(cutoffDate?: string): Promise<{
    cutoffDate: string;
    yesterdayStr: string;
    totalOldNewOrders: number;
    todayNewOrders: number;
    sampleOrders: Array<{ id: string; dateCreate: string; nextDayShipment: string; clientName: string; totalSumma: number }>;
    sampleTodayOrders: Array<{ id: string; dateCreate: string; nextDayShipment: string; clientName: string; totalSumma: number }>;
  }> {
    const cutoff = cutoffDate || getTashkentTodayIso();

    // Calculate yesterday relative to cutoff
    const [y, m, d] = cutoff.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yesterdayStr = dt.toISOString().slice(0, 10);

    // Query SalesDoc for old new orders (up to yesterday)
    const oldRes = await this.client.request<{ order: any[]; pagination?: any }>('getOrder', {
      limit: 10,
      page: 1,
      filter: {
        status: [1],
        period: { date: { from: '2020-01-01', to: yesterdayStr } }
      }
    });

    // Query SalesDoc for today's new orders
    const todayRes = await this.client.request<{ order: any[]; pagination?: any }>('getOrder', {
      limit: 10,
      page: 1,
      filter: {
        status: [1],
        period: { date: { from: cutoff, to: cutoff } }
      }
    });

    const totalOld = (oldRes as any).pagination?.total ?? oldRes.result?.pagination?.total ?? (oldRes.result?.order?.length || 0);
    const totalToday = (todayRes as any).pagination?.total ?? todayRes.result?.pagination?.total ?? (todayRes.result?.order?.length || 0);

    const sampleOrders = (oldRes.result?.order || []).map((o: any) => {
      const dateCreate = o.dateCreate || o.orderCreated || o.date || cutoff;
      return {
        id: o.SD_id || o.CS_id || o.code_1C,
        dateCreate,
        nextDayShipment: this.getNextDay(dateCreate),
        clientName: o.client?.clientName || o.client?.SD_id || 'Mijoz',
        totalSumma: o.totalSumma || o.totalSummaAfterDiscount || 0
      };
    });

    const sampleTodayOrders = (todayRes.result?.order || []).map((o: any) => {
      const dateCreate = o.dateCreate || o.orderCreated || o.date || cutoff;
      return {
        id: o.SD_id || o.CS_id || o.code_1C,
        dateCreate,
        nextDayShipment: this.getNextDay(dateCreate),
        clientName: o.client?.clientName || o.client?.SD_id || 'Mijoz',
        totalSumma: o.totalSumma || o.totalSummaAfterDiscount || 0
      };
    });

    return {
      cutoffDate: cutoff,
      yesterdayStr,
      totalOldNewOrders: totalOld,
      todayNewOrders: totalToday,
      sampleOrders,
      sampleTodayOrders
    };
  }

  /**
   * Batch update pending orders (status 1) to 'otgrujen' (status 2),
   * setting shipment date (dateShipment) to 1 day after order creation date.
   * Modes:
   *  - 'old_only': only orders created before cutoffDate (yesterday and older)
   *  - 'today_only': only orders created on cutoffDate (today)
   *  - 'all': both old and today's orders
   */
  public async batchShipOldOrders(options: {
    cutoffDate?: string;
    maxOrders?: number;
    batchSize?: number;
    dryRun?: boolean;
    mode?: 'old_only' | 'today_only' | 'all';
    onProgress?: (progress: { totalProcessed: number; totalUpdated: number; currentBatch: number }) => void;
  } = {}): Promise<{
    success: boolean;
    cutoffDate: string;
    mode: string;
    totalUpdated: number;
    totalSkippedToday: number;
    batchesProcessed: number;
    sampleUpdated: Array<{ id: string; dateCreate: string; dateShipment: string; status: number }>;
    errors: string[];
  }> {
    const cutoff = options.cutoffDate || getTashkentTodayIso();
    const batchSize = Math.min(100, Math.max(1, options.batchSize || 50));
    const maxOrders = options.maxOrders || 1000;
    const dryRun = options.dryRun || false;
    const mode = options.mode || 'old_only';

    // Calculate yesterday relative to cutoff
    const [y, m, d] = cutoff.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yesterdayStr = dt.toISOString().slice(0, 10);

    let totalUpdated = 0;
    let totalSkippedToday = 0;
    let batchesProcessed = 0;
    const sampleUpdated: Array<{ id: string; dateCreate: string; dateShipment: string; status: number }> = [];
    const errors: string[] = [];

    let page = 1;
    let keepGoing = true;

    // Determine query period filter based on mode
    let periodFilter: any = undefined;
    if (mode === 'old_only') {
      periodFilter = { date: { from: '2020-01-01', to: yesterdayStr } };
    } else if (mode === 'today_only') {
      periodFilter = { date: { from: cutoff, to: cutoff } };
    }

    while (keepGoing && totalUpdated < maxOrders) {
      const remainingLimit = Math.min(batchSize, maxOrders - totalUpdated);
      const res = await this.client.request<{ order: any[]; pagination?: any }>('getOrder', {
        limit: remainingLimit,
        page,
        filter: {
          status: [1],
          ...(periodFilter ? { period: periodFilter } : {})
        }
      });

      const orders = res.result?.order || [];
      if (orders.length === 0) {
        break; // No more pending orders
      }

      const updateBatch: Array<{ SD_id: string; code_1C?: string; status: number; dateShipment: string }> = [];

      for (const order of orders) {
        const dateCreate = order.dateCreate || order.orderCreated || order.date || '2026-01-01';
        const orderDateOnly = dateCreate.slice(0, 10);

        if (mode === 'old_only' && orderDateOnly >= cutoff) {
          totalSkippedToday++;
          continue;
        }

        const id = order.SD_id || order.CS_id;
        if (!id) continue;

        const dateShipment = this.getNextDay(dateCreate);
        updateBatch.push({
          SD_id: id,
          ...(order.code_1C ? { code_1C: order.code_1C } : {}),
          status: 2, // Otgrujen (Sent/Dispatched)
          dateShipment
        });

        if (sampleUpdated.length < 20) {
          sampleUpdated.push({
            id,
            dateCreate,
            dateShipment,
            status: 2
          });
        }
      }

      if (updateBatch.length > 0) {
        if (!dryRun) {
          try {
            const updateRes = await this.setStatus(updateBatch);
            const completed = updateRes.result?.completed ?? updateBatch.length;
            totalUpdated += completed;
          } catch (err: any) {
            errors.push(`Batch ${batchesProcessed + 1} error: ${err.message}`);
            break;
          }
        } else {
          totalUpdated += updateBatch.length;
        }
      }

      batchesProcessed++;
      if (options.onProgress) {
        options.onProgress({
          totalProcessed: totalUpdated + totalSkippedToday,
          totalUpdated,
          currentBatch: batchesProcessed
        });
      }

      // If dryRun, advance page; if real update, orders leave status 1 so page 1 brings next orders
      if (dryRun) {
        page++;
      }

      // If we got fewer orders than requested, we reached the end
      if (orders.length < remainingLimit) {
        keepGoing = false;
      }
    }

    return {
      success: errors.length === 0,
      cutoffDate: cutoff,
      mode,
      totalUpdated,
      totalSkippedToday,
      batchesProcessed,
      sampleUpdated,
      errors
    };
  }

  /**
   * 12.5. setOrderDefect - Create or update defect orders
   */
  public async setOrderDefect(defects: any[]) {
    return this.client.request<SalesDocSetResult>('setOrderDefect', undefined, { defect: defects });
  }

  /**
   * 12.6. syncOrder - Mark order as processed by 1C/external ERP
   */
  public async syncOrder(orders: Array<{ code_1C?: string; SD_id?: string; CS_id?: string }>) {
    return this.client.request<SalesDocSetResult>('syncOrder', undefined, { order: orders });
  }

  /**
   * 12.7. setCode - Link 1C code to an existing SalesDoc order
   */
  public async setCode(links: Array<{ SD_id?: string; CS_id?: string; code_1C: string }>) {
    return this.client.request<SalesDocSetResult>('setCode', undefined, { order: links });
  }

  /**
   * Comprehensive validation before sending an order to SalesDoc.
   * Enforces business rules: client exists, items > 0, qty > 0, price >= 0, etc.
   */
  public validateOrder(order: LocalOrder): void {
    const errors: string[] = [];

    if (!order.id || order.id.trim() === '') {
      errors.push('Order ID (localId) is required');
    }

    if (!order.customer_id && !order.customer_code_1c) {
      errors.push('Customer identifier is required');
    }

    const customer = this.db.getClientById(order.customer_id);
    if (!customer && !order.customer_code_1c) {
      errors.push(`Customer with ID ${order.customer_id} does not exist locally`);
    }

    if (!order.items || order.items.length === 0) {
      errors.push('Order must contain at least one product item');
    } else {
      order.items.forEach((item, index) => {
        if (!item.product_id && !item.product_code_1c) {
          errors.push(`Item #${index + 1}: product identifier is missing`);
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors.push(`Item #${index + 1} (${item.product_name}): quantity must be greater than 0 (got ${item.quantity})`);
        }
        if (typeof item.price !== 'number' || item.price < 0) {
          errors.push(`Item #${index + 1} (${item.product_name}): price cannot be negative (got ${item.price})`);
        }
      });
    }

    if (errors.length > 0) {
      throw new SalesDocValidationError('Order failed pre-dispatch validation', errors, { orderId: order.id });
    }
  }

  /**
   * Check for duplicate order to ensure idempotent operations.
   */
  public checkDuplicate(order: LocalOrder, allowReSync: boolean = false): void {
    if (allowReSync) return;

    // If order already has salesdoc_id and sync_status is synced
    if (order.salesdoc_id && order.sync_status === 'synced') {
      throw new DuplicateOrderError(order.id, order.salesdoc_id, order.code_1c);
    }

    // Check if another order exists in DB with the exact same code_1c
    if (order.code_1c) {
      const existing = this.db.getOrders().find((o) => o.id !== order.id && o.code_1c === order.code_1c);
      if (existing && existing.sync_status === 'synced') {
        throw new DuplicateOrderError(order.id, existing.salesdoc_id, existing.code_1c);
      }
    }
  }

  /**
   * Push a local order to SalesDoc with strict validation and idempotency
   */
  public async pushToSalesDoc(orderId: string, forceReSync: boolean = false): Promise<LocalOrder> {
    const order = this.db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    // 1. Check idempotency / duplicate
    this.checkDuplicate(order, forceReSync);

    // 2. Validate business rules
    this.validateOrder(order);

    // 3. Mark status as pending
    this.db.upsertOrder({
      ...order,
      sync_status: 'pending'
    });

    const payload = SalesDocMapper.toSalesDocOrderPayload(order);
    const start = Date.now();

    try {
      const response = await this.setOrder([payload]);
      const isSuccess = response.status && (response.result?.error === 0 || response.result?.completed > 0);

      // Extract server returned identifiers if available (do NOT fabricate fake SD_id)
      const serverData = response.result?.data?.order?.[0] || response.result?.data?.[0];
      const assignedSDId = serverData?.SD_id || serverData?.CS_id || order.salesdoc_id;

      const updated: LocalOrder = {
        ...order,
        ...(assignedSDId ? { salesdoc_id: assignedSDId } : {}),
        sync_status: isSuccess ? 'synced' : 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: isSuccess ? undefined : 'SalesDoc reported error on order creation'
      };

      this.db.upsertOrder(updated);

      this.db.addSyncLog({
        method: 'setOrder',
        direction: 'outbound',
        entity: 'order',
        records_processed: 1,
        records_failed: isSuccess ? 0 : 1,
        status: isSuccess ? 'success' : 'failed',
        duration_ms: Date.now() - start
      });

      return updated;
    } catch (err: any) {
      const failedOrder: LocalOrder = {
        ...order,
        sync_status: 'failed',
        last_error: err.message
      };
      this.db.upsertOrder(failedOrder);

      this.db.addSyncLog({
        method: 'setOrder',
        direction: 'outbound',
        entity: 'order',
        records_processed: 0,
        records_failed: 1,
        status: 'failed',
        duration_ms: Date.now() - start,
        error_message: err.message
      });
      throw err;
    }
  }

  /**
   * Sync orders from SalesDoc into local database
   */
  public async syncFromSalesDoc(params: any = {}): Promise<{ processed: number; failed: number }> {
    const start = Date.now();
    try {
      const effectiveParams = {
        ...params,
        filter: {
          agent: 'all',
          status: [1, 2, 3, 4, 5],
          ...(params?.filter || {})
        }
      };

      const remoteOrders = await this.client.fetchAllPages<SalesDocOrder>(
        'getOrder',
        effectiveParams,
        (result) => result?.order || [],
        200,
        10
      );

      const mappedOrders = remoteOrders.map((remote) => SalesDocMapper.toLocalOrder(remote));
      const processed = this.db.upsertOrdersBatch(mappedOrders);

      this.db.addSyncLog({
        method: 'getOrder',
        direction: 'inbound',
        entity: 'order',
        records_processed: processed,
        records_failed: 0,
        status: 'success',
        duration_ms: Date.now() - start
      });

      return { processed, failed: 0 };
    } catch (err: any) {
      this.db.addSyncLog({
        method: 'getOrder',
        direction: 'inbound',
        entity: 'order',
        records_processed: 0,
        records_failed: 1,
        status: 'failed',
        duration_ms: Date.now() - start,
        error_message: err.message
      });
      throw err;
    }
  }
}
