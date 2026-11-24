import { SalesDocClient } from '../client/SalesDocClient.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import {
  LocalProduct,
  SalesDocCategory,
  SalesDocPriceItem,
  SalesDocPriceType,
  SalesDocProduct,
  SalesDocProductGroup,
  SalesDocSetResult,
  SalesDocSubCategory
} from '../types/salesdoc.types.js';

export class SalesDocProductService {
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  /**
   * 9.1. getProduct - Get products list with filters and pagination
   */
  public async getProducts(params: {
    limit?: number;
    page?: number;
    search?: string;
    filter?: any;
  } = {}) {
    return this.client.request<{ product: SalesDocProduct[] }>('getProduct', params);
  }

  /**
   * 9.2. getProductCategory - Categories
   */
  public async getProductCategories(params: any = {}) {
    return this.client.request<{ productCategory?: SalesDocCategory[]; category?: SalesDocCategory[] }>(
      'getProductCategory',
      params
    );
  }

  /**
   * 9.3. getProductSubCategory - Subcategories
   */
  public async getProductSubCategories(params: any = {}) {
    return this.client.request<{ subCategory: SalesDocSubCategory[] }>('getProductSubCategory', params);
  }

  /**
   * 9.4. getProductGroup - Product groups
   */
  public async getProductGroups(params: any = {}) {
    return this.client.request<{ group: SalesDocProductGroup[] }>('getProductGroup', params);
  }

  /**
   * 9.5. getPriceType - Price types
   */
  public async getPriceTypes(params: any = {}) {
    return this.client.request<{ priceType: SalesDocPriceType[] }>('getPriceType', params);
  }

  /**
   * 9.6. getPrice - Prices
   */
  public async getPrices(params: any = {}) {
    return this.client.request<{ price: any[] }>('getPrice', params);
  }

  /**
   * 10.6. setProduct - Create or update products
   */
  public async setProduct(products: any[]) {
    return this.client.request<SalesDocSetResult>('setProduct', undefined, { product: products });
  }

  /**
   * 10.7. setProductCategory - Create/update product categories
   */
  public async setProductCategory(categories: any[]) {
    return this.client.request<SalesDocSetResult>('setProductCategory', undefined, { productCategory: categories });
  }

  /**
   * 10.8. setProductSubCategory - Create/update product subcategories
   */
  public async setProductSubCategory(subCategories: any[]) {
    return this.client.request<SalesDocSetResult>('setProductSubCategory', undefined, { subCategory: subCategories });
  }

  /**
   * 10.9. setProductGroup - Create/update product groups
   */
  public async setProductGroup(groups: any[]) {
    return this.client.request<SalesDocSetResult>('setProductGroup', undefined, { productGroup: groups });
  }

  /**
   * 10.11. setPriceType - Create/update price types
   */
  public async setPriceType(payload: { priceType: any[]; valyutaType?: any[] }) {
    return this.client.request<SalesDocSetResult>('setPriceType', undefined, payload);
  }

  /**
   * 10.13. setPrice - Set or update prices
   */
  public async setPrice(prices: SalesDocPriceItem[]) {
    return this.client.request<SalesDocSetResult>('setPrice', undefined, { product: prices });
  }

  /**
   * Full synchronization of products from SalesDoc to Local DB
   */
  public async syncFromSalesDoc(): Promise<{ processed: number; failed: number }> {
    const start = Date.now();
    try {
      const categoryMap = new Map<string, string>();
      try {
        const catRes = await this.getProductCategories();
        const cats = catRes.result?.productCategory || catRes.result?.category || [];
        for (const c of cats) {
          if (c.name) {
            if (c.SD_id) categoryMap.set(c.SD_id, c.name);
            if (c.CS_id) categoryMap.set(c.CS_id, c.name);
            if (c.code_1C) categoryMap.set(c.code_1C, c.name);
          }
        }
      } catch {
        // Optional category enrichment failed, continue with inline names
      }

      const unitMap = new Map<string, string>();
      try {
        const unitRes = await this.client.request<{ unit?: any[] }>('getUnit', {});
        for (const u of unitRes.result?.unit || []) {
          const uLabel = u.name || u.short;
          if (uLabel) {
            if (u.SD_id) unitMap.set(u.SD_id, uLabel);
            if (u.CS_id) unitMap.set(u.CS_id, uLabel);
            if (u.code_1C) unitMap.set(u.code_1C, uLabel);
          }
        }
      } catch {
        // Optional unit enrichment
      }

      const existingStockByKey = new Map<string, number>();
      for (const existing of this.db.getProducts()) {
        if (existing.id) existingStockByKey.set(existing.id, existing.stock_quantity || 0);
        if (existing.salesdoc_id) existingStockByKey.set(existing.salesdoc_id, existing.stock_quantity || 0);
        if (existing.code_1c) existingStockByKey.set(existing.code_1c, existing.stock_quantity || 0);
      }

      const remoteProducts = await this.client.fetchAllPages<SalesDocProduct>(
        'getProduct',
        {},
        (result) => result?.product || [],
        200,
        10
      );

      const mappedProducts = remoteProducts.map((remote) => {
        const existingStockQty =
          (remote.code_1C && existingStockByKey.get(remote.code_1C)) ??
          (remote.SD_id && existingStockByKey.get(remote.SD_id)) ??
          (remote.CS_id && existingStockByKey.get(remote.CS_id)) ??
          0;
        return SalesDocMapper.toLocalProduct(remote, undefined, {
          categoryMap,
          unitMap,
          existingStockQty
        });
      });
      const processed = this.db.upsertProductsBatch(mappedProducts);

      this.db.addSyncLog({
        method: 'getProduct',
        direction: 'inbound',
        entity: 'product',
        records_processed: processed,
        records_failed: 0,
        status: 'success',
        duration_ms: Date.now() - start
      });

      return { processed, failed: 0 };
    } catch (err: any) {
      this.db.addSyncLog({
        method: 'getProduct',
        direction: 'inbound',
        entity: 'product',
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
   * Push a local product to SalesDoc
   */
  public async pushToSalesDoc(productId: string): Promise<LocalProduct> {
    const product = this.db.getProductById(productId);
    if (!product) {
      throw new Error(`Product not found with ID: ${productId}`);
    }

    const payload = SalesDocMapper.toSalesDocProductPayload(product);
    const start = Date.now();

    try {
      const response = await this.setProduct([payload]);
      const isSuccess = response.status && (response.result?.error === 0 || response.result?.completed > 0);

      const updated: LocalProduct = {
        ...product,
        sync_status: isSuccess ? 'synced' : 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: isSuccess ? undefined : 'Failed to register product in SalesDoc'
      };

      this.db.upsertProduct(updated);
      this.db.addSyncLog({
        method: 'setProduct',
        direction: 'outbound',
        entity: 'product',
        records_processed: 1,
        records_failed: isSuccess ? 0 : 1,
        status: isSuccess ? 'success' : 'failed',
        duration_ms: Date.now() - start
      });

      return updated;
    } catch (err: any) {
      const failedProduct: LocalProduct = {
        ...product,
        sync_status: 'failed',
        last_error: err.message
      };
      this.db.upsertProduct(failedProduct);
      this.db.addSyncLog({
        method: 'setProduct',
        direction: 'outbound',
        entity: 'product',
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
