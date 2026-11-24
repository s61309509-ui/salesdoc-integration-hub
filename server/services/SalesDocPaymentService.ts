import { SalesDocClient } from '../client/SalesDocClient.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import {
  LocalPayment,
  SalesDocBalance,
  SalesDocCashbox,
  SalesDocConsumption,
  SalesDocPayment,
  SalesDocSetResult
} from '../types/salesdoc.types.js';

export class SalesDocPaymentService {
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  /**
   * 9.15. getPayment - Payments list
   */
  public async getPayment(params: any = {}) {
    return this.client.request<{ payment: SalesDocPayment[] }>('getPayment', params);
  }

  /**
   * 9.29. getBalance - Client balances
   */
  public async getBalance(params: any = {}) {
    return this.client.request<{ balance: SalesDocBalance[] }>('getBalance', params);
  }

  /**
   * 9.30. getConsumption - Cash operations (expense/income)
   */
  public async getConsumption(params: any = {}) {
    return this.client.request<{ consumption: SalesDocConsumption[] }>('getConsumption', params);
  }

  /**
   * 9.31. getCashbox - Cashboxes
   */
  public async getCashbox(params: any = {}) {
    return this.client.request<{ cashbox: SalesDocCashbox[] }>('getCashbox', params);
  }

  /**
   * 13.1. setPayment - Create client payment
   */
  public async setPayment(payments: any[]) {
    return this.client.request<SalesDocSetResult>('setPayment', undefined, { payment: payments });
  }

  /**
   * 13.2. setBalance - Set opening balance
   */
  public async setBalance(balances: any[]) {
    return this.client.request<SalesDocSetResult>('setBalance', undefined, { balance: balances });
  }

  /**
   * 13.3. setCurrentBalance - Sync current balance (Rate limit: max 3/5min)
   */
  public async setCurrentBalance(balances: any[]) {
    return this.client.request<SalesDocSetResult>('setCurrentBalance', undefined, { currentBalance: balances });
  }

  /**
   * 13.4. setConsumption - Create expense/income
   */
  public async setConsumption(consumptions: any[]) {
    return this.client.request<SalesDocSetResult>('setConsumption', undefined, { consumption: consumptions });
  }

