import { SalesDocClient } from '../client/SalesDocClient.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import {
  SalesDocMovement,
  SalesDocSetResult,
  SalesDocStockItem,
  SalesDocWarehouse
} from '../types/salesdoc.types.js';

export class SalesDocStockService {
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  /**
   * 9.22. getWarehouse - Warehouses
   */
  public async getWarehouse(params: any = {}) {
    return this.client.request<{ warehouse: SalesDocWarehouse[] }>('getWarehouse', params);
  }

  /**
   * 9.23. getDefectWarehouse - Return warehouses
   */
  public async getDefectWarehouse(params: any = {}) {
    return this.client.request<{ warehouse: SalesDocWarehouse[] }>('getDefectWarehouse', params);
  }

  /**
   * 9.24. getStock - Current stock grouped by warehouse
   */
  public async getStock(params: { store?: { SD_id?: string; CS_id?: string; code_1C?: string } } = {}) {
    return this.client.request<{ warehouse?: any[]; stock?: SalesDocStockItem[] }>('getStock', params);
  }

  /**
   * 9.25. getStockForDate - Stock at specific date (Rate limit: 1 request / 5 min)
   */
  public async getStockForDate(params: { date: string; store?: { SD_id?: string } }) {
    return this.client.request<{ warehouse?: any[]; stock?: SalesDocStockItem[] }>('getStockForDate', params);
  }

  /**
   * 11.1. setWarehouse - Create/update warehouses
   */
  public async setWarehouse(warehouses: any[]) {
    return this.client.request<SalesDocSetResult>('setWarehouse', undefined, { warehouse: warehouses });
  }

  /**
   * 11.2. setStock - Set stock balances (Rate limit: max 5 requests per 5s)
   */
  public async setStock(stockData: Array<{ store: any; product: any[] }>) {
    return this.client.request<SalesDocSetResult>('setStock', undefined, { stock: stockData });
  }

  /**
   * 11.3. setPurchase - Create receipt of goods (purchase)
   */
  public async setPurchase(purchases: any[]) {
    return this.client.request<SalesDocSetResult>('setPurchase', undefined, { purchase: purchases });
  }

  /**
   * 11.4. setMovement - Transfer between warehouses
   */
  public async setMovement(movements: SalesDocMovement[]) {
    return this.client.request<SalesDocSetResult>('setMovement', undefined, { movement: movements });
  }

  /**
   * 11.5. setVsExchange - Product exchanges
   */
  public async setVsExchange(exchanges: any[]) {
    return this.client.request<SalesDocSetResult>('setVsExchange', undefined, { vsExchange: exchanges });
  }

  /**
   * 11.6. setMovementBetweenFilial - Product movements between branches
   */
  public async setMovementBetweenFilial(movements: any[]) {
    return this.client.request<SalesDocSetResult>('setMovementBetweenFilial', undefined, { movement: movements });
  }

  /**
   * 11.7. setMovementFilialPending - Pending movements between filials
   */
  public async setMovementFilialPending(pending: any[]) {
    return this.client.request<SalesDocSetResult>('setMovementFilialPending', undefined, { movement: pending });
  }

  /**
   * 11.8. setCorrection - Stock correction
   */
  public async setCorrection(corrections: any[]) {
    return this.client.request<SalesDocSetResult>('setCorrection', undefined, { correction: corrections });
  }

  /**
   * 11.9. setExcretion - Write-off goods
   */
  public async setExcretion(excretions: any[]) {
    return this.client.request<SalesDocSetResult>('setExcretion', undefined, { excretion: excretions });
  }

  /**
   * Synchronize warehouses and stock from SalesDoc into local storage
   */
  public async syncStockFromSalesDoc(): Promise<{ warehousesCount: number; stockItemsCount: number }> {
    const start = Date.now();
    try {
      // 1. Fetch Warehouses
      const whResponse = await this.getWarehouse();
      const warehouses = whResponse.result?.warehouse || [];
      this.db.upsertWarehousesBatch(warehouses.map((wh) => SalesDocMapper.toLocalWarehouse(wh)));

      // 2. Fetch Stock (SalesDoc V2 returns result.warehouse[].products[])
      const stockResponse = await this.getStock();
      const stockItems: SalesDocStockItem[] = [];

      const whBlocks = stockResponse.result?.warehouse;
      if (Array.isArray(whBlocks)) {
        for (const wh of whBlocks) {
          const storeId = wh.SD_id || wh.CS_id || wh.code_1C || '';
          const storeName = wh.name || storeId || "Noma'lum ombor";
          const productsList = Array.isArray(wh.products) ? wh.products : [];
          for (const prod of productsList) {
            const qty = Number(prod.quantity || 0);
            const reserve = Number(prod.reserve || 0);
            stockItems.push({
              store_id: storeId,
              store_name: storeName,
              product_id: prod.SD_id || prod.CS_id || prod.code_1C,
              product_code_1C: prod.code_1C || '',
              product_name: prod.name || prod.code_1C || "Nomsiz mahsulot",
              quantity: qty,
              reserve,
              available: Math.max(0, qty - reserve)
            });
          }
        }
      } else if (Array.isArray(stockResponse.result?.stock)) {
        stockItems.push(...stockResponse.result.stock);
      }

      // Replace local stock even if 0 to avoid stale ghosts
      this.db.setStock(stockItems);

      // Aggregate stock quantity onto matching LocalProduct entries
      const totalsByProductKey = new Map<string, number>();
      for (const item of stockItems) {
        const keys = [item.product_id, item.product_code_1C].filter((k): k is string => Boolean(k));
        for (const k of keys) {
          totalsByProductKey.set(k, (totalsByProductKey.get(k) || 0) + Number(item.quantity || 0));
        }
      }

      const updatedProducts = [];
      for (const prod of this.db.getProducts()) {
        const matchedQty =
          (prod.salesdoc_id && totalsByProductKey.get(prod.salesdoc_id)) ??
          (prod.code_1c && totalsByProductKey.get(prod.code_1c)) ??
          totalsByProductKey.get(prod.id) ??
          0;
        if (prod.stock_quantity !== matchedQty) {
          updatedProducts.push({
            ...prod,
            stock_quantity: matchedQty
          });
        }
      }
      if (updatedProducts.length > 0) {
        this.db.upsertProductsBatch(updatedProducts);
      }

      this.db.addSyncLog({
        method: 'getStock',
        direction: 'inbound',
        entity: 'stock',
        records_processed: stockItems.length + warehouses.length,
        records_failed: 0,
        status: 'success',
        duration_ms: Date.now() - start
      });

      return { warehousesCount: warehouses.length, stockItemsCount: stockItems.length };
    } catch (err: any) {
      this.db.addSyncLog({
        method: 'getStock',
        direction: 'inbound',
        entity: 'stock',
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
