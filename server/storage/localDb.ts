import fs from 'fs';
import path from 'path';
import {
  LocalCustomer,
  LocalOrder,
  LocalPayment,
  LocalProduct,
  LocalWarehouse,
  PhotoAiAnalysisRecord,
  SalesDocStockItem,
  SyncLogEntry,
  SyncMetrics
} from '../types/salesdoc.types.js';

interface DatabaseSchema {
  products: LocalProduct[];
  clients: LocalCustomer[];
  orders: LocalOrder[];
  warehouses: LocalWarehouse[];
  stock: SalesDocStockItem[];
  payments: LocalPayment[];
  syncLogs: SyncLogEntry[];
  deviceAliases?: Record<string, string>;
  telegramConfig?: {
    botToken?: string;
    defaultChatId?: string;
    agentChatIds?: Record<string, string>;
    autoSendAlerts?: boolean;
    pollIntervalSeconds?: number;
    lastPolledAt?: string;
  };
  agentTeamConfigs?: Record<string, {
    agentId: string;
    agentName: string;
    team1ChatId: string;
    team1TopicId?: string;
    team2ChatId: string;
    team2TopicId?: string;
    isCombinedWorker?: boolean;
    teamMode?: 'single' | 'dual';
    notes?: string;
  }>;
  dailyReportConfig?: {
    scheduledTime: string;
    autoSendEnabled: boolean;
    lastSentDate?: string;
    lastSentAt?: string;
  };
  googleSheetsConfig?: {
    spreadsheetId?: string;
    webhookUrl?: string;
    autoSyncEnabled?: boolean;
    lastSyncedAt?: string;
    lastSyncedDate?: string;
  };
  sheetsHistoryCache?: Record<string, any>;
  sentAlerts?: Record<string, {
    sentAt: string;
    chatId: string;
    messageId?: number;
    success: boolean;
    error?: string;
  }>;
  customVisits?: any[];
  salesDocAuth?: {
    token?: string;
    userId?: string;
    filialId?: string;
    baseUrl?: string;
    savedLogin?: string;
    savedPassword?: string;
    updatedAt?: string;
    lastLoginAt?: string;
    lastTokenRefreshAt?: string;
  };
  photoFlags?: Record<string, {
    is_covered_camera?: boolean;
    is_distant_photo?: boolean;
    reason?: string;
    updatedAt: string;
  }>;
  photoAiAnalyses?: Record<string, PhotoAiAnalysisRecord>;
  monitorStatus?: {
    isRunning: boolean;
    intervalSeconds: number;
    autoAiAudit?: boolean;
    lastRunAt?: string;
    totalRuns: number;
    lastResults?: any;
  };
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalLatencyMs: number;
    lastSyncTime?: string;
  };
}

