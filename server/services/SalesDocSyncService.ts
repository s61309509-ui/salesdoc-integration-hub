import { LocalDb } from '../storage/localDb.js';
import { SalesDocProductService } from './SalesDocProductService.js';
import { SalesDocClientService } from './SalesDocClientService.js';
import { SalesDocOrderService } from './SalesDocOrderService.js';
import { SalesDocStockService } from './SalesDocStockService.js';
import { SalesDocPaymentService } from './SalesDocPaymentService.js';
import { SalesDocClient } from '../client/SalesDocClient.js';

export interface SyncProgress {
  isRunning: boolean;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export class SalesDocSyncService {
  private static instance: SalesDocSyncService | null = null;
  private db: LocalDb;
  private client: SalesDocClient;
  private productService: SalesDocProductService;
  private clientService: SalesDocClientService;
  private orderService: SalesDocOrderService;
  private stockService: SalesDocStockService;
  private paymentService: SalesDocPaymentService;

  private isSyncing = false;
  private currentProgress: SyncProgress = {
    isRunning: false,
    currentStep: 'Idle',
    stepIndex: 0,
    totalSteps: 5
  };

  private constructor() {
    this.db = LocalDb.getInstance();
    this.client = SalesDocClient.getInstance();
    this.productService = new SalesDocProductService(this.client, this.db);
    this.clientService = new SalesDocClientService(this.client, this.db);
    this.orderService = new SalesDocOrderService(this.client, this.db);
    this.stockService = new SalesDocStockService(this.client, this.db);
    this.paymentService = new SalesDocPaymentService(this.client, this.db);
  }

  public static getInstance(): SalesDocSyncService {
    if (!SalesDocSyncService.instance) {
      SalesDocSyncService.instance = new SalesDocSyncService();
    }
    return SalesDocSyncService.instance;
  }

  public getProgress(): SyncProgress {
    return { ...this.currentProgress };
  }

  /**
   * Run full bidirectional synchronization
   */
  public async syncAll(): Promise<{ success: boolean; results: Record<string, any>; error?: string }> {
    if (this.isSyncing) {
      throw new Error('A synchronization job is already running');
    }

    this.isSyncing = true;
    this.currentProgress = {
      isRunning: true,
      currentStep: 'Starting full synchronization...',
      stepIndex: 0,
      totalSteps: 5,
      startedAt: new Date().toISOString()
    };

    const results: Record<string, any> = {};

    try {
      // Step 1: Products
      this.currentProgress.currentStep = 'Syncing Products & Categories...';
      this.currentProgress.stepIndex = 1;
      try {
        results.products = await this.productService.syncFromSalesDoc();
      } catch (err: any) {
        results.products = { error: err.message };
      }

      // Step 2: Clients
      this.currentProgress.currentStep = 'Syncing Clients & Debt Balances...';
      this.currentProgress.stepIndex = 2;
      try {
        results.clients = await this.clientService.syncFromSalesDoc();
      } catch (err: any) {
        results.clients = { error: err.message };
      }

      // Step 3: Warehouses & Stock
      this.currentProgress.currentStep = 'Syncing Warehouses & Real-Time Stock...';
      this.currentProgress.stepIndex = 3;
      try {
        results.stock = await this.stockService.syncStockFromSalesDoc();
      } catch (err: any) {
        results.stock = { error: err.message };
      }

      // Step 4: Orders
      this.currentProgress.currentStep = 'Syncing Sales Orders...';
      this.currentProgress.stepIndex = 4;
      try {
        results.orders = await this.orderService.syncFromSalesDoc();
      } catch (err: any) {
        results.orders = { error: err.message };
      }

      // Step 5: Payments
      this.currentProgress.currentStep = 'Syncing Payments & Collections...';
      this.currentProgress.stepIndex = 5;
      try {
        results.payments = await this.paymentService.syncPaymentsFromSalesDoc();
      } catch (err: any) {
        results.payments = { error: err.message };
      }

      const failedSteps = Object.entries(results)
        .filter(([, val]) => Boolean(val && typeof val === 'object' && 'error' in val && val.error))
        .map(([key, val]) => `${key}: ${(val as any).error}`);

      const hasErrors = failedSteps.length > 0;
      const summaryError = hasErrors ? failedSteps.join('; ') : undefined;

      this.currentProgress = {
        isRunning: false,
        currentStep: hasErrors
          ? `Synchronization finished with ${failedSteps.length} error(s)`
          : 'Synchronization completed successfully',
        stepIndex: 5,
        totalSteps: 5,
        ...(summaryError ? { error: summaryError } : {}),
        completedAt: new Date().toISOString()
      };

      return { success: !hasErrors, results, ...(summaryError ? { error: summaryError } : {}) };
    } catch (err: any) {
      this.currentProgress = {
        isRunning: false,
        currentStep: 'Synchronization failed',
        stepIndex: 5,
        totalSteps: 5,
        error: err.message,
        completedAt: new Date().toISOString()
      };
      return { success: false, results, error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  public getProductService() {
    return this.productService;
  }

  public getClientService() {
    return this.clientService;
  }

  public getOrderService() {
    return this.orderService;
  }

  public getStockService() {
    return this.stockService;
  }

  public getPaymentService() {
    return this.paymentService;
  }
}
