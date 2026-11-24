import { SalesDocClient } from '../client/SalesDocClient.js';
import { LocalDb } from '../storage/localDb.js';
import {
  AgentDeviceAnalysisResult,
  AgentDeviceProfile,
  DeviceCollision,
  DeviceMetrics,
  DeviceSession,
  LocalOrder,
  SalesDocAgent,
  SalesDocOrder
} from '../types/salesdoc.types.js';

export class SalesDocAgentDeviceService {
  private static instance: SalesDocAgentDeviceService | null = null;
  private client: SalesDocClient;
  private db: LocalDb;
  private lastAnalysis: AgentDeviceAnalysisResult | null = null;
  private lastAnalysisTime: number = 0;

  private constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  public static getInstance(): SalesDocAgentDeviceService {
    if (!SalesDocAgentDeviceService.instance) {
      SalesDocAgentDeviceService.instance = new SalesDocAgentDeviceService();
    }
    return SalesDocAgentDeviceService.instance;
  }

  /**
   * Run device detection analysis on all agents and their orders
   */
  public async analyzeAgentsAndDevices(forceRefresh: boolean = false): Promise<AgentDeviceAnalysisResult> {
    // Cache for 15 seconds unless forceRefresh or previous fetch had API errors
    if (
      !forceRefresh &&
      this.lastAnalysis &&
      !this.lastAnalysis.summary.usedFallback &&
      Date.now() - this.lastAnalysisTime < 15000
    ) {
      return this.lastAnalysis;
    }

    const apiErrors: string[] = [];
    let usedFallback = false;

    // 1. Fetch agents from SalesDoc (fallback to local db)
    let agentsList: SalesDocAgent[] = [];
    try {
      const agentRes = await this.client.request<{ agent: SalesDocAgent[] }>('getAgent', {});
      agentsList = agentRes.result?.agent || [];
    } catch (err: any) {
      const msg = `getAgent: ${err.message}`;
      apiErrors.push(msg);
      console.error('[SalesDocAgentDeviceService] Error fetching agents from API:', err.message);
    }

    if (agentsList.length === 0) {
      const teamConfigs = this.db.getAgentTeamConfigs();
      const fallbackList = Object.values(teamConfigs).map((c: any) => ({
        SD_id: c.agentId,
        CS_id: c.agentId,
        name: c.agentName || c.agentId,
        active: 'Y'
      }));
      if (fallbackList.length > 0) {
        agentsList = fallbackList as any[];
        usedFallback = true;
      }
    }

    // 2. Fetch recent orders across pages and active statuses (1..4) from SalesDoc
    let remoteOrders: any[] = [];
    try {
      remoteOrders = await this.client.fetchAllPages<any>(
        'getOrder',
        {
          filter: {
            agent: 'all',
            status: [1, 2, 3, 4]
          }
        },
        (result) => result?.order || [],
        1000,
        3
      );
    } catch (err: any) {
      const msg = `getOrder: ${err.message}`;
      apiErrors.push(msg);
      console.error('[SalesDocAgentDeviceService] Error fetching orders from API:', err.message);
    }

    if (remoteOrders.length === 0) {
      const dbOrders = this.db.getOrders();
      if (dbOrders && dbOrders.length > 0) {
        remoteOrders = dbOrders as any[];
        usedFallback = true;
      }
    }

    const aliases = this.db.getDeviceAliases();

    // Group orders by agent SD_id
    const ordersByAgent: Record<string, any[]> = {};
    for (const ord of remoteOrders) {
      const aId = ord.agent?.SD_id || ord.agent?.CS_id || ord.agent_id || 'UNKNOWN_AGENT';
      if (!ordersByAgent[aId]) ordersByAgent[aId] = [];
      ordersByAgent[aId].push(ord);
    }

    const agentProfiles: AgentDeviceProfile[] = [];
    let totalCollisions = 0;
    let totalRevenueSum = 0;
    let dualDeviceCount = 0;

    // Process each known agent
    for (const agent of agentsList) {
      const aId = agent.SD_id || agent.CS_id || '';
      const ords = ordersByAgent[aId] || [];
      const userLogin = agent.user?.[0]?.login;
      const userId = agent.user?.[0]?.SD_id || agent.user?.[0]?.CS_id;

      // Detect devices & sessions for this agent
      const analysis = this.partitionAgentOrders(aId, agent.name, ords, aliases);

      if (analysis.isDualDevice) {
        dualDeviceCount++;
      }
      totalCollisions += analysis.collisionsCount;
      totalRevenueSum += analysis.totalRevenue;

      analysis.userLogin = userLogin;
      analysis.userId = userId;

      agentProfiles.push(analysis);
    }

    // Also enrich and sync LocalDb orders so that every order in local DB has detected_device
    this.enrichLocalDbOrders(remoteOrders, agentProfiles);

    const result: AgentDeviceAnalysisResult = {
      agents: agentProfiles,
      summary: {
        totalAgents: agentProfiles.length,
        dualDeviceProfilesCount: dualDeviceCount,
        totalOrdersAnalyzed: remoteOrders.length,
        totalRevenue: totalRevenueSum,
        totalCollisionsDetected: totalCollisions,
        analyzedAt: new Date().toISOString(),
        ...(apiErrors.length > 0 ? { apiErrors } : {}),
        usedFallback
      }
    };

    if (apiErrors.length === 0) {
      this.lastAnalysis = result;
      this.lastAnalysisTime = Date.now();
    }
    return result;
  }