  /**
   * Sync payments from SalesDoc into local storage
   */
  public async syncPaymentsFromSalesDoc(params: any = {}): Promise<{ processed: number; failed: number }> {
    const start = Date.now();
    try {
      const remotePayments = await this.client.fetchAllPages<SalesDocPayment>(
        'getPayment',
        params,
        (result) => result?.payment || [],
        200,
        5
      );

      const mappedPayments = remotePayments.map((remote) => SalesDocMapper.toLocalPayment(remote));
      const processed = this.db.upsertPaymentsBatch(mappedPayments);

      this.db.addSyncLog({
        method: 'getPayment',
        direction: 'inbound',
        entity: 'payment',
        records_processed: processed,
        records_failed: 0,
        status: 'success',
        duration_ms: Date.now() - start
      });

      return { processed, failed: 0 };
    } catch (err: any) {
      this.db.addSyncLog({
        method: 'getPayment',
        direction: 'inbound',
        entity: 'payment',
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
   * Push a local payment to SalesDoc
   */
  public async pushPaymentToSalesDoc(paymentId: string): Promise<LocalPayment> {
    const payment = this.db.getPayments().find((p) => p.id === paymentId);
    if (!payment) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }

    const payload = {
      code_1C: payment.code_1c || payment.id,
      amount: payment.amount,
      paymentDate: payment.payment_date,
      client: { code_1C: payment.customer_id },
      paymentType: { code_1C: payment.payment_type || '000000001' },
      comment: `Payment ${payment.id}`
    };

    const start = Date.now();
    try {
      const response = await this.setPayment([payload]);
      const isSuccess = response.status && (response.result?.error === 0 || response.result?.completed > 0);

      const updated: LocalPayment = {
        ...payment,
        sync_status: isSuccess ? 'synced' : 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: isSuccess ? undefined : 'SalesDoc reported error registering payment'
      };

      this.db.upsertPayment(updated);
      this.db.addSyncLog({
        method: 'setPayment',
        direction: 'outbound',
        entity: 'payment',
        records_processed: 1,
        records_failed: isSuccess ? 0 : 1,
        status: isSuccess ? 'success' : 'failed',
        duration_ms: Date.now() - start
      });

      return updated;
    } catch (err: any) {
      const failedPayment: LocalPayment = {
        ...payment,
        sync_status: 'failed',
        last_error: err.message
      };
      this.db.upsertPayment(failedPayment);
      this.db.addSyncLog({
        method: 'setPayment',
        direction: 'outbound',
        entity: 'payment',
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
   * Reconcile category d0_12 (SM-Причисленя Дукон) clients:
   * Compares pre-shipping balances with current balances and calculates the delta to pay in cash.
   */
  public async getCat12Reconciliation() {
    // 1. Fetch clients with category d0_12
    const cat12Clients: Array<{ id: string; name: string }> = [];
    for (let page = 1; page <= 4; page++) {
      const res = await this.client.request<any>('getClient', { limit: 1000, page });
      const clients = res.result?.client || [];
      if (clients.length === 0) break;
      for (const c of clients) {
        if (c.category?.SD_id === 'd0_12' || c.category?.CS_id === 'd0_12') {
          cat12Clients.push({
            id: c.SD_id || c.CS_id,
            name: c.name
          });
        }
      }
    }

    const cat12Ids = cat12Clients.map((c) => c.id);

    // 2. Fetch current balances
    const balRes = await this.client.request<any>('getBalance', { limit: 2000 });
    const balances = balRes.result?.balance || [];
    const balMap = new Map<string, any>();
    for (const b of balances) {
      if (b.SD_id) balMap.set(b.SD_id, b);
      if (b.CS_id) balMap.set(b.CS_id, b);
    }

    // 3. Fetch shipped orders (status: 2)
    const clientOrdersMap = new Map<string, { count: number; totalSum: number; orders: any[] }>();
    for (const id of cat12Ids) {
      clientOrdersMap.set(id, { count: 0, totalSum: 0, orders: [] });
    }

    for (let page = 1; page <= 12; page++) {
      const ordersRes = await this.client.request<any>('getOrder', {
        limit: 200,
        page,
        filter: { status: [2] }
      });
      const orders = ordersRes.result?.order || [];
      if (orders.length === 0) break;
      for (const o of orders) {
        const cId = o.client?.SD_id || o.client?.CS_id;
        if (clientOrdersMap.has(cId)) {
          const entry = clientOrdersMap.get(cId)!;
          const summa = Number(o.totalSumma || 0);
          entry.count++;
          entry.totalSum += summa;
          entry.orders.push({
            id: o.SD_id || o.CS_id,
            dateCreate: o.dateCreate,
            dateDocument: o.dateDocument,
            summa
          });
        }
      }
    }

    // 4. Construct client reconciliation objects
    const clientReconList = cat12Clients.map((c) => {
      const b = balMap.get(c.id);
      const ordInfo = clientOrdersMap.get(c.id) || { count: 0, totalSum: 0, orders: [] };
      const currentBalance = b ? Number(b.balance || 0) : 0;
      const currencies = b?.['by-currency'] || [];
      const goodsDebt = Number(currencies.find((cur: any) => cur.currency_id === 'd0_2')?.amount || 0);
      const cashPaid = Number(currencies.find((cur: any) => cur.currency_id === 'd0_5')?.amount || 0);
      const transferPaid = Number(currencies.find((cur: any) => cur.currency_id === 'd0_6')?.amount || 0);

      const shippedOrdersSum = ordInfo.totalSum;
      const preShippingBalance = currentBalance + shippedOrdersSum;
      const amountToEqualize = shippedOrdersSum;
      const netDebt = currentBalance < 0 ? Math.abs(currentBalance) : 0;

      return {
        clientId: c.id,
        clientName: b?.name || c.name,
        shippedOrdersCount: ordInfo.count,
        shippedOrdersSum,
        currentBalance,
        preShippingBalance,
        amountToEqualize,
        netDebt,
        currencies: {
          goodsDebt_d0_2: goodsDebt,
          cashPaid_d0_5: cashPaid,
          transferPaid_d0_6: transferPaid
        },
        orders: ordInfo.orders
      };
    });

    const clientsWithShippedOrders = clientReconList.filter((c) => c.shippedOrdersCount > 0);
    const totalShippedSum = clientReconList.reduce((acc, c) => acc + c.shippedOrdersSum, 0);
    const totalShippedOrdersCount = clientReconList.reduce((acc, c) => acc + c.shippedOrdersCount, 0);
    const totalNetDebt = clientReconList.reduce((acc, c) => acc + c.netDebt, 0);

    return {
      category: {
        id: 'd0_12',
        name: 'SM-Причисленя Дукон'
      },
      summary: {
        totalClients: clientReconList.length,
        clientsWithShippedOrdersCount: clientsWithShippedOrders.length,
        totalShippedOrdersCount,
        totalShippedSum,
        totalNetDebt
      },
      clients: clientReconList
    };
  }

  /**
   * Execute cash payment (НАКД - d0_5) to equalize balance for d0_12 clients
   */
  public async executeCat12ReconciliationPayments(options: {
    mode?: 'shipped_orders_sum' | 'net_debt';
    clientIds?: string[];
    dryRun?: boolean;
  }) {
    const { mode = 'shipped_orders_sum', clientIds, dryRun = false } = options;
    const reconData = await this.getCat12Reconciliation();

    const targetClients = reconData.clients.filter((c) => {
      if (clientIds && clientIds.length > 0) {
        return clientIds.includes(c.clientId);
      }
      return mode === 'net_debt' ? c.netDebt > 0 : c.shippedOrdersSum > 0;
    });

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const results: any[] = [];
    let completedCount = 0;
    let errorCount = 0;
    let totalPaidAmount = 0;

    for (const target of targetClients) {
      const payAmount = mode === 'net_debt' ? target.netDebt : target.shippedOrdersSum;
      if (payAmount <= 0) continue;

      const code1C = `PAY-D12-${target.clientId}-${Date.now().toString().slice(-6)}`;
      const comment = mode === 'net_debt'
        ? `Оплата нал (Qolgan qarzdorlik yopish: ${payAmount.toLocaleString()} UZS) SM-Причисленя Дукон (d0_12)`
        : `Оплата нал (Отгрузка balansini tenglash: ${payAmount.toLocaleString()} UZS) SM-Причисленя Дукон (d0_12)`;

      const paymentItem = {
        code_1C: code1C,
        amount: payAmount,
        paymentDate: nowStr,
        comment,
        client: { SD_id: target.clientId },
        paymentType: { SD_id: 'd0_5' }
      };

      try {
        const response = await this.client.request<any>(
          'setPayment',
          undefined,
          { payment: [paymentItem] },
          { dryRun }
        );

        const isSuccess = dryRun || (response.status && response.result?.error === 0);
        if (isSuccess) {
          completedCount++;
          totalPaidAmount += payAmount;
        } else {
          errorCount++;
        }

        results.push({
          clientId: target.clientId,
          clientName: target.clientName,
          amount: payAmount,
          code_1C: code1C,
          paymentType: 'd0_5 (НАКД)',
          status: isSuccess ? 'success' : 'failed',
          dryRun,
          response: response.result || response
        });
      } catch (err: any) {
        errorCount++;
        results.push({
          clientId: target.clientId,
          clientName: target.clientName,
          amount: payAmount,
          code_1C: code1C,
          status: 'failed',
          error: err.message
        });
      }
    }

    return {
      dryRun,
      mode,
      processedClientsCount: results.length,
      completedCount,
      errorCount,
      totalPaidAmount,
      results
    };
  }
}
