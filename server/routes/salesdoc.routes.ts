import { Router, Request, Response } from 'express';
import { SalesDocClient } from '../client/SalesDocClient.js';
import { LocalDb } from '../storage/localDb.js';
import { SalesDocSyncService } from '../services/SalesDocSyncService.js';
import { SalesDocReferenceService } from '../services/SalesDocReferenceService.js';
import { SalesDocAgentDeviceService } from '../services/SalesDocAgentDeviceService.js';
import { SalesDocVisitMonitorService } from '../services/SalesDocVisitMonitorService.js';
import { SalesDocDailyReportService } from '../services/SalesDocDailyReportService.js';
import { SalesDocGoogleSheetsService } from '../services/SalesDocGoogleSheetsService.js';
import { GeminiAiService } from '../services/GeminiAiService.js';
import { maskSensitiveString, clearSalesDocCredentialsFromDisk } from '../config/salesdoc.config.js';

export const salesDocRouter = Router();

const client = SalesDocClient.getInstance();
const db = LocalDb.getInstance();
const syncService = SalesDocSyncService.getInstance();
const refService = new SalesDocReferenceService(client);
const agentDeviceService = SalesDocAgentDeviceService.getInstance();
const visitMonitorService = new SalesDocVisitMonitorService(client, db);
const dailyReportService = SalesDocDailyReportService.getInstance();
const googleSheetsService = SalesDocGoogleSheetsService.getInstance(client, db);
const aiService = GeminiAiService.getInstance(client, db);

// ================= Status & Connection =================

salesDocRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const config = client.getConfig();
    const hasToken = Boolean(config.token && config.token.trim() !== '');

    const metrics = db.getMetrics({
      isConnected: hasToken,
      status: hasToken ? 'connected' : 'not_configured',
      message: hasToken ? 'SalesDoc token faol va sozlangan' : 'SalesDoc tokeni yoki login-paroli kiritilmagan'
    });

    res.json({
      success: true,
      data: {
        baseUrl: config.baseUrl,
        hasToken,
        tokenMasked: maskSensitiveString(config.token),
        userId: config.userId || 'N/A',
        filialId: config.filialId || 'None',
        savedLogin: config.savedLogin || '',
        hasSavedCredentials: Boolean(config.savedLogin && config.savedPassword),
        lastLoginAt: config.lastLoginAt,
        lastTokenRefreshAt: config.lastTokenRefreshAt,
        isPersistent: true,
        dryRun: config.dryRun,
        timeoutMs: config.timeoutMs,
        metrics
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const result = await client.testConnection();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const { dryRun, filialId, timeoutMs, baseUrl, token, userId, login, password } = req.body;
    const updates: any = {};
    if (typeof dryRun === 'boolean') updates.dryRun = dryRun;
    if (typeof filialId === 'string') updates.filialId = filialId.trim();
    if (typeof timeoutMs === 'number') updates.timeoutMs = timeoutMs;
    if (typeof baseUrl === 'string' && baseUrl.trim()) updates.baseUrl = baseUrl.trim();

    // If login and password provided, perform live authentication
    if (typeof login === 'string' && login.trim() && typeof password === 'string' && password.trim()) {
      if (updates.baseUrl) {
        client.updateConfig({ baseUrl: updates.baseUrl });
      }
      const authRes = await client.loginWithCredentials(login.trim(), password.trim());
      updates.userId = authRes.userId;
      updates.token = authRes.token;
      updates.savedLogin = login.trim();
      updates.savedPassword = password.trim();
    } else {
      if (typeof token === 'string' && token.trim()) {
        const rawTok = token.trim();
        if (rawTok.includes(':') && !userId) {
          const parts = rawTok.split(':');
          updates.userId = parts[0].trim();
          updates.token = parts.slice(1).join(':').trim();
        } else {
          updates.token = rawTok;
        }
      }
      if (typeof userId === 'string' && userId.trim()) updates.userId = userId.trim();
      if (typeof login === 'string') updates.savedLogin = login.trim();
      if (typeof password === 'string') updates.savedPassword = password.trim();
    }

    client.updateConfig(updates);
    const updatedCfg = client.getConfig();

    res.json({
      success: true,
      message: 'Sozlamalar muvaffaqiyatli saqlandi va diskda mustahkamlandi',
      data: {
        baseUrl: updatedCfg.baseUrl,
        hasToken: Boolean(updatedCfg.token),
        tokenMasked: maskSensitiveString(updatedCfg.token),
        userId: updatedCfg.userId,
        filialId: updatedCfg.filialId,
        savedLogin: updatedCfg.savedLogin,
        hasSavedCredentials: Boolean(updatedCfg.savedLogin && updatedCfg.savedPassword)
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { login, password, baseUrl } = req.body;
    if (!login || !password) {
      return res.status(400).json({ success: false, error: 'Login va parol kiritilishi shart' });
    }

    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim()) {
      client.updateConfig({ baseUrl: baseUrl.trim() });
    }

    const authResult = await client.loginWithCredentials(login.trim(), password.trim());
    res.json({
      success: true,
      message: 'SalesDoc tizimiga muvaffaqiyatli ulandi va yangi token doimiy saqlandi',
      data: {
        userId: authResult.userId,
        tokenMasked: authResult.token.slice(0, 3) + '...' + authResult.token.slice(-3),
        savedLogin: login.trim(),
        hasSavedCredentials: true
      }
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/clear-auth', (req: Request, res: Response) => {
  try {
    clearSalesDocCredentialsFromDisk();
    client.updateConfig({
      token: '',
      userId: '',
      savedLogin: '',
      savedPassword: ''
    });
    res.json({ success: true, message: 'SalesDoc avtorizatsiya ma\'lumotlari tozalandi' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Synchronization =================

salesDocRouter.post('/sync/all', async (req: Request, res: Response) => {
  try {
    const result = await syncService.syncAll();
    res.json({ success: result.success, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sync/products', async (req: Request, res: Response) => {
  try {
    const result = await syncService.getProductService().syncFromSalesDoc();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sync/clients', async (req: Request, res: Response) => {
  try {
    const result = await syncService.getClientService().syncFromSalesDoc();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sync/orders', async (req: Request, res: Response) => {
  try {
    const result = await syncService.getOrderService().syncFromSalesDoc();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sync/stock', async (req: Request, res: Response) => {
  try {
    const result = await syncService.getStockService().syncStockFromSalesDoc();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sync/payments', async (req: Request, res: Response) => {
  try {
    const result = await syncService.getPaymentService().syncPaymentsFromSalesDoc();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/sync/progress', (req: Request, res: Response) => {
  res.json({ success: true, data: syncService.getProgress() });
});

salesDocRouter.get('/sync/logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  res.json({ success: true, data: db.getSyncLogs(limit) });
});

// ================= Products =================

salesDocRouter.get('/products', (req: Request, res: Response) => {
  res.json({ success: true, data: db.getProducts() });
});

salesDocRouter.post('/products', (req: Request, res: Response) => {
  try {
    const { name, price, category, barcode, unit } = req.body;
    if (!name || typeof price !== 'number') {
      return res.status(400).json({ success: false, error: 'Product name and numeric price are required' });
    }

    const newProd = db.upsertProduct({
      id: `PRD-${Date.now()}`,
      code_1c: `1C-${Date.now().toString().slice(-6)}`,
      name,
      price,
      category: category || 'General',
      barcode: barcode || '',
      unit: unit || 'dona',
      stock_quantity: 0,
      sync_status: 'pending',
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, data: newProd });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/products/:id/push', async (req: Request, res: Response) => {
  try {
    const updated = await syncService.getProductService().pushToSalesDoc(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Clients =================

salesDocRouter.get('/clients', (req: Request, res: Response) => {
  res.json({ success: true, data: db.getClients() });
});

salesDocRouter.post('/clients', (req: Request, res: Response) => {
  try {
    const { name, phone, address, inn, category } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }

    const newClient = db.upsertClient({
      id: `CLI-${Date.now()}`,
      code_1c: `1C-C${Date.now().toString().slice(-5)}`,
      name,
      phone: phone || '',
      address: address || '',
      inn: inn || '',
      balance: 0,
      category: category || 'Retail',
      sync_status: 'pending',
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, data: newClient });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/clients/:id/push', async (req: Request, res: Response) => {
  try {
    const updated = await syncService.getClientService().pushToSalesDoc(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Orders =================

salesDocRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    const { agent_id, device, fresh } = req.query;
    let orders = db.getOrders();
    if (orders.length === 0 || fresh === 'true') {
      await agentDeviceService.analyzeAgentsAndDevices(false);
      orders = db.getOrders();
    }
    if (agent_id && typeof agent_id === 'string') {
      orders = orders.filter((o) => o.agent_id === agent_id);
    }
    if (device && typeof device === 'string') {
      orders = orders.filter((o) => o.detected_device === device);
    }
    res.json({ success: true, data: orders });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/orders', (req: Request, res: Response) => {
  try {
    const { customer_id, items, comment, delivery_date } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: 'Customer ID is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Order must contain at least one item' });
    }

    const customer = db.getClientById(customer_id);
    const orderId = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const totalAmount = items.reduce((sum: number, it: any) => sum + (it.quantity * it.price), 0);

    const newOrder = db.upsertOrder({
      id: orderId,
      code_1c: `DOC-${orderId.slice(-6)}`,
      customer_id,
      customer_name: customer?.name || 'Customer',
      customer_code_1c: customer?.code_1c,
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: delivery_date || undefined,
      status: 'pending',
      total_amount: totalAmount,
      comment: comment || '',
      items: items.map((it: any) => ({
        product_id: it.product_id,
        product_name: it.product_name || 'Product',
        product_code_1c: it.product_code_1c,
        quantity: Number(it.quantity),
        price: Number(it.price),
        total: Number(it.quantity) * Number(it.price)
      })),
      sync_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, data: newOrder });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/orders/:id/push', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const updated = await syncService.getOrderService().pushToSalesDoc(req.params.id, force);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, details: err.details });
  }
});

salesDocRouter.post('/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, dateShipment } = req.body;
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Map frontend string statuses to SalesDoc numeric statuses
    const statusMap: Record<string, number> = {
      '1': 1, 'draft': 1, 'pending': 1, 'new': 1, 'noviy': 1,
      '2': 2, 'shipped': 2, 'otgrujen': 2, 'confirmed': 2, 'sent': 2,
      '3': 3, 'delivered': 3, 'dostavlen': 3,
      '4': 4, 'closed': 4, 'zakrit': 4,
      '5': 5, 'cancelled': 5, 'otmenen': 5, 'canceled': 5
    };

    const numericStatus = typeof status === 'number' ? status : (statusMap[String(status).toLowerCase()] || 2);
    const orderService = syncService.getOrderService();

    // If status is 2 (Otgrujen), calculate or use dateShipment (+1 day)
    let shipmentDate = dateShipment;
    if (numericStatus === 2 && !shipmentDate) {
      const orderDate = order.delivery_date || order.order_date || new Date().toISOString().slice(0, 10);
      shipmentDate = orderService.getNextDay(orderDate);
    }

    // Update in SalesDoc if order is already synced
    if (order.salesdoc_id || order.code_1c) {
      await orderService.setStatus([
        {
          code_1C: order.code_1c,
          SD_id: order.salesdoc_id,
          status: numericStatus,
          ...(shipmentDate ? { dateShipment: shipmentDate } : {})
        }
      ]);
    }

    // Map back to internal local status string
    const localStatusStr = numericStatus === 2 ? 'confirmed' :
                           numericStatus === 3 ? 'delivered' :
                           numericStatus === 5 ? 'cancelled' :
                           numericStatus === 4 ? 'closed' : 'pending';

    const updated = db.upsertOrder({
      ...order,
      status: localStatusStr as any,
      ...(shipmentDate ? { delivery_date: shipmentDate } : {}),
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Direct Ship (Отгрузить) single order endpoint
 * Sets status to 2 (Sent/Otgrujen) and shipment date to orderDate + 1 day
 */
salesDocRouter.post('/orders/:id/ship', async (req: Request, res: Response) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const orderService = syncService.getOrderService();
    const orderDate = order.order_date || new Date().toISOString().slice(0, 10);
    const shipmentDate = req.body.dateShipment || orderService.getNextDay(orderDate);

    if (order.salesdoc_id || order.code_1c) {
      await orderService.setStatus([
        {
          code_1C: order.code_1c,
          SD_id: order.salesdoc_id,
          status: 2,
          dateShipment: shipmentDate
        }
      ]);
    }

    const updated = db.upsertOrder({
      ...order,
      status: 'confirmed',
      delivery_date: shipmentDate,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, data: updated, shipmentDate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/orders/:id/cancel', async (req: Request, res: Response) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (order.salesdoc_id || order.code_1c) {
      await syncService.getOrderService().setDeletedOrder([
        {
          code_1C: order.code_1c,
          SD_id: order.salesdoc_id
        }
      ]);
    }

    const updated = db.upsertOrder({
      ...order,
      status: 'cancelled',
      sync_status: 'cancelled'
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Preview old pending orders before cutoff date
 */
salesDocRouter.get('/orders/batch-ship-preview', async (req: Request, res: Response) => {
  try {
    const cutoffDate = (req.query.cutoffDate as string) || undefined;
    const preview = await syncService.getOrderService().previewOldOrders(cutoffDate);
    res.json({ success: true, data: preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Batch ship old pending orders with shipment date set to +1 day
 * Preserves today's orders untouched.
 */
salesDocRouter.post('/orders/batch-ship-old', async (req: Request, res: Response) => {
  try {
    const { cutoffDate, maxOrders, batchSize, dryRun, mode } = req.body;
    const result = await syncService.getOrderService().batchShipOldOrders({
      cutoffDate,
      maxOrders: typeof maxOrders === 'number' ? maxOrders : 1000,
      batchSize: typeof batchSize === 'number' ? batchSize : 50,
      dryRun: Boolean(dryRun),
      mode: mode || 'old_only'
    });

    // Update matching local orders in DB as well
    if (result.sampleUpdated && result.sampleUpdated.length > 0) {
      const allLocalOrders = db.getOrders();
      const updatedMap = new Map(result.sampleUpdated.map((u) => [u.id, u]));
      for (const ord of allLocalOrders) {
        const match = updatedMap.get(ord.salesdoc_id || '') || updatedMap.get(ord.code_1c || '') || updatedMap.get(ord.id);
        if (match) {
          db.upsertOrder({
            ...ord,
            status: 'confirmed',
            delivery_date: match.dateShipment,
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get category d0_12 (SM-Причисленя Дукон) reconciliation audit data
 */
salesDocRouter.get('/reconcile-cat12', async (req: Request, res: Response) => {
  try {
    const data = await syncService.getPaymentService().getCat12Reconciliation();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Execute cash payments (НАКД - d0_5) for category d0_12 (SM-Причисленя Дукон)
 */
salesDocRouter.post('/reconcile-cat12/execute', async (req: Request, res: Response) => {
  try {
    const { mode, clientIds, dryRun } = req.body;
    const result = await syncService.getPaymentService().executeCat12ReconciliationPayments({
      mode: mode || 'shipped_orders_sum',
      clientIds,
      dryRun: Boolean(dryRun)
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Stock & Warehouses =================

salesDocRouter.get('/stock', (req: Request, res: Response) => {
  res.json({ success: true, data: db.getStock() });
});

salesDocRouter.get('/warehouses', (req: Request, res: Response) => {
  res.json({ success: true, data: db.getWarehouses() });
});

// ================= Payments =================

salesDocRouter.get('/payments', (req: Request, res: Response) => {
  res.json({ success: true, data: db.getPayments() });
});

salesDocRouter.post('/payments', (req: Request, res: Response) => {
  try {
    const { customer_id, amount, payment_type, order_id } = req.body;
    if (!customer_id || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Customer and positive amount are required' });
    }

    const customer = db.getClientById(customer_id);
    const newPayment = db.upsertPayment({
      id: `PAY-${Date.now()}`,
      code_1c: `1C-P${Date.now().toString().slice(-6)}`,
      order_id,
      customer_id,
      customer_name: customer?.name || 'Customer',
      amount,
      payment_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      payment_type: payment_type || '000000001',
      sync_status: 'pending',
      created_at: new Date().toISOString()
    });

    res.json({ success: true, data: newPayment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/payments/:id/push', async (req: Request, res: Response) => {
  try {
    const updated = await syncService.getPaymentService().pushPaymentToSalesDoc(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= References =================

salesDocRouter.get('/references/filials', async (req: Request, res: Response) => {
  try {
    const result = await refService.getFilials();
    res.json({ success: true, data: result.result?.filial || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/references/agents', async (req: Request, res: Response) => {
  try {
    const result = await refService.getAgents();
    res.json({ success: true, data: result.result?.agent || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Agent & Device Analysis =================

salesDocRouter.get('/agents/device-analysis', async (req: Request, res: Response) => {
  try {
    const force = req.query.refresh === 'true';
    const analysis = await agentDeviceService.analyzeAgentsAndDevices(force);
    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/agents/device-alias', async (req: Request, res: Response) => {
  try {
    const { agentId, deviceKey, alias } = req.body;
    if (!agentId || !deviceKey) {
      return res.status(400).json({ success: false, error: 'agentId and deviceKey are required' });
    }
    const updatedAliases = agentDeviceService.saveDeviceAlias(agentId, deviceKey, alias || '');
    const fresh = await agentDeviceService.analyzeAgentsAndDevices(true);
    res.json({ success: true, data: { aliases: updatedAliases, analysis: fresh } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Agent Management & Teams (1-Komanda / 2-Komanda) =================

salesDocRouter.get('/agents/management', async (req: Request, res: Response) => {
  try {
    const rawAgentsRes: any = await refService.getAgents();
    const rawAgents: any[] = rawAgentsRes?.result?.agent || (Array.isArray(rawAgentsRes) ? rawAgentsRes : []);
    const teamConfigs: Record<string, any> = db.getAgentTeamConfigs();
    const telegramConfig = db.getTelegramConfig();

    // Today's report summary and visit monitoring violations (best-effort)
    const [dailySummary, visitAnalysis] = await Promise.all([
      dailyReportService.generateDailyReport().catch((e: any) => {
        console.warn('Could not fetch daily stats for agent management:', e.message);
        return null;
      }),
      visitMonitorService.analyzeVisits().catch((e: any) => {
        console.warn('Could not fetch visit violations for agent management:', e.message);
        return null;
      })
    ]);

    // Lightweight device summary from cached orders
    const cachedOrders = db.getOrders();
    const cachedDeviceByAgent = new Map<string, { totalOrders: number; hasDev2: boolean }>();
    for (const ord of cachedOrders) {
      if (!ord.agent_id) continue;
      const cur = cachedDeviceByAgent.get(ord.agent_id) || { totalOrders: 0, hasDev2: false };
      cur.totalOrders += 1;
      if (ord.detected_device === 'dev_2') cur.hasDev2 = true;
      cachedDeviceByAgent.set(ord.agent_id, cur);
    }

    const agentsList = rawAgents.map((ag: any, index: number) => {
      const agentId = ag.SD_id || ag.CS_id || ag.id || (ag.name ? String(ag.name).replace(/\s+/g, '_') : `agent_${index + 1}`);
      const cfg: any = teamConfigs[agentId] || teamConfigs[ag.id] || {
        agentId,
        agentName: ag.name || agentId,
        team1ChatId: '',
        team2ChatId: '',
        isCombinedWorker: false,
        teamMode: 'dual'
      };
      const dayReport = dailySummary?.reports?.find((r: any) => r.agentId === agentId || r.agentId === ag.id);
      const agentVisitItems = (visitAnalysis?.items || []).filter(
        (it: any) => it.agent_id === agentId || it.agent_id === ag.id
      );
      const todayViolationsCount = agentVisitItems.filter((it: any) => it.should_alert).length;
      const todayFakePolkaCount = agentVisitItems.filter((it: any) => it.status === 'violation_fake_polka').length;
      const todayCoveredCameraCount = agentVisitItems.filter((it: any) => it.status === 'violation_covered_camera').length;
      const devStats = cachedDeviceByAgent.get(agentId) || cachedDeviceByAgent.get(ag.id);

      const isActive = ag.active === undefined
        ? true
        : ag.active === true || ag.active === 'Y' || ag.active === 1 || ag.active === '1' || ag.active === 'true';

      return {
        id: agentId,
        name: ag.name || agentId,
        login: ag.user?.[0]?.login || ag.login || '',
        phone: ag.phone || ag.tel || '',
        code1c: ag.code_1C ? String(ag.code_1C) : '',
        active: isActive,
        teamMode: cfg.teamMode || (cfg.isCombinedWorker ? 'single' : 'dual'),
        isCombinedWorker: cfg.teamMode === 'single' || Boolean(cfg.isCombinedWorker),
        team1ChatId: cfg.team1ChatId || '',
        team1TopicId: cfg.team1TopicId || '',
        team2ChatId: cfg.team2ChatId || '',
        team2TopicId: cfg.team2TopicId || '',
        notes: cfg.notes || '',
        todayViolationsCount,
        todayFakePolkaCount,
        todayCoveredCameraCount,
        deviceSummary: devStats
          ? {
              isDualDevice: devStats.hasDev2,
              collisionsCount: 0,
              totalOrders: devStats.totalOrders
            }
          : null,
        todayStats: dayReport ? {
          worked: dayReport.worked,
          okbTotal: dayReport.okbTotal,
          visitedCount: dayReport.visitedCount,
          team1Sales: dayReport.team1?.totalSalesSum || 0,
          team2Sales: dayReport.team2?.totalSalesSum || 0,
          totalSales: (dayReport.team1?.totalSalesSum || 0) + (dayReport.team2?.totalSalesSum || 0),
          team1Returns: dayReport.team1?.totalReturnsSum || 0,
          team2Returns: dayReport.team2?.totalReturnsSum || 0,
          totalReturns: (dayReport.team1?.totalReturnsSum || 0) + (dayReport.team2?.totalReturnsSum || 0),
          akb: (dayReport.combined?.akbCount) || dayReport.team1?.akbCount || 0
        } : null
      };
    });

    res.json({
      success: true,
      data: {
        agents: agentsList,
        telegramConfig: {
          botTokenConfigured: Boolean(telegramConfig.botToken),
          defaultChatId: telegramConfig.defaultChatId,
          autoSendAlerts: telegramConfig.autoSendAlerts
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/agents/set-active', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { agentId, active, name, code_1C } = req.body || {};
    if (typeof agentId !== 'string' || !agentId.trim()) {
      return res.status(400).json({ success: false, error: "agentId matn ko'rinishida kiritilishi shart" });
    }
    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'active maydoni boolean (true/false) bo\'lishi shart' });
    }

    const result = await refService.setAgentActiveStatus(agentId.trim(), active, {
      name: typeof name === 'string' ? name.trim() : undefined,
      code_1C: typeof code_1C === 'string' ? code_1C.trim() : undefined
    });

    const dryRun = client.getConfig().dryRun;
    db.addSyncLog({
      method: 'setAgent',
      direction: 'outbound',
      entity: 'reference',
      records_processed: 1,
      records_failed: 0,
      status: 'success',
      duration_ms: Date.now() - start,
      dry_run: dryRun
    });

    res.json({ success: true, data: result, dryRun });
  } catch (err: any) {
    db.addSyncLog({
      method: 'setAgent',
      direction: 'outbound',
      entity: 'reference',
      records_processed: 0,
      records_failed: 1,
      status: 'failed',
      duration_ms: Date.now() - start,
      error_message: err.message
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/agents/set-mode', async (req: Request, res: Response) => {
  try {
    const { agentId, teamMode } = req.body;
    if (!agentId || !teamMode || !['single', 'dual'].includes(teamMode)) {
      return res.status(400).json({ success: false, error: "agentId va to'g'ri teamMode ('single' yoki 'dual') kiritilishi shart" });
    }
    const updated = db.setAgentTeamMode(agentId, teamMode);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/agents/set-all-modes', async (req: Request, res: Response) => {
  try {
    const { teamMode } = req.body;
    if (!teamMode || !['single', 'dual'].includes(teamMode)) {
      return res.status(400).json({ success: false, error: "To'g'ri teamMode ('single' yoki 'dual') kiritilishi shart" });
    }
    const updated = db.setAllAgentsTeamMode(teamMode);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/agents/save-config', async (req: Request, res: Response) => {
  try {
    const targetAgentId = req.body.agentId || req.body.id;
    if (!targetAgentId) {
      return res.status(400).json({ success: false, error: 'agentId yoki id kiritilishi shart' });
    }
    const agentName = req.body.agentName || req.body.name;
    const { teamMode, isCombinedWorker, team1ChatId, team2ChatId, team1TopicId, team2TopicId, notes } = req.body;
    const all: Record<string, any> = db.getAgentTeamConfigs();
    const current: any = all[targetAgentId] || { agentId: targetAgentId, agentName: agentName || `Agent ${targetAgentId}`, team1ChatId: '', team2ChatId: '' };

    let mode: 'single' | 'dual' = 'dual';
    if (teamMode === 'single' || isCombinedWorker === true) {
      mode = 'single';
    } else if (teamMode === 'dual' || isCombinedWorker === false) {
      mode = 'dual';
    } else {
      mode = current.teamMode || (current.isCombinedWorker ? 'single' : 'dual');
    }

    const updatedMap = db.saveAgentTeamConfigs({
      [targetAgentId]: {
        ...current,
        agentId: targetAgentId,
        agentName: agentName || current.agentName || `Agent ${targetAgentId}`,
        teamMode: mode,
        isCombinedWorker: mode === 'single',
        team1ChatId: team1ChatId !== undefined ? team1ChatId : (current.team1ChatId || ''),
        team2ChatId: team2ChatId !== undefined ? team2ChatId : (current.team2ChatId || ''),
        team1TopicId: team1TopicId !== undefined ? team1TopicId : (current.team1TopicId || ''),
        team2TopicId: team2TopicId !== undefined ? team2TopicId : (current.team2TopicId || ''),
        notes: notes !== undefined ? notes : (current.notes || '')
      }
    });

    res.json({ success: true, data: updatedMap });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/monitor/trigger-sync-and-alert', async (req: Request, res: Response) => {
  try {
    const cycleResult = await visitMonitorService.runAutoMonitorCycle();
    const analysis = await visitMonitorService.analyzeVisits();

    res.json({
      success: true,
      data: {
        cycleResult,
        summary: analysis.summary,
        violations: analysis.items.filter((i) => i.should_alert),
        recentVisits: analysis.items.slice(0, 15)
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/references/territories', async (req: Request, res: Response) => {
  try {
    const result = await refService.getTerritories();
    res.json({ success: true, data: result.result?.territory || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Visit & Photo Monitoring =================

salesDocRouter.get('/visits/monitoring', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, agentId, limit } = req.query;
    const analysis = await visitMonitorService.analyzeVisits({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      agentId: agentId as string,
      limit: limit ? parseInt(limit as string, 10) : undefined
    });

    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/visits/send-telegram', async (req: Request, res: Response) => {
  try {
    const { visitKey, customChatId, item } = req.body;
    if (!visitKey) {
      return res.status(400).json({ success: false, error: 'visitKey is required' });
    }

    const result = await visitMonitorService.sendVisitToTelegram(visitKey, {
      customChatId,
      item
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/visits/auto-send-violations', async (req: Request, res: Response) => {
  try {
    const result = await visitMonitorService.autoSendViolations();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Record an incoming visit from an agent device, mobile app, or webhook
 */
salesDocRouter.post('/visits/incoming', async (req: Request, res: Response) => {
  try {
    const result = await visitMonitorService.recordIncomingVisit(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get background monitoring status
 */
salesDocRouter.get('/visits/monitor-status', (req: Request, res: Response) => {
  try {
    const status = db.getMonitorStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Toggle background monitoring on/off or change frequency
 */
salesDocRouter.post('/visits/monitor-toggle', (req: Request, res: Response) => {
  try {
    const { isRunning, intervalSeconds, autoAiAudit } = req.body || {};
    if (typeof autoAiAudit === 'boolean') {
      db.updateMonitorStatus({ autoAiAudit });
    }
    if (typeof isRunning === 'boolean') {
      if (isRunning) {
        visitMonitorService.startBackgroundMonitoring(intervalSeconds || 60);
      } else {
        visitMonitorService.stopBackgroundMonitoring();
      }
    }
    const status = db.getMonitorStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Force run an immediate scan and auto-send cycle
 */
salesDocRouter.post('/visits/scan-now', async (req: Request, res: Response) => {
  try {
    const result = await visitMonitorService.runAutoMonitorCycle();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Clear custom visits
 */
salesDocRouter.post('/visits/clear-custom', (req: Request, res: Response) => {
  try {
    visitMonitorService.clearCustomVisits();
    res.json({ success: true, message: 'Custom tashriflar tozalandi' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Import SalesDoc "Отчет по визитам" & "GPS 2" report (copied from Google Sheets, Excel or web table)
 */
salesDocRouter.post('/visits/import', async (req: Request, res: Response) => {
  try {
    const payload = req.body.data || req.body.text || req.body.rows || req.body;
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Import ma\'lumotlari (matn yoki jadval qatorlari) kiritilmadi' });
    }
    const result = await visitMonitorService.importSalesDocReport(payload);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Delete a specific custom visit
 */
salesDocRouter.delete('/visits/custom/:key', (req: Request, res: Response) => {
  try {
    const deleted = visitMonitorService.deleteCustomVisit(req.params.key);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Toggle photo status flags: covered camera or distant photo
 */
salesDocRouter.post('/visits/toggle-photo-flag', (req: Request, res: Response) => {
  try {
    const { photoIdOrUrl, flag, reason } = req.body;
    if (!photoIdOrUrl || !flag) {
      return res.status(400).json({ success: false, error: 'photoIdOrUrl va flag talab qilinadi' });
    }
    const updated = db.togglePhotoFlag(photoIdOrUrl, flag, reason);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/visits/photo-flags', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: db.getPhotoFlags() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
salesDocRouter.delete('/visits/:visitKey', (req: Request, res: Response) => {
  try {
    const deleted = visitMonitorService.deleteCustomVisit(req.params.visitKey);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/telegram/config', (req: Request, res: Response) => {
  try {
    const config = db.getTelegramConfig();
    res.json({
      success: true,
      data: {
        ...config,
        botTokenMasked: config.botToken ? `${config.botToken.substring(0, 7)}...${config.botToken.slice(-5)}` : ''
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/telegram/config', (req: Request, res: Response) => {
  try {
    const { botToken, defaultChatId, agentChatIds, autoSendAlerts } = req.body;
    const updated = db.updateTelegramConfig({
      botToken,
      defaultChatId,
      agentChatIds,
      autoSendAlerts
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/telegram/test', async (req: Request, res: Response) => {
  try {
    const { botToken, chatId } = req.body;
    const tokenToUse = botToken || db.getTelegramConfig().botToken;
    const chatIdToUse = chatId || db.getTelegramConfig().defaultChatId;

    if (!tokenToUse) {
      return res.status(400).json({ success: false, error: 'Bot token kiritilmadi' });
    }

    const result = await visitMonitorService.testTelegram(tokenToUse, chatIdToUse);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ================= 6 Agent Profiles x 2 Teams Telegram Configuration =================

salesDocRouter.get('/telegram/teams-config', async (req: Request, res: Response) => {
  try {
    const telegramConfig = db.getTelegramConfig();
    const teamConfigs = db.getAgentTeamConfigs();
    const dailyConfig = db.getDailyReportConfig();

    res.json({
      success: true,
      data: {
        botToken: telegramConfig.botToken || '',
        defaultChatId: telegramConfig.defaultChatId || '',
        teamConfigs,
        dailyReportConfig: dailyConfig
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/telegram/teams-config', async (req: Request, res: Response) => {
  try {
    const { botToken, defaultChatId, teamConfigs, dailyReportConfig } = req.body;

    if (botToken !== undefined || defaultChatId !== undefined) {
      db.updateTelegramConfig({
        ...(botToken !== undefined ? { botToken } : {}),
        ...(defaultChatId !== undefined ? { defaultChatId } : {})
      });
    }

    if (teamConfigs) {
      db.saveAgentTeamConfigs(teamConfigs);
    }

    if (dailyReportConfig) {
      db.updateDailyReportConfig(dailyReportConfig);
    }

    res.json({
      success: true,
      data: {
        botToken: db.getTelegramConfig().botToken,
        teamConfigs: db.getAgentTeamConfigs(),
        dailyReportConfig: db.getDailyReportConfig()
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/telegram/test-team', async (req: Request, res: Response) => {
  try {
    const { agentId, agentName, teamName, chatId, topicId } = req.body;
    const botToken = req.body.botToken || db.getTelegramConfig().botToken;

    if (!botToken) {
      return res.status(400).json({ success: false, error: 'Bot Token kiritilmagan' });
    }
    if (!chatId) {
      return res.status(400).json({ success: false, error: 'Telegram Chat ID kiritilmagan' });
    }

    const testMsg = [
      `🔔 <b>TELEGRAM GURUH TEST XABARI</b>`,
      `👤 <b>Profil:</b> ${agentName || agentId}`,
      `👥 <b>Komanda:</b> <b>${teamName || 'Komanda'}</b>`,
      `✅ <i>Guruh muvaffaqiyatli ulandi! Endi tashrif nazorati xabarlari va har kuni 22:30 dagi kunlik hisobot (OKB, AKB, savdo summasi, kirmagan do'konlar) aynan shu guruhga yuboriladi.</i>`
    ].join('\n');

    const resTelegram = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId ? Number(topicId) : undefined,
        text: testMsg,
        parse_mode: 'HTML'
      })
    });

    const j = await resTelegram.json();
    if (!j.ok) {
      return res.status(400).json({ success: false, error: j.description || 'Telegram API xatosi' });
    }

    res.json({ success: true, messageId: j.result?.message_id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/telegram/detect-chats', async (req: Request, res: Response) => {
  try {
    const botToken = req.body.botToken || db.getTelegramConfig().botToken;
    if (!botToken) {
      return res.status(400).json({
        success: false,
        error: "Bot Token kiritilmagan. Avval @BotFather'dan olingan tokenni kiriting."
      });
    }

    // 1. Check bot info
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return res.status(400).json({
        success: false,
        error: `Bot Token noto'g'ri: ${meData.description || 'Telegram tasdiqlamadi'}`
      });
    }

    // 2. Fetch updates to find groups
    const updatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100`);
    const updatesData = await updatesRes.json();
    const chatsMap = new Map<string, { id: string; title: string; type: string; lastMessageDate?: number }>();

    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const update of updatesData.result) {
        const chat = update.message?.chat ||
                     update.edited_message?.chat ||
                     update.channel_post?.chat ||
                     update.my_chat_member?.chat ||
                     update.chat_member?.chat;
        if (chat && chat.id) {
          const chatIdStr = String(chat.id);
          const title = chat.title || chat.username || `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || 'Nomsiz Guruh';
          const type = chat.type || 'unknown';
          const msgDate = update.message?.date || update.channel_post?.date;

          chatsMap.set(chatIdStr, {
            id: chatIdStr,
            title,
            type,
            lastMessageDate: msgDate
          });
        }
      }
    }

    const chats = Array.from(chatsMap.values());

    res.json({
      success: true,
      bot: {
        id: meData.result.id,
        username: meData.result.username,
        firstName: meData.result.first_name
      },
      chats,
      totalChatsFound: chats.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= 22:30 Daily Report Engine =================

salesDocRouter.get('/daily-report/preview', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const reportData = await dailyReportService.generateDailyReport(date);
    res.json({ success: true, data: reportData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/daily-report/send', async (req: Request, res: Response) => {
  try {
    const { date, agentId, team, onlyUnvisited } = req.body;
    const result = await dailyReportService.sendDailyReports({
      date,
      targetAgentId: agentId,
      targetTeam: team,
      onlyUnvisited: onlyUnvisited === true
    });
    if (!result.success && result.error) {
      return res.status(400).json({ success: false, error: result.error, data: result });
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/daily-report/send-unvisited', async (req: Request, res: Response) => {
  try {
    const { date, agentId, team } = req.body;
    const result = await dailyReportService.sendDailyReports({
      date,
      targetAgentId: agentId,
      targetTeam: team,
      onlyUnvisited: true
    });
    if (!result.success && result.error) {
      return res.status(400).json({ success: false, error: result.error, data: result });
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/daily-report/config', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: db.getDailyReportConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/daily-report/config', async (req: Request, res: Response) => {
  try {
    const { scheduledTime, autoSendEnabled } = req.body;
    const updated = db.updateDailyReportConfig({ scheduledTime, autoSendEnabled });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Google Sheets Integration =================

salesDocRouter.get('/sheets/report', async (req: Request, res: Response) => {
  try {
    const startDate = (req.query.startDate as string) || undefined;
    const endDate = (req.query.endDate as string) || undefined;
    const forceRefresh = req.query.forceRefresh === 'true';
    const agentId = (req.query.agentId as string) || undefined;

    const report = await googleSheetsService.getSheetsReport({
      startDate,
      endDate,
      forceRefresh,
      agentId
    });

    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sheets/sync', async (req: Request, res: Response) => {
  try {
    const { date } = req.body;
    const result = await googleSheetsService.syncToGoogleSheets(date);
    res.json({ success: result.success, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * "Kelgan joyidan to'ldirib borish" (Catch-up sync):
 * Fills in missing spots (territory, returns/vozvrati, sales) for worked days,
 * and leaves unworked days completely empty/untouched.
 */
salesDocRouter.post('/sheets/catchup', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await googleSheetsService.syncCatchup({ startDate, endDate });
    res.json({ success: result.success, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/sheets/config', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: db.getGoogleSheetsConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sheets/config', async (req: Request, res: Response) => {
  try {
    const { spreadsheetId, webhookUrl, autoSyncEnabled } = req.body;
    const updated = db.updateGoogleSheetsConfig({
      spreadsheetId,
      webhookUrl,
      autoSyncEnabled
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/sheets/test-webhook', async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;
    const testRes = await googleSheetsService.testWebhook(webhookUrl);
    res.json({ success: testRes.success, data: testRes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.get('/sheets/script-snippet', async (req: Request, res: Response) => {
  try {
    const snippet = googleSheetsService.getGoogleAppsScriptSnippet();
    res.json({ success: true, data: { snippet } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Gemini AI Analyst & Vision Photo Audit =================

salesDocRouter.get('/ai/status', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: aiService.getStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/ai/analyze-photo', async (req: Request, res: Response) => {
  try {
    const { photoUrl, photoId, clientName, agentName, catName, forceRefresh } = req.body || {};
    if (!photoUrl || typeof photoUrl !== 'string' || !photoUrl.trim()) {
      return res.status(400).json({ success: false, error: 'photoUrl maydoni kiritilishi shart' });
    }
    if (!aiService.isConfigured()) {
      return res.status(503).json({ success: false, error: aiService.getStatus().message });
    }
    const analysis = await aiService.analyzeVisitPhoto({
      photoUrl: photoUrl.trim(),
      photoId,
      clientName,
      agentName,
      catName,
      forceRefresh: forceRefresh === true
    });
    res.json({ success: true, data: analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/ai/analyze-visits', async (req: Request, res: Response) => {
  try {
    if (!aiService.isConfigured()) {
      return res.status(503).json({ success: false, error: aiService.getStatus().message });
    }
    const { dateFrom, dateTo, agentId, maxPhotos, forceRefresh } = req.body || {};
    const visits = await visitMonitorService.analyzeVisits({ dateFrom, dateTo, agentId });
    const batchResult = await aiService.analyzeVisitsBatch(visits.items, {
      maxPhotos: typeof maxPhotos === 'number' ? maxPhotos : 15,
      forceRefresh: forceRefresh === true
    });
    res.json({
      success: true,
      data: {
        ...batchResult,
        totalVisitsScanned: visits.items.length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

salesDocRouter.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const rawMsg = req.body?.message ?? req.body?.question;
    const history = req.body?.history;
    if (!rawMsg || typeof rawMsg !== 'string' || !rawMsg.trim()) {
      return res.status(400).json({ success: false, error: 'Savol matni (message) kiritilishi shart' });
    }
    if (!aiService.isConfigured()) {
      return res.status(503).json({ success: false, error: aiService.getStatus().message });
    }
    const safeHistory = Array.isArray(history)
      ? history
          .filter((h: any) => (h?.role === 'user' || h?.role === 'model') && typeof h?.text === 'string')
          .map((h: any) => ({ role: h.role as 'user' | 'model', text: h.text }))
      : [];
    const reply = await aiService.askBusinessAnalyst(rawMsg.trim(), safeHistory);
    res.json({ success: true, data: reply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= Raw Method Invoker (API Explorer) =================

salesDocRouter.post('/raw-invoke', async (req: Request, res: Response) => {
  try {
    const { method, params, data, dryRun } = req.body;
    if (!method) {
      return res.status(400).json({ success: false, error: 'Field "method" is required' });
    }

    const startTime = Date.now();
    const result = await client.request(method, params, data, { dryRun });
    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      latencyMs,
      data: result
    });
  } catch (err: any) {
    res.status(err.code === 401 ? 401 : 400).json({
      success: false,
      error: err.message,
      code: err.code,
      details: err.details
    });
  }
});