  /**
   * Partition an agent's orders into Device 1 and Device 2 based on sync sessions and temporal overlaps
   */
  private partitionAgentOrders(
    agentId: string,
    agentName: string,
    orders: any[],
    aliases: Record<string, string>
  ): AgentDeviceProfile {
    if (orders.length === 0) {
      const dev1Alias = aliases[`${agentId}_dev_1`] || '';
      const dev2Alias = aliases[`${agentId}_dev_2`] || '';
      return {
        agentId,
        agentName,
        totalOrders: 0,
        totalRevenue: 0,
        isDualDevice: false,
        collisionsCount: 0,
        dev1: {
          deviceKey: 'dev_1',
          defaultName: 'Qurilma 1 (Agent A)',
          alias: dev1Alias,
          displayName: dev1Alias || 'Qurilma 1 (Agent A)',
          ordersCount: 0,
          totalSum: 0,
          averageCheck: 0,
          uniqueClientsCount: 0,
          clients: [],
          sessionsCount: 0
        },
        dev2: {
          deviceKey: 'dev_2',
          defaultName: 'Qurilma 2 (Agent B)',
          alias: dev2Alias,
          displayName: dev2Alias || 'Qurilma 2 (Agent B)',
          ordersCount: 0,
          totalSum: 0,
          averageCheck: 0,
          uniqueClientsCount: 0,
          clients: [],
          sessionsCount: 0
        },
        collisions: [],
        sessions: []
      };
    }

    // 1. Sort orders by orderCreated (sync timestamp)
    const sorted = [...orders].sort((a, b) => {
      const tA = new Date(a.orderCreated || a.dateCreate || 0).getTime();
      const tB = new Date(b.orderCreated || b.dateCreate || 0).getTime();
      return tA - tB;
    });

    // 2. Cluster into sync sessions (burst within 60 seconds)
    const rawSessions: any[][] = [];
    let curSession: any[] = [];

    for (const o of sorted) {
      if (curSession.length === 0) {
        curSession.push(o);
      } else {
        const lastO = curSession[curSession.length - 1];
        const lastSync = new Date(lastO.orderCreated || lastO.dateCreate).getTime();
        const thisSync = new Date(o.orderCreated || o.dateCreate).getTime();
        const diffMs = Math.abs(thisSync - lastSync);

        if (diffMs <= 60000) {
          curSession.push(o);
        } else {
          rawSessions.push(curSession);
          curSession = [o];
        }
      }
    }
    if (curSession.length > 0) rawSessions.push(curSession);

    // 3. Build structured session metadata
    const structuredSessions = rawSessions.map((sessionOrders, idx) => {
      const draftTimes = sessionOrders.map((o) => o.dateCreate || o.orderCreated || '').filter(Boolean).sort();
      const minDraft = draftTimes[0] || '1970-01-01 00:00:00';
      const maxDraft = draftTimes[draftTimes.length - 1] || minDraft;
      const syncTime = sessionOrders[0].orderCreated || minDraft;
      const totalSum = sessionOrders.reduce((sum, o) => sum + (o.totalSummaAfterDiscount || o.totalSumma || 0), 0);
      const clients = [...new Set(sessionOrders.map((o) => o.client?.clientName || o.client?.code_1C || 'Nomaʼlum Doʻkon'))];

      return {
        sessionId: `SES-${idx + 1}`,
        syncTime,
        ordersCount: sessionOrders.length,
        totalSum,
        minDraft,
        maxDraft,
        clients,
        orders: sessionOrders.map((o) => ({
          id: o.SD_id || o.CS_id,
          clientName: o.client?.clientName || o.client?.code_1C || 'Doʻkon',
          dateCreate: o.dateCreate || o.orderCreated,
          orderCreated: o.orderCreated || o.dateCreate,
          totalSum: o.totalSummaAfterDiscount || o.totalSumma || 0,
          status: o.status || 1,
          itemsCount: o.orderProducts?.length || 0
        })),
        rawOrders: sessionOrders,
        deviceKey: 'dev_1' as 'dev_1' | 'dev_2'
      };
    });

    // 4. Partition sessions into Dev 1 and Dev 2 by temporal overlaps & draft chronologies
    const dev1Sessions: typeof structuredSessions = [];
    const dev2Sessions: typeof structuredSessions = [];
    const collisions: DeviceCollision[] = [];

    for (const session of structuredSessions) {
      let overlapsDev1 = false;
      let collidesWithSession: typeof structuredSessions[0] | null = null;

      for (const d1 of dev1Sessions) {
        // Two sessions overlap if s.minDraft <= d1.maxDraft and s.maxDraft >= d1.minDraft
        const overlap = session.minDraft <= d1.maxDraft && session.maxDraft >= d1.minDraft;
        if (overlap) {
          overlapsDev1 = true;
          collidesWithSession = d1;
          break;
        }
      }

      if (!overlapsDev1) {
        session.deviceKey = 'dev_1';
        dev1Sessions.push(session);
      } else {
        session.deviceKey = 'dev_2';
        dev2Sessions.push(session);

        if (collidesWithSession) {
          collisions.push({
            id: `COL-${collisions.length + 1}`,
            sessionA: collidesWithSession.sessionId,
            sessionB: session.sessionId,
            deviceA: 'Qurilma 1 (Agent A)',
            deviceB: 'Qurilma 2 (Agent B)',
            rangeA: `${collidesWithSession.minDraft.slice(11)} — ${collidesWithSession.maxDraft.slice(11)}`,
            rangeB: `${session.minDraft.slice(11)} — ${session.maxDraft.slice(11)}`,
            clientsA: collidesWithSession.clients,
            clientsB: session.clients,
            description: `1-Qurilma [${collidesWithSession.clients.slice(0, 2).join(', ')}] doʻkonida buyurtma olayotganda, 2-Qurilma bir vaqtda [${session.clients.slice(0, 2).join(', ')}] doʻkonida faol boʻlgan.`
          });
        }
      }
    }

    // 5. Aggregate metrics for each device
    const dev1Alias = aliases[`${agentId}_dev_1`] || '';
    const dev2Alias = aliases[`${agentId}_dev_2`] || '';

    const dev1Orders = dev1Sessions.flatMap((s) => s.orders);
    const dev2Orders = dev2Sessions.flatMap((s) => s.orders);

    const dev1Sum = dev1Orders.reduce((sum, o) => sum + o.totalSum, 0);
    const dev2Sum = dev2Orders.reduce((sum, o) => sum + o.totalSum, 0);

    const dev1Clients = [...new Set(dev1Orders.map((o) => o.clientName))];
    const dev2Clients = [...new Set(dev2Orders.map((o) => o.clientName))];

    const dev1Metrics: DeviceMetrics = {
      deviceKey: 'dev_1',
      defaultName: 'Qurilma 1 (Agent A)',
      alias: dev1Alias,
      displayName: dev1Alias || 'Qurilma 1 (Agent A)',
      ordersCount: dev1Orders.length,
      totalSum: dev1Sum,
      averageCheck: dev1Orders.length > 0 ? Math.round(dev1Sum / dev1Orders.length) : 0,
      uniqueClientsCount: dev1Clients.length,
      clients: dev1Clients,
      sessionsCount: dev1Sessions.length,
      firstActive: dev1Orders[0]?.dateCreate,
      lastActive: dev1Orders[dev1Orders.length - 1]?.dateCreate
    };

    const dev2Metrics: DeviceMetrics = {
      deviceKey: 'dev_2',
      defaultName: 'Qurilma 2 (Agent B)',
      alias: dev2Alias,
      displayName: dev2Alias || 'Qurilma 2 (Agent B)',
      ordersCount: dev2Orders.length,
      totalSum: dev2Sum,
      averageCheck: dev2Orders.length > 0 ? Math.round(dev2Sum / dev2Orders.length) : 0,
      uniqueClientsCount: dev2Clients.length,
      clients: dev2Clients,
      sessionsCount: dev2Sessions.length,
      firstActive: dev2Orders[0]?.dateCreate,
      lastActive: dev2Orders[dev2Orders.length - 1]?.dateCreate
    };

    const finalSessions: DeviceSession[] = structuredSessions.map((s) => ({
      sessionId: s.sessionId,
      syncTime: s.syncTime,
      deviceKey: s.deviceKey,
      ordersCount: s.ordersCount,
      totalSum: s.totalSum,
      minDraft: s.minDraft,
      maxDraft: s.maxDraft,
      clients: s.clients,
      orders: s.orders
    }));

    const isDual = dev2Orders.length > 0 || collisions.length > 0;

    return {
      agentId,
      agentName,
      totalOrders: orders.length,
      totalRevenue: dev1Sum + dev2Sum,
      isDualDevice: isDual,
      collisionsCount: collisions.length,
      dev1: dev1Metrics,
      dev2: dev2Metrics,
      collisions,
      sessions: finalSessions
    };
  }

