import {
  LocalCustomer,
  LocalOrder,
  LocalOrderItem,
  LocalPayment,
  LocalProduct,
  LocalWarehouse,
  SalesDocClient,
  SalesDocOrder,
  SalesDocPayment,
  SalesDocProduct,
  SalesDocWarehouse
} from '../types/salesdoc.types.js';
import { getTashkentTodayIso } from '../utils/timezone.js';

export interface ProductMapperOptions {
  categoryMap?: Map<string, string>;
  unitMap?: Map<string, string>;
  priceTypeMap?: Map<string, string>;
  existingStockQty?: number;
}

export interface ClientMapperOptions {
  categoryMap?: Map<string, string>;
}

export class SalesDocMapper {
  /**
   * Convert SalesDoc product API representation to LocalProduct entity
   */
  public static toLocalProduct(
    remote: SalesDocProduct,
    localExistingId?: string,
    options?: ProductMapperOptions
  ): LocalProduct {
    const id = localExistingId || remote.code_1C || remote.SD_id || remote.CS_id || `prod_${Date.now()}`;
    const defaultPrice = remote.prices && remote.prices.length > 0 ? Number(remote.prices[0].price || 0) : 0;

    const rAny = remote as any;
    const catId = remote.category?.SD_id || remote.category?.CS_id || remote.category?.code_1C;
    const unitId = remote.unit?.SD_id || remote.unit?.CS_id || remote.unit?.code_1C;

    const categoryName =
      remote.category?.name ||
      (catId && options?.categoryMap?.get(catId)) ||
      rAny.categoryName ||
      "Kategoriya ko'rsatilmagan";

    const unitName =
      remote.unit?.name ||
      remote.unit?.short ||
      (unitId && options?.unitMap?.get(unitId)) ||
      remote.unit?.code_1C ||
      'dona';

    return {
      id,
      salesdoc_id: remote.SD_id || remote.CS_id,
      code_1c: remote.code_1C || '',
      name: remote.name || "Nomsiz mahsulot",
      barcode: remote.barCode || '',
      unit: unitName,
      category: categoryName,
      price: defaultPrice,
      stock_quantity: options?.existingStockQty ?? 0,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Convert LocalProduct entity to SalesDoc setProduct payload item
   */
  public static toSalesDocProductPayload(local: LocalProduct): any {
    return {
      code_1C: local.code_1c || local.id,
      ...(local.salesdoc_id ? { SD_id: local.salesdoc_id } : {}),
      name: local.name,
      active: true,
      barCode: local.barcode || undefined,
      category:
        local.category && local.category !== "Kategoriya ko'rsatilmagan"
          ? {
              name: local.category,
              code_1C: `CAT_${local.category.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
            }
          : undefined,
      unit: {
        code_1C: local.unit || 'dona',
        name: local.unit || 'dona'
      }
    };
  }

  /**
   * Convert SalesDoc client representation to LocalCustomer entity
   */
  public static toLocalCustomer(
    remote: SalesDocClient,
    localExistingId?: string,
    options?: ClientMapperOptions
  ): LocalCustomer {
    const rAny = remote as any;
    const id = localExistingId || remote.code_1C || remote.SD_id || remote.CS_id || `client_${Date.now()}`;
    const phone = remote.tel || (remote.phone_numbers && remote.phone_numbers[0]) || '';

    const catObj = remote.clientCategory || rAny.category;
    const catId = catObj?.SD_id || catObj?.CS_id || catObj?.code_1C;
    const categoryName =
      catObj?.name ||
      (catId && options?.categoryMap?.get(catId)) ||
      rAny.categoryName ||
      '';

    return {
      id,
      salesdoc_id: remote.SD_id || remote.CS_id,
      code_1c: remote.code_1C || '',
      name: remote.shortName || remote.firmName || rAny.name || rAny.clientName || "Nomsiz mijoz",
      phone,
      address: remote.address || '',
      inn: remote.inn || '',
      balance: Number(remote.balance || 0),
      category: categoryName || "Ko'rsatilmagan",
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Convert LocalCustomer entity to SalesDoc setClient payload item
   */
  public static toSalesDocClientPayload(local: LocalCustomer): any {
    return {
      code_1C: local.code_1c || local.id,
      ...(local.salesdoc_id ? { SD_id: local.salesdoc_id } : {}),
      shortName: local.name,
      ...(local.address ? { address: local.address } : {}),
      ...(local.phone ? { tel: local.phone } : {}),
      ...(local.inn ? { inn: local.inn } : {}),
      active: true,
      ...(local.category && local.category !== "Ko'rsatilmagan"
        ? {
            clientCategory: {
              name: local.category
            }
          }
        : {})
    };
  }

  /**
   * Convert SalesDoc order API representation to LocalOrder entity
   */
  public static toLocalOrder(remote: SalesDocOrder | any, localExistingId?: string): LocalOrder {
    const id = localExistingId || remote.document_1C || remote.code_1C || remote.SD_id || remote.CS_id || `ORD-${Date.now()}`;
    const rawItems = remote.orderProducts || remote.detail || [];

    const items: LocalOrderItem[] = rawItems.map((d: any) => {
      const prodObj = d.product || {};
      const qty = Number(d.quantity ?? d.count ?? 0);
      const price = Number(d.price ?? 0);
      const rawItemTotal = d.summa ?? d.totalSumma;
      const total = Number(rawItemTotal !== undefined && rawItemTotal !== null ? rawItemTotal : qty * price);
      return {
        product_id: prodObj.SD_id || prodObj.CS_id || prodObj.code_1C || d.code_1C || d.SD_id || d.CS_id || 'unknown',
        product_name: prodObj.name || d.productName || prodObj.code_1C || d.code_1C || "Noma'lum mahsulot",
        product_code_1c: prodObj.code_1C || d.code_1C,
        quantity: qty,
        price,
        total
      };
    });

    const calculatedTotal = items.reduce((acc, item) => acc + item.total, 0);
    const rawTotal =
      remote.totalSummaAfterDiscount ?? remote.totalSumma ?? remote.total_summa ?? calculatedTotal;

    const dateCreate = remote.dateCreate || remote.orderCreated || remote.dateDocument || remote.date || '';
    const orderDateOnly = dateCreate ? String(dateCreate).slice(0, 10) : getTashkentTodayIso();

    const rawStatus =
      remote.status !== undefined && remote.status !== null
        ? String(remote.status)
        : (remote.order_status || remote.status_1C);

    return {
      id,
      salesdoc_id: remote.SD_id || remote.CS_id,
      code_1c: remote.code_1C || remote.document_1C,
      customer_id: remote.client?.SD_id || remote.client?.CS_id || remote.client?.code_1C || 'unknown',
      customer_name:
        remote.client?.clientName ||
        remote.client?.name ||
        remote.client?.shortName ||
        remote.client?.code_1C ||
        remote.client?.SD_id ||
        "Noma'lum mijoz",
      customer_code_1c: remote.client?.code_1C,
      order_date: orderDateOnly,
      delivery_date: remote.dateShipment || remote.deliveryDate,
      status: this.mapRemoteOrderStatus(rawStatus),
      total_amount: Number(rawTotal),
      comment: remote.comment || '',
      items,
      agent_id: remote.agent?.SD_id || remote.agent?.CS_id,
      agent_name: remote.agent?.name,
      date_create: dateCreate || undefined,
      order_created: remote.orderCreated || dateCreate || undefined,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      created_at: dateCreate || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Convert LocalOrder entity to SalesDoc setOrder payload item
   */
  public static toSalesDocOrderPayload(local: LocalOrder): any {
    return {
      code_1C: local.code_1c || local.id,
      document_1C: local.code_1c || local.id,
      date: local.order_date || new Date().toISOString().slice(0, 19).replace('T', ' '),
      deliveryDate: local.delivery_date || undefined,
      comment: local.comment || `Order ${local.id}`,
      client: {
        code_1C: local.customer_code_1c || local.customer_id
      },
      detail: local.items.map((item) => ({
        code_1C: item.product_code_1c || item.product_id,
        quantity: Number(item.quantity),
        price: Number(item.price),
        summa: Number(item.total || item.quantity * item.price)
      }))
    };
  }

  /**
   * Convert SalesDoc warehouse to LocalWarehouse
   */
  public static toLocalWarehouse(remote: SalesDocWarehouse): LocalWarehouse {
    return {
      id: remote.code_1C || remote.SD_id || remote.CS_id || `wh_${Date.now()}`,
      salesdoc_id: remote.SD_id || remote.CS_id,
      code_1c: remote.code_1C,
      name: remote.name,
      is_active: remote.active === true || remote.active === 'Y' || remote.active === '1'
    };
  }

  /**
   * Convert SalesDoc payment to LocalPayment
   */
  public static toLocalPayment(remote: SalesDocPayment | any, localId?: string): LocalPayment {
    return {
      id: localId || remote.code_1C || remote.SD_id || remote.CS_id || `PAY-${Date.now()}`,
      salesdoc_id: remote.SD_id || remote.CS_id,
      code_1c: remote.code_1C,
      order_id: remote.order?.code_1C || remote.order?.SD_id,
      customer_id: remote.client?.SD_id || remote.client?.CS_id || remote.client?.code_1C || 'unknown',
      customer_name:
        remote.client?.clientName ||
        remote.client?.name ||
        remote.client?.shortName ||
        remote.client?.code_1C ||
        remote.client?.SD_id ||
        "Noma'lum mijoz",
      amount: Number(remote.amount || 0),
      payment_date: remote.paymentDate || new Date().toISOString(),
      payment_type: remote.paymentType?.name || remote.paymentType?.code_1C || remote.paymentType?.SD_id || 'cash',
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      created_at: remote.paymentDate || new Date().toISOString()
    };
  }

  public static mapRemoteOrderStatus(
    status?: string | number
  ): 'draft' | 'pending' | 'confirmed' | 'delivered' | 'closed' | 'cancelled' {
    if (status === undefined || status === null) return 'pending';
    const s = String(status).trim().toLowerCase();
    if (s === '5' || s.includes('cancel') || s.includes('otmen')) return 'cancelled';
    if (s === '4' || s.includes('close') || s.includes('zakrit')) return 'closed';
    if (s === '3' || s.includes('deliver') || s.includes('dostav') || s.includes('complete')) return 'delivered';
    if (s === '2' || s.includes('confirm') || s.includes('otgruj') || s.includes('ship') || s === 'sent') return 'confirmed';
    if (s === '0' || s.includes('draft')) return 'draft';
    return 'pending';
  }
}