export class LocalDb {
  private static instance: LocalDb | null = null;
  private dbPath: string;
  private data: DatabaseSchema;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'salesdoc_database.json');
    this.data = this.load();
  }

  public static getInstance(): LocalDb {
    if (!LocalDb.instance) {
      LocalDb.instance = new LocalDb();
    }
    return LocalDb.instance;
  }

  private load(): DatabaseSchema {
    let result: DatabaseSchema;
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        result = JSON.parse(raw);
      } catch (err) {
        console.error('[LocalDb] Error parsing database file, initializing fresh schema', err);
        result = this.getInitialData();
      }
    } else {
      result = this.getInitialData();
      this.persist(result);
    }

    // Auto-sync salesDocAuth from salesdoc_config.json if present
    try {
      const configPath = path.join(path.dirname(this.dbPath), 'salesdoc_config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (cfg && (cfg.token || cfg.savedLogin)) {
          result.salesDocAuth = {
            ...(result.salesDocAuth || {}),
            baseUrl: cfg.baseUrl || result.salesDocAuth?.baseUrl,
            token: cfg.token || result.salesDocAuth?.token,
            userId: cfg.userId || result.salesDocAuth?.userId,
            filialId: cfg.filialId !== undefined ? cfg.filialId : result.salesDocAuth?.filialId,
            savedLogin: cfg.savedLogin || result.salesDocAuth?.savedLogin,
            savedPassword: cfg.savedPassword || result.salesDocAuth?.savedPassword,
            lastLoginAt: cfg.lastLoginAt || result.salesDocAuth?.lastLoginAt,
            lastTokenRefreshAt: cfg.lastTokenRefreshAt || result.salesDocAuth?.lastTokenRefreshAt,
            updatedAt: cfg.updatedAt || result.salesDocAuth?.updatedAt || new Date().toISOString()
          };
        }
      }
    } catch (e) {}

    return result;
  }

  private persist(dataToSave?: DatabaseSchema): void {
    try {
      const data = dataToSave || this.data;
      fs.writeFileSync(this.dbPath, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('[LocalDb] Error saving database file', err);
    }
  }

  private getInitialData(): DatabaseSchema {
    return {
      products: [],
      clients: [],
      orders: [],
      warehouses: [],
      stock: [],
      payments: [],
      syncLogs: [],
      photoAiAnalyses: {},
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatencyMs: 0,
        lastSyncTime: undefined
      }
    };
  }

  // --- Products ---
  public getProducts(): LocalProduct[] {
    return [...this.data.products];
  }

  public getProductById(id: string): LocalProduct | undefined {
    return this.data.products.find((p) => p.id === id || p.code_1c === id || p.salesdoc_id === id);
  }

  public upsertProduct(product: LocalProduct): LocalProduct {
    const idx = this.data.products.findIndex(
      (p) => p.id === product.id || (product.code_1c && p.code_1c === product.code_1c)
    );
    if (idx >= 0) {
      this.data.products[idx] = { ...this.data.products[idx], ...product, updated_at: new Date().toISOString() };
    } else {
      this.data.products.unshift(product);
    }
    this.persist();
    return product;
  }

  public upsertProductsBatch(products: LocalProduct[]): number {
    if (products.length === 0) return 0;
    const byId = new Map<string, number>();
    const byCode = new Map<string, number>();
    this.data.products.forEach((p, idx) => {
      if (p.id) byId.set(p.id, idx);
      if (p.code_1c) byCode.set(p.code_1c, idx);
    });
    const now = new Date().toISOString();
    const toInsert: LocalProduct[] = [];
    for (const product of products) {
      const idx =
        (product.id && byId.get(product.id)) ??
        (product.code_1c ? byCode.get(product.code_1c) : undefined);
      if (idx !== undefined) {
        this.data.products[idx] = { ...this.data.products[idx], ...product, updated_at: now };
      } else {
        toInsert.push(product);
      }
    }
    if (toInsert.length > 0) {
      this.data.products.unshift(...toInsert);
    }
    this.persist();
    return products.length;
  }

  // --- Clients ---
  public getClients(): LocalCustomer[] {
    return [...this.data.clients];
  }

  public getClientById(id: string): LocalCustomer | undefined {
    return this.data.clients.find((c) => c.id === id || c.code_1c === id || c.salesdoc_id === id);
  }

  public upsertClient(client: LocalCustomer): LocalCustomer {
    const idx = this.data.clients.findIndex(
      (c) => c.id === client.id || (client.code_1c && c.code_1c === client.code_1c)
    );
    if (idx >= 0) {
      this.data.clients[idx] = { ...this.data.clients[idx], ...client, updated_at: new Date().toISOString() };
    } else {
      this.data.clients.unshift(client);
    }
    this.persist();
    return client;
  }

  public upsertClientsBatch(clients: LocalCustomer[]): number {
    if (clients.length === 0) return 0;
    const byId = new Map<string, number>();
    const byCode = new Map<string, number>();
    this.data.clients.forEach((c, idx) => {
      if (c.id) byId.set(c.id, idx);
      if (c.code_1c) byCode.set(c.code_1c, idx);
    });
    const now = new Date().toISOString();
    const toInsert: LocalCustomer[] = [];
    for (const client of clients) {
      const idx =
        (client.id && byId.get(client.id)) ??
        (client.code_1c ? byCode.get(client.code_1c) : undefined);
      if (idx !== undefined) {
        this.data.clients[idx] = { ...this.data.clients[idx], ...client, updated_at: now };
      } else {
        toInsert.push(client);
      }
    }
    if (toInsert.length > 0) {
      this.data.clients.unshift(...toInsert);
    }
    this.persist();
    return clients.length;
  }

  // --- Orders ---
  public getOrders(): LocalOrder[] {
    return [...this.data.orders];
  }

  public getOrderById(id: string): LocalOrder | undefined {
    return this.data.orders.find((o) => o.id === id || o.code_1c === id || o.salesdoc_id === id);
  }

  public upsertOrder(order: LocalOrder): LocalOrder {
    const idx = this.data.orders.findIndex(
      (o) => o.id === order.id || (order.code_1c && o.code_1c === order.code_1c)
    );
    if (idx >= 0) {
      this.data.orders[idx] = { ...this.data.orders[idx], ...order, updated_at: new Date().toISOString() };
    } else {
      this.data.orders.unshift(order);
    }
    this.persist();
    return order;
  }

  public upsertOrdersBatch(orders: LocalOrder[]): number {
    if (orders.length === 0) return 0;
    const byId = new Map<string, number>();
    const byCode = new Map<string, number>();
    this.data.orders.forEach((o, idx) => {
      if (o.id) byId.set(o.id, idx);
      if (o.code_1c) byCode.set(o.code_1c, idx);
    });
    const now = new Date().toISOString();
    const toInsert: LocalOrder[] = [];
    for (const order of orders) {
      const idx =
        (order.id && byId.get(order.id)) ??
        (order.code_1c ? byCode.get(order.code_1c) : undefined);
      if (idx !== undefined) {
        this.data.orders[idx] = { ...this.data.orders[idx], ...order, updated_at: now };
      } else {
        toInsert.push(order);
      }
    }
    if (toInsert.length > 0) {
      this.data.orders.unshift(...toInsert);
    }
    this.persist();
    return orders.length;
  }

  // --- Warehouses & Stock ---
  public getWarehouses(): LocalWarehouse[] {
    return [...this.data.warehouses];
  }

  public upsertWarehouse(wh: LocalWarehouse): void {
    const idx = this.data.warehouses.findIndex((w) => w.id === wh.id || (wh.code_1c && w.code_1c === wh.code_1c));
    if (idx >= 0) {
      this.data.warehouses[idx] = { ...this.data.warehouses[idx], ...wh };
    } else {
      this.data.warehouses.push(wh);
    }
    this.persist();
  }

  public upsertWarehousesBatch(warehouses: LocalWarehouse[]): void {
    if (warehouses.length === 0) return;
    for (const wh of warehouses) {
      const idx = this.data.warehouses.findIndex((w) => w.id === wh.id || (wh.code_1c && w.code_1c === wh.code_1c));
      if (idx >= 0) {
        this.data.warehouses[idx] = { ...this.data.warehouses[idx], ...wh };
      } else {
        this.data.warehouses.push(wh);
      }
    }
    this.persist();
  }

  public getStock(): SalesDocStockItem[] {
    return [...this.data.stock];
  }

  public setStock(stockItems: SalesDocStockItem[]): void {
    this.data.stock = stockItems;
    this.persist();
  }

  // --- Payments ---
  public getPayments(): LocalPayment[] {
    return [...this.data.payments];
  }

  public upsertPayment(payment: LocalPayment): LocalPayment {
    const idx = this.data.payments.findIndex(
      (p) => p.id === payment.id || (payment.code_1c && p.code_1c === payment.code_1c)
    );
    if (idx >= 0) {
      this.data.payments[idx] = { ...this.data.payments[idx], ...payment };
    } else {
      this.data.payments.unshift(payment);
    }
    this.persist();
    return payment;
  }

  public upsertPaymentsBatch(payments: LocalPayment[]): number {
    if (payments.length === 0) return 0;
    const byId = new Map<string, number>();
    const byCode = new Map<string, number>();
    this.data.payments.forEach((p, idx) => {
      if (p.id) byId.set(p.id, idx);
      if (p.code_1c) byCode.set(p.code_1c, idx);
    });
    const toInsert: LocalPayment[] = [];
    for (const payment of payments) {
      const idx =
        (payment.id && byId.get(payment.id)) ??
        (payment.code_1c ? byCode.get(payment.code_1c) : undefined);
      if (idx !== undefined) {
        this.data.payments[idx] = { ...this.data.payments[idx], ...payment };
      } else {
        toInsert.push(payment);
      }
    }
    if (toInsert.length > 0) {
      this.data.payments.unshift(...toInsert);
    }
    this.persist();
    return payments.length;
  }

  // --- Device Aliases ---
  public getDeviceAliases(): Record<string, string> {
    if (!this.data.deviceAliases) {
      this.data.deviceAliases = {};
    }
    return { ...this.data.deviceAliases };
  }

  public setDeviceAlias(key: string, alias: string): Record<string, string> {
    if (!this.data.deviceAliases) {
      this.data.deviceAliases = {};
    }
    this.data.deviceAliases[key] = alias;
    this.persist();
    return { ...this.data.deviceAliases };
  }

  // --- Telegram Integration Config & Alerts ---
  public getTelegramConfig(): {
    botToken: string;
    defaultChatId: string;
    agentChatIds: Record<string, string>;
    autoSendAlerts: boolean;
  } {
    const fromEnvToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const fromEnvChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID || '';
    const stored = this.data.telegramConfig || {};

    return {
      botToken: stored.botToken || fromEnvToken,
      defaultChatId: stored.defaultChatId || fromEnvChatId,
      agentChatIds: stored.agentChatIds || {},
      autoSendAlerts: stored.autoSendAlerts ?? true
    };
  }

  public updateTelegramConfig(patch: {
    botToken?: string;
    defaultChatId?: string;
    agentChatIds?: Record<string, string>;
    autoSendAlerts?: boolean;
  }): {
    botToken: string;
    defaultChatId: string;
    agentChatIds: Record<string, string>;
    autoSendAlerts: boolean;
  } {
    if (!this.data.telegramConfig) {
      this.data.telegramConfig = {};
    }
    if (patch.botToken !== undefined) this.data.telegramConfig.botToken = patch.botToken;
    if (patch.defaultChatId !== undefined) this.data.telegramConfig.defaultChatId = patch.defaultChatId;
    if (patch.agentChatIds !== undefined) this.data.telegramConfig.agentChatIds = patch.agentChatIds;
    if (patch.autoSendAlerts !== undefined) this.data.telegramConfig.autoSendAlerts = patch.autoSendAlerts;
    this.persist();
    return this.getTelegramConfig();
  }

  // --- Agents & Teams Configs (1-Komanda / 2-Komanda) ---
  public getAgentTeamConfigs(): Record<string, {
    agentId: string;
    agentName: string;
    team1ChatId: string;
    team1TopicId?: string;
    team2ChatId: string;
    team2TopicId?: string;
    isCombinedWorker?: boolean;
    teamMode?: 'single' | 'dual';
    notes?: string;
  }> {
    const defaultAgents: Record<string, { agentId: string; agentName: string; team1ChatId: string; team2ChatId: string; isCombinedWorker?: boolean; teamMode?: 'single' | 'dual' }> = {
      'd0_1': { agentId: 'd0_1', agentName: 'ТП1(Супервайзер 99-362-31-33)', team1ChatId: '', team2ChatId: '', isCombinedWorker: false, teamMode: 'dual' },
      'd0_2': { agentId: 'd0_2', agentName: 'ТП2 (Супервайзер) 99-362-31-33', team1ChatId: '', team2ChatId: '', isCombinedWorker: false, teamMode: 'dual' },
      'd0_3': { agentId: 'd0_3', agentName: 'ТП3(Супервайзер 99-362-31-33)', team1ChatId: '', team2ChatId: '', isCombinedWorker: false, teamMode: 'dual' },
      'd0_4': { agentId: 'd0_4', agentName: 'ТП4 (Супервайзер 99-362-31-33)', team1ChatId: '', team2ChatId: '', isCombinedWorker: true, teamMode: 'single' },
      'd0_5': { agentId: 'd0_5', agentName: 'ТП5 (Супервайзер 99-362-31-33)', team1ChatId: '', team2ChatId: '', isCombinedWorker: true, teamMode: 'single' },
      'd0_6': { agentId: 'd0_6', agentName: 'ТП6 (Супервайзер 99-362-31-33)', team1ChatId: '', team2ChatId: '', isCombinedWorker: false, teamMode: 'dual' }
    };

    const stored = this.data.agentTeamConfigs || {};
    const result: Record<string, any> = {};

    // First merge defaults
    for (const [id, def] of Object.entries(defaultAgents)) {
      const existing: any = stored[id] || {};
      let mode: 'single' | 'dual' = def.teamMode || 'dual';
      if (existing.teamMode === 'single' || existing.isCombinedWorker === true) {
        mode = 'single';
      } else if (existing.teamMode === 'dual' || existing.isCombinedWorker === false) {
        mode = 'dual';
      }
      result[id] = {
        ...def,
        ...existing,
        teamMode: mode,
        isCombinedWorker: mode === 'single'
      };
    }

    // Also include any other agents added dynamically
    for (const [id, cfg] of Object.entries(stored)) {
      if (!result[id]) {
        const anyCfg: any = cfg;
        const mode: 'single' | 'dual' = (anyCfg.teamMode === 'single' || anyCfg.isCombinedWorker === true) ? 'single' : 'dual';
        result[id] = {
          ...anyCfg,
          teamMode: mode,
          isCombinedWorker: mode === 'single'
        };
      }
    }

    return result;
  }

  public saveAgentTeamConfigs(configs: Record<string, any>): Record<string, any> {
    if (!this.data.agentTeamConfigs) {
      this.data.agentTeamConfigs = {};
    }
    for (const [id, cfg] of Object.entries(configs)) {
      const current: any = this.data.agentTeamConfigs[id] || {};
      let isSingle = false;
      if (cfg.teamMode !== undefined) {
        isSingle = cfg.teamMode === 'single';
      } else if (cfg.isCombinedWorker !== undefined) {
        isSingle = Boolean(cfg.isCombinedWorker);
      } else if (current.teamMode !== undefined) {
        isSingle = current.teamMode === 'single';
      } else if (current.isCombinedWorker !== undefined) {
        isSingle = Boolean(current.isCombinedWorker);
      }

      this.data.agentTeamConfigs[id] = {
        ...current,
        ...cfg,
        teamMode: isSingle ? 'single' : 'dual',
        isCombinedWorker: isSingle
      };
    }
    this.persist();
    return this.getAgentTeamConfigs();
  }

  public setAgentTeamMode(agentId: string, mode: 'single' | 'dual'): Record<string, any> {
    if (!this.data.agentTeamConfigs) {
      this.data.agentTeamConfigs = {};
    }
    const current: any = this.data.agentTeamConfigs[agentId] || this.getAgentTeamConfigs()[agentId] || { agentId, agentName: `Agent ${agentId}`, team1ChatId: '', team2ChatId: '' };
    this.data.agentTeamConfigs[agentId] = {
      ...current,
      teamMode: mode,
      isCombinedWorker: mode === 'single'
    };
    this.persist();
    return this.getAgentTeamConfigs();
  }

  public setAllAgentsTeamMode(mode: 'single' | 'dual'): Record<string, any> {
    const all = this.getAgentTeamConfigs();
    if (!this.data.agentTeamConfigs) {
      this.data.agentTeamConfigs = {};
    }
    for (const [id, cfg] of Object.entries(all)) {
      this.data.agentTeamConfigs[id] = {
        ...cfg,
        teamMode: mode,
        isCombinedWorker: mode === 'single'
      };
    }
    this.persist();
    return this.getAgentTeamConfigs();
  }

  public getDailyReportConfig(): {
    scheduledTime: string;
    autoSendEnabled: boolean;
    lastSentDate?: string;
    lastSentAt?: string;
  } {
    const stored = (this.data.dailyReportConfig || {}) as {
      scheduledTime?: string;
      autoSendEnabled?: boolean;
      lastSentDate?: string;
      lastSentAt?: string;
    };
    return {
      scheduledTime: stored.scheduledTime || '22:30',
      autoSendEnabled: stored.autoSendEnabled ?? true,
      lastSentDate: stored.lastSentDate,
      lastSentAt: stored.lastSentAt
    };
  }

  public updateDailyReportConfig(patch: {
    scheduledTime?: string;
    autoSendEnabled?: boolean;
    lastSentDate?: string;
    lastSentAt?: string;
  }): {
    scheduledTime: string;
    autoSendEnabled: boolean;
    lastSentDate?: string;
    lastSentAt?: string;
  } {
    if (!this.data.dailyReportConfig) {
      this.data.dailyReportConfig = {
        scheduledTime: '22:30',
        autoSendEnabled: true
      };
    }
    if (patch.scheduledTime !== undefined) this.data.dailyReportConfig.scheduledTime = patch.scheduledTime;
    if (patch.autoSendEnabled !== undefined) this.data.dailyReportConfig.autoSendEnabled = patch.autoSendEnabled;
    if (patch.lastSentDate !== undefined) this.data.dailyReportConfig.lastSentDate = patch.lastSentDate;
    if (patch.lastSentAt !== undefined) this.data.dailyReportConfig.lastSentAt = patch.lastSentAt;
    this.persist();
    return this.getDailyReportConfig();
  }

  // --- Google Sheets Sync & History Cache ---
  public getGoogleSheetsConfig(): {
    spreadsheetId?: string;
    webhookUrl?: string;
    autoSyncEnabled: boolean;
    lastSyncedAt?: string;
    lastSyncedDate?: string;
  } {
    const stored = this.data.googleSheetsConfig || {};
    return {
      spreadsheetId: stored.spreadsheetId || '',
      webhookUrl: stored.webhookUrl || '',
      autoSyncEnabled: stored.autoSyncEnabled ?? true,
      lastSyncedAt: stored.lastSyncedAt,
      lastSyncedDate: stored.lastSyncedDate
    };
  }

  public updateGoogleSheetsConfig(patch: {
    spreadsheetId?: string;
    webhookUrl?: string;
    autoSyncEnabled?: boolean;
    lastSyncedAt?: string;
    lastSyncedDate?: string;
  }): {
    spreadsheetId?: string;
    webhookUrl?: string;
    autoSyncEnabled: boolean;
    lastSyncedAt?: string;
    lastSyncedDate?: string;
  } {
    if (!this.data.googleSheetsConfig) {
      this.data.googleSheetsConfig = {
        autoSyncEnabled: true
      };
    }
    if (patch.spreadsheetId !== undefined) this.data.googleSheetsConfig.spreadsheetId = patch.spreadsheetId;
    if (patch.webhookUrl !== undefined) this.data.googleSheetsConfig.webhookUrl = patch.webhookUrl;
    if (patch.autoSyncEnabled !== undefined) this.data.googleSheetsConfig.autoSyncEnabled = patch.autoSyncEnabled;
    if (patch.lastSyncedAt !== undefined) this.data.googleSheetsConfig.lastSyncedAt = patch.lastSyncedAt;
    if (patch.lastSyncedDate !== undefined) this.data.googleSheetsConfig.lastSyncedDate = patch.lastSyncedDate;
    this.persist();
    return this.getGoogleSheetsConfig();
  }

  public getSheetsHistoryCache(): Record<string, any> {
    return this.data.sheetsHistoryCache || {};
  }

  public setSheetsHistoryCache(cache: Record<string, any>): void {
    this.data.sheetsHistoryCache = {
      ...(this.data.sheetsHistoryCache || {}),
      ...cache
    };
    this.persist();
  }

  public getSentAlerts(): Record<string, {
    sentAt: string;
    chatId: string;
    messageId?: number;
    success: boolean;
    error?: string;
  }> {
    if (!this.data.sentAlerts) {
      this.data.sentAlerts = {};
    }
    return { ...this.data.sentAlerts };
  }

  public recordSentAlert(visitKey: string, alertInfo: {
    chatId: string;
    messageId?: number;
    success: boolean;
    error?: string;
  }): void {
    if (!this.data.sentAlerts) {
      this.data.sentAlerts = {};
    }
    this.data.sentAlerts[visitKey] = {
      sentAt: new Date().toISOString(),
      ...alertInfo
    };
    this.persist();
  }

  // --- Custom & Incoming Visits ---
  public getCustomVisits(): any[] {
    if (!this.data.customVisits) return [];
    return this.data.customVisits.filter(v => !v.visitKey?.startsWith('DEMO_'));
  }

  public addCustomVisit(visit: any): any {
    if (!this.data.customVisits) {
      this.data.customVisits = [];
    }
    const idx = this.data.customVisits.findIndex(
      (v) => (v.visitKey && v.visitKey === visit.visitKey) || (v.id && v.id === visit.id)
    );
    if (idx >= 0) {
      this.data.customVisits[idx] = { ...this.data.customVisits[idx], ...visit, updated_at: new Date().toISOString() };
    } else {
      this.data.customVisits.unshift({
        ...visit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    this.persist();
    return visit;
  }

  public deleteCustomVisit(visitKey: string): boolean {
    if (!this.data.customVisits) return false;
    const initialLen = this.data.customVisits.length;
    this.data.customVisits = this.data.customVisits.filter(
      (v) => v.visitKey !== visitKey && v.id !== visitKey
    );
    if (this.data.customVisits.length !== initialLen) {
      this.persist();
      return true;
    }
    return false;
  }

  public clearCustomVisits(): void {
    this.data.customVisits = [];
    this.persist();
  }

  // --- SalesDoc Authentication Persistence ---
  public getSalesDocAuth(): {
    token?: string;
    userId?: string;
    filialId?: string;
    baseUrl?: string;
    savedLogin?: string;
    savedPassword?: string;
    updatedAt?: string;
    lastLoginAt?: string;
    lastTokenRefreshAt?: string;
  } | undefined {
    return this.data.salesDocAuth;
  }

  public saveSalesDocAuth(auth: {
    token?: string;
    userId?: string;
    filialId?: string;
    baseUrl?: string;
    savedLogin?: string;
    savedPassword?: string;
    lastLoginAt?: string;
    lastTokenRefreshAt?: string;
  }): void {
    this.data.salesDocAuth = {
      ...(this.data.salesDocAuth || {}),
      ...auth,
      updatedAt: new Date().toISOString()
    };
    this.persist();
  }

  public clearSalesDocAuth(): void {
    this.data.salesDocAuth = undefined;
    this.persist();
  }

  // --- Photo Flags (Covered Camera, Distant Photo) ---
  public getPhotoFlags(): Record<string, {
    is_covered_camera?: boolean;
    is_distant_photo?: boolean;
    reason?: string;
    updatedAt: string;
  }> {
    return this.data.photoFlags || {};
  }

  public togglePhotoFlag(
    photoIdOrUrl: string,
    flag: 'covered_camera' | 'distant_photo',
    reason?: string
  ): { is_covered_camera?: boolean; is_distant_photo?: boolean; reason?: string; updatedAt: string } {
    if (!this.data.photoFlags) {
      this.data.photoFlags = {};
    }
    const current = this.data.photoFlags[photoIdOrUrl] || { updatedAt: new Date().toISOString() };
    if (flag === 'covered_camera') {
      const newVal = !current.is_covered_camera;
      this.data.photoFlags[photoIdOrUrl] = {
        ...current,
        is_covered_camera: newVal,
        reason: newVal ? (reason || "Kamerani yopib olingan rasm (tekshiruvchi belgiladi)") : undefined,
        updatedAt: new Date().toISOString()
      };
    } else if (flag === 'distant_photo') {
      const newVal = !current.is_distant_photo;
      this.data.photoFlags[photoIdOrUrl] = {
        ...current,
        is_distant_photo: newVal,
        reason: newVal ? (reason || "Uzoqdan olingan rasm") : undefined,
        updatedAt: new Date().toISOString()
      };
    }
    this.persist();
    return this.data.photoFlags[photoIdOrUrl];
  }

  // --- AI Photo Vision Analyses Cache ---
  public getPhotoAiAnalyses(): Record<string, PhotoAiAnalysisRecord> {
    return this.data.photoAiAnalyses || {};
  }

  public getPhotoAiAnalysis(keyOrUrl: string): PhotoAiAnalysisRecord | undefined {
    if (!keyOrUrl || !this.data.photoAiAnalyses) return undefined;
    return this.data.photoAiAnalyses[keyOrUrl];
  }

  public savePhotoAiAnalysis(keys: string[], record: PhotoAiAnalysisRecord): PhotoAiAnalysisRecord {
    if (!this.data.photoAiAnalyses) {
      this.data.photoAiAnalyses = {};
    }
    for (const k of keys) {
      if (k && k.trim()) {
        this.data.photoAiAnalyses[k.trim()] = record;
      }
    }
    this.persist();
    return record;
  }

  public deletePhotoAiAnalysis(keys: string[]): void {
    if (!this.data.photoAiAnalyses) return;
    let changed = false;
    for (const k of keys) {
      if (k && this.data.photoAiAnalyses[k.trim()]) {
        delete this.data.photoAiAnalyses[k.trim()];
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
  }

  // --- Background Monitor Status ---
  public getMonitorStatus(): {
    isRunning: boolean;
    intervalSeconds: number;
    autoAiAudit: boolean;
    lastRunAt?: string;
    totalRuns: number;
    lastResults?: any;
  } {
    const ms = this.data.monitorStatus;
    return {
      isRunning: ms?.isRunning ?? false,
      intervalSeconds: ms?.intervalSeconds ?? 60,
      autoAiAudit: ms?.autoAiAudit ?? true,
      lastRunAt: ms?.lastRunAt,
      totalRuns: ms?.totalRuns ?? 0,
      lastResults: ms?.lastResults
    };
  }

  public updateMonitorStatus(patch: {
    isRunning?: boolean;
    intervalSeconds?: number;
    autoAiAudit?: boolean;
    lastRunAt?: string;
    totalRunsIncrement?: boolean;
    lastResults?: any;
  }): {
    isRunning: boolean;
    intervalSeconds: number;
    autoAiAudit: boolean;
    lastRunAt?: string;
    totalRuns: number;
    lastResults?: any;
  } {
    if (!this.data.monitorStatus) {
      this.data.monitorStatus = {
        isRunning: false,
        intervalSeconds: 60,
        autoAiAudit: true,
        totalRuns: 0
      };
    }
    if (patch.isRunning !== undefined) this.data.monitorStatus.isRunning = patch.isRunning;
    if (patch.intervalSeconds !== undefined) this.data.monitorStatus.intervalSeconds = patch.intervalSeconds;
    if (patch.autoAiAudit !== undefined) this.data.monitorStatus.autoAiAudit = patch.autoAiAudit;
    if (patch.lastRunAt !== undefined) this.data.monitorStatus.lastRunAt = patch.lastRunAt;
    if (patch.totalRunsIncrement) this.data.monitorStatus.totalRuns = (this.data.monitorStatus.totalRuns || 0) + 1;
    if (patch.lastResults !== undefined) this.data.monitorStatus.lastResults = patch.lastResults;
    this.persist();
    return this.getMonitorStatus();
  }

  // --- Sync Logs & Metrics ---
  public getSyncLogs(limit: number = 50): SyncLogEntry[] {
    return this.data.syncLogs.slice(0, limit);
  }

  public addSyncLog(log: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry {
    const entry: SyncLogEntry = {
      ...log,
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    };
    this.data.syncLogs.unshift(entry);
    if (this.data.syncLogs.length > 200) {
      this.data.syncLogs = this.data.syncLogs.slice(0, 200);
    }

    // Update metrics
    this.data.metrics.totalRequests += 1;
    if (log.status === 'success') {
      this.data.metrics.successfulRequests += 1;
    } else {
      this.data.metrics.failedRequests += 1;
    }
    this.data.metrics.totalLatencyMs += log.duration_ms;
    this.data.metrics.lastSyncTime = entry.timestamp;

    this.persist();
    return entry;
  }

  public getMetrics(connectionInfo?: { isConnected: boolean; status: 'connected' | 'error' | 'not_configured'; message?: string }): SyncMetrics {
    const total = this.data.metrics.totalRequests;
    const avgLatency = total > 0 ? Math.round(this.data.metrics.totalLatencyMs / total) : 0;

    return {
      total_requests: this.data.metrics.totalRequests,
      successful_requests: this.data.metrics.successfulRequests,
      failed_requests: this.data.metrics.failedRequests,
      average_latency_ms: avgLatency,
      last_sync_time: this.data.metrics.lastSyncTime,
      products_count: this.data.products.length,
      clients_count: this.data.clients.length,
      orders_count: this.data.orders.length,
      stock_items_count: this.data.stock.length,
      payments_count: this.data.payments.length,
      is_connected: connectionInfo?.isConnected ?? false,
      connection_status: connectionInfo?.status ?? 'not_configured',
      connection_message: connectionInfo?.message
    };
  }
}