  /**
   * Save an alias (human name) for a device
   */
  public saveDeviceAlias(agentId: string, deviceKey: 'dev_1' | 'dev_2', alias: string): Record<string, string> {
    const key = `${agentId}_${deviceKey}`;
    return this.db.setDeviceAlias(key, alias);
  }

  /**
   * Enrich orders in LocalDb with detected device metadata
   */
  private enrichLocalDbOrders(remoteOrders: any[], profiles: AgentDeviceProfile[]): void {
    // Build quick lookup for orderId -> { deviceKey, deviceName, sessionId, syncTime }
    const orderDeviceMap: Record<
      string,
      {
        agentId: string;
        agentName: string;
        deviceKey: 'dev_1' | 'dev_2';
        deviceName: string;
        sessionId: string;
        syncTime: string;
      }
    > = {};

    for (const prof of profiles) {
      for (const ses of prof.sessions) {
        const devName = ses.deviceKey === 'dev_1' ? prof.dev1.displayName : prof.dev2.displayName;
        for (const ord of ses.orders) {
          orderDeviceMap[ord.id] = {
            agentId: prof.agentId,
            agentName: prof.agentName,
            deviceKey: ses.deviceKey,
            deviceName: devName,
            sessionId: ses.sessionId,
            syncTime: ses.syncTime
          };
        }
      }
    }

    // Enrich existing orders in LocalDb
    const localOrders = this.db.getOrders();
    for (const local of localOrders) {
      const matchId = local.salesdoc_id || local.id;
      const match = orderDeviceMap[matchId];
      if (match) {
        local.agent_id = match.agentId;
        local.agent_name = match.agentName;
        local.detected_device = match.deviceKey;
        local.detected_device_name = match.deviceName;
        local.session_id = match.sessionId;
        local.session_sync_time = match.syncTime;
      }
    }

    // Also import remote orders that don't exist locally yet into LocalDb in one batch write
    const existingById = new Map<string, LocalOrder>();
    for (const o of localOrders) {
      if (o.salesdoc_id) existingById.set(o.salesdoc_id, o);
      if (o.id) existingById.set(o.id, o);
    }

    const batchToUpsert: LocalOrder[] = [];
    for (const rem of remoteOrders) {
      const id = rem.SD_id || rem.CS_id;
      if (!id) continue;
      const existing = existingById.get(id);
      const match = orderDeviceMap[id];

      const rawItems = rem.orderProducts || rem.detail || [];
      const items = rawItems.map((p: any) => {
        const qty = Number(p.quantity ?? p.count ?? 0);
        const price = Number(p.price || 0);
        return {
          product_id: p.product?.SD_id || p.product?.CS_id || p.code_1C || 'unknown',
          product_name: p.product?.name || 'Mahsulot',
          product_code_1c: p.product?.code_1C,
          quantity: qty,
          price,
          total: Number(p.summa ?? p.totalSumma ?? qty * price)
        };
      });

      const dateCreate = rem.dateCreate || rem.orderCreated || new Date().toISOString();
      const orderCreated = rem.orderCreated || dateCreate;

      batchToUpsert.push({
        id: existing?.id || id,
        salesdoc_id: id,
        code_1c: rem.code_1C,
        customer_id: rem.client?.SD_id || rem.client?.CS_id || 'unknown',
        customer_name: rem.client?.clientName || rem.client?.shortName || 'Doʻkon',
        order_date: dateCreate.slice(0, 10),
        status:
          rem.status === 2
            ? 'confirmed'
            : rem.status === 3
            ? 'delivered'
            : rem.status === 4
            ? 'closed'
            : rem.status === 5
            ? 'cancelled'
            : 'pending',
        total_amount: Number(rem.totalSummaAfterDiscount || rem.totalSumma || 0),
        comment: rem.comment || '',
        items,
        agent_id: match?.agentId || rem.agent?.SD_id,
        agent_name: match?.agentName || rem.agent?.name || rem.agent_name || 'Aniqlanmagan',
        detected_device: match?.deviceKey,
        detected_device_name: match?.deviceName,
        session_id: match?.sessionId,
        session_sync_time: match?.syncTime,
        date_create: dateCreate,
        order_created: orderCreated,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        created_at: dateCreate,
        updated_at: orderCreated
      });
    }

    this.db.upsertOrdersBatch(batchToUpsert);
  }
}
