import { SalesDocClient } from '../client/SalesDocClient.js';
import { LocalDb } from '../storage/localDb.js';
import { getTashkentDayOfWeek, getTashkentTimeParts, getTashkentTodayIso } from '../utils/timezone.js';

export interface TeamCategories {
  team1: string[];
  team2: string[];
}

// Exact category names as provided by user in screenshots
export const TEAM_CATEGORIES: TeamCategories = {
  team1: [
    'TikToke (Доналик)',
    'Семичка',
    'Сладуница (РОССИЯ)',
    'Чучвара Абубакр',
    'TikToke',
    'Coffee',
    'Сырная Соломка',
    'Nutella',
    'ROLLY'
  ],
  team2: [
    'Вафли',
    'LacoooL (РОССИЯ)',
    'ANATA',
    'Ichimlik Suv',
    'Sweet Life',
    'KZ ПРОДУКТ',
    'Machos',
    'BRANDO (Акция Таварлар)',
    'M&M (Янгилик)',
    'Акция'
  ]
};

export interface AgentDailyTeamReport {
  teamName: '1-Komanda' | '2-Komanda' | 'Umumiy';
  teamKey: 'team1' | 'team2';
  chatId?: string;
  topicId?: string;
  territory: string;
  okbTotal: number;
  visitedCount: number;
  akbCount: number;
  rejectsCount: number;
  totalSalesSum: number;
  totalReturnsSum: number;
  unvisitedCount: number;
  unvisitedClients: Array<{
    id: string;
    name: string;
    address: string;
    phone: string;
    territory?: string;
  }>;
}

export interface AgentDailyReport {
  agentId: string;
  agentName: string;
  date: string;
  teamMode: 'single' | 'dual';
  isCombinedWorker: boolean; // For single team / combined mode
  worked: boolean; // True if agent visited shops, had sales or returns
  territories: string[];
  okbTotal: number;
  visitedCount: number;
  unvisitedCount: number;
  team1: AgentDailyTeamReport;
  team2: AgentDailyTeamReport;
  combined?: AgentDailyTeamReport;
}

export class SalesDocDailyReportService {
  private static instance: SalesDocDailyReportService | null = null;
  private client: SalesDocClient;
  private db: LocalDb;
  private timer: NodeJS.Timeout | null = null;

  // In-memory cache for clients and territories to ensure instant multi-day generation
  private cachedClientsMap: Map<string, any> | null = null;
  private cachedTerritoryMap: Map<string, string> | null = null;
  private cacheLastFetched: number = 0;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  public static readonly AGENT_WEEKDAY_ROUTES: Record<string, Record<number, string>> = {
    'd0_1': {
      1: 'Пойтуг, Хаккулобод',
      2: 'Учкургон центр, Учкургон бозор',
      3: 'Кайки, Кугай',
      4: 'Уйчи, Машад',
      5: 'Янгикургон, Хазратишох Баликкул',
      6: 'Чорток, Чорток бозор'
    },
    'd0_2': {
      1: 'Баликчи',
      2: 'Мингбулок центр, Есин',
      3: 'Садокат, Чодак',
      4: 'Чуст бозор, Гова',
      5: 'Косонсой, Косонсой йули',
      6: 'Поп, Санг Уйгур'
    },
    'd0_3': {
      1: 'Жийдакапа, Чужа',
      2: 'Езевон, Улугнор',
      3: 'Дамбог, Гишт куприк',
      4: 'Сарой Олчин Шаханд, Тошбулок',
      5: 'Косонсой, Косонсой йули',
      6: 'Туракургон, Есин'
    },
    'd0_4': {
      1: 'Янги Хаёт Орзу, Юксалиш',
      2: 'Самарканд Совхоз, Оромгох',
      3: 'Машад, Парцез',
      4: 'Лола, Кумкургон',
      5: 'Ровустон, Телмон куча',
      6: 'Сардоба бозор'
    },
    'd0_5': {
      1: 'Заркент, Янгиобод',
      2: 'Чуст йули',
      3: 'Гузал, Чорток йули',
      4: 'Тошбулок, Хонобод',
      5: 'Кизил куприк, Ровут',
      6: 'Зарбдор, Нуробод'
    },
    'd0_6': {
      1: 'Хаккулобод, Тошкин Туда',
      2: 'Улугнор, Буз',
      3: 'Чодак, Чуст бозор',
      4: 'Буз, Баликчи',
      5: 'Туракургон, Косонсой йули',
      6: 'Поп'
    }
  };

  private constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
    this.startScheduler();
  }

  public static getInstance(client?: SalesDocClient, db?: LocalDb): SalesDocDailyReportService {
    if (!SalesDocDailyReportService.instance) {
      SalesDocDailyReportService.instance = new SalesDocDailyReportService(client, db);
    }
    return SalesDocDailyReportService.instance;
  }

  /**
   * Check which team a product belongs to: 'team1', 'team2', or 'unknown'
   */
  /**
   * Classify whether a product belongs to 1-Komanda (Team A) or 2-Komanda (Team B).
   * 1-Komanda: TikTok kurt, Semichka, Machos (Kurt & Semichka), Chubara, Abubakr, Coffee (Barista, Expos, Top kofe), Solomka, Nutella, Gajjak
   * 2-Komanda: Confectionery, Wafers (Vafli), Sweets, Drinks (Limonariy, Mojito), Brando, Vella, Holly, Baretto, Saule, Rello, etc.
   */
  public classifyProductTeam(p: {
    id?: string;
    name?: string;
    code_1C?: string | null;
    categoryName?: string;
    categoryId?: string;
  }): 'team1' | 'team2' | 'unknown' {
    let code = (p.code_1C || '').trim().toLowerCase();
    const name = (p.name || '').toLowerCase();
    const cat = (p.categoryName || '').toLowerCase();
    const id = (p.id || '').toLowerCase();

    // If code_1C is missing, check local database product reference
    if (!code && id) {
      try {
        const localProds = this.db.getProducts();
        const found = localProds.find(
          (lp) => (lp.salesdoc_id && lp.salesdoc_id.toLowerCase() === id) || (lp.id && lp.id.toLowerCase() === id)
        );
        if (found && found.code_1c) {
          code = found.code_1c.trim().toLowerCase();
        }
      } catch {
        // ignore db lookup failure
      }
    }

    // 1. Strict Team 2 brands (Machos, Vella confectionery, Wafers, Drinks, etc.)
    // Note: In SalesDoc "Итоги по заказам", Machos is NOT in Team 1. It belongs to Team 2.
    if (
      /machos|мачос|велла|vella|вафли|вафля|vafli|lacool|lacoool|anata|аната|ichimlik|напиток|напитки|suv|sweet\s*life|swet\s*pay|kz\s*вафли|kz\s*продукт|brando|брандо|m&m/i.test(name) ||
      /machos|мачос|велла|vella|вафли|lacool|lacoool|anata|аната|ichimlik|suv|sweet\s*life|kz\s*продукт|brando|m&m/i.test(cat)
    ) {
      return 'team2';
    }

    // 2. 1C ERP assignment (Команда А vs Команда Б)
    if (/команда\s*а|комманда\s*а|team\s*1|komanda\s*1|команда\s*1/i.test(code)) {
      return 'team1';
    }
    if (/команда\s*б|комманда\s*б|team\s*2|komanda\s*2|команда\s*2/i.test(code)) {
      return 'team2';
    }

    // 3. Strict Team 1 brands & categories (TikTok kurt, Semichka, Chubara, Abubakr, Sladunitsa, Coffee, Solomka, Nutella, Gajjak)
    const isTeam1 =
      /tiktoke|tiktok|тикток|семичка|семечки|курт|qurt|чучвара|абубакр|сладуница|топ\s*кофе|топ\s*coffee|бариста|barista|expos|экспос|раф|соломка|сырная|горький\s*соломка|nutella|нутелла|rolly|ролли|гажжак|магиз|писта|сыр\s*160шт/i.test(name) ||
      /tiktoke|tiktok|семичка|курт|чучвара|сладуница|соломка|nutella|rolly|сырная\s*соломка|акция/i.test(cat);

    if (isTeam1) return 'team1';

    // 4. Standalone coffee check
    if (/coffee|кофе/i.test(name) || /coffee|кофе/i.test(cat)) {
      return 'team1';
    }

    // 5. Explicit 2-Komanda brands (Confectionery, Wafers, Drinks, Sweets)
    const isTeam2 =
      /вафли|вафля|vafli|lacool|lacoool|anata|аната|ichimlik|напиток|напитки|suv|sweet\s*life|swet\s*pay|kz\s*вафли|kz\s*продукт|brando|брандо|m&m|otto|отто|bello|белло|беллито|bellito|gummy|гамми|мохито|можитто|mojito|бружи|bruji|lara|лара|лимонарий|груша|гранат|вишная|вишня|тархун|фейхон|baretto|баретто|сауле|топленое|зефир|мармелад|птичи|птичье|belino|белино|holly|холли|paris|ramada|джонка|сливки|fiola|фиола|bahor|бахор|mr\.bito|акварельки|halwaa|халва|well\s*wel|велл\s*велл|ёжик|ежик|песочный|шахмат|паличка|палочка|палочки|трубичка|трубочка|падушка|подушка|трайняшка|тройняшка|бурёнушка|буренушка|yumi|rello|natti|fazilat|фазилат|lays|lay's|coca|fanta|nestle|акция|дазмол|повербак|наушник/i.test(name) ||
      /вафли|lacool|lacoool|anata|аната|ichimlik|suv|sweet\s*life|kz\s*продукт|brando|m&m|акция|лимонарий|напитки/i.test(cat);

    if (isTeam2) return 'team2';

    // Default fallback: any unclassified confectionery or other items belong to Team 2
    return 'team2';
  }

  /**
   * Generate complete daily report data for all 6 agents for a specific date (default today)
   */
  public async generateDailyReport(dateParam?: string): Promise<{
    date: string;
    reports: AgentDailyReport[];
    apiErrors?: string[];
    summary: {
      totalAgents: number;
      totalOkb: number;
      totalVisited: number;
      totalUnvisited: number;
      totalTeam1Sales: number;
      totalTeam2Sales: number;
      totalSales: number;
    };
  }> {
    const today = dateParam || getTashkentTodayIso();
    const apiErrors: string[] = [];

    // 1. Fetch live visits for this day (paginated)
    let rawVisits: any[] = [];
    try {
      rawVisits = await this.client.fetchAllPages<any>(
        'getVisit',
        {
          filter: {
            period: {
              date: { from: today, to: today }
            }
          }
        },
        (result) => result?.visit || [],
        500,
        10
      );
    } catch (e: any) {
      apiErrors.push(`getVisit: ${e.message}`);
      console.warn('[DailyReport] getVisit xatosi:', e.message);
    }

    // 2. Fetch live orders for this day (with full pagination and all valid statuses 1, 2, 3, 4)
    let rawOrders: any[] = [];
    try {
      rawOrders = await this.client.fetchAllPages<any>(
        'getOrder',
        {
          filter: {
            agent: 'all',
            status: [1, 2, 3, 4], // 1=new, 2=sent, 3=delivered, 4=closed (exclude 5=cancelled only)
            period: {
              date: { from: today, to: today }
            }
          }
        },
        (result) => result?.order || [],
        500,
        15
      );
    } catch (e: any) {
      apiErrors.push(`getOrder: ${e.message}`);
      console.warn('[DailyReport] getOrder xatosi:', e.message);
    }

    // 2b. Fetch dedicated return/defect documents (getOrderDefect)
    let rawDefects: any[] = [];
    try {
      rawDefects = await this.client.fetchAllPages<any>(
        'getOrderDefect',
        {
          filter: {
            period: {
              date: { from: today, to: today }
            }
          }
        },
        (result) => result?.order || (result as any)?.defect || [],
        500,
        10
      );
    } catch (e: any) {
      apiErrors.push(`getOrderDefect: ${e.message}`);
      console.warn('[DailyReport] getOrderDefect xatosi:', e.message);
    }

    // 2c. Fetch active agents dynamically from SalesDoc
    let apiAgents: Array<{ id: string; name: string }> = [];
    try {
      const aRes = await this.client.request<{ agent: any[] }>('getAgent', {});
      apiAgents = (aRes.result?.agent || [])
        .map((a) => ({
          id: a.SD_id || a.CS_id || '',
          name: a.name || a.SD_id || ''
        }))
        .filter((a) => Boolean(a.id));
    } catch (e: any) {
      apiErrors.push(`getAgent: ${e.message}`);
      console.warn('[DailyReport] getAgent xatosi:', e.message);
    }

    // 3. Fetch clients map (cached for 10 min for instant multi-day generation, skip cache if errors)
    let clientsMap = this.cachedClientsMap;
    let territoryMap = this.cachedTerritoryMap;
    const now = Date.now();

    if (!clientsMap || !territoryMap || now - this.cacheLastFetched > this.CACHE_TTL_MS) {
      const freshClientsMap = new Map<string, any>();
      const freshTerritoryMap = new Map<string, string>();
      let clientsOk = false;
      let territoryOk = false;

      try {
        const allClients = await this.client.fetchAllPages<any>(
          'getClient',
          {},
          (result) => result?.client || [],
          1000,
          10
        );
        allClients.forEach((c) => {
          if (c.SD_id) freshClientsMap.set(c.SD_id, c);
          if (c.CS_id) freshClientsMap.set(c.CS_id, c);
        });
        clientsOk = true;
      } catch (e: any) {
        apiErrors.push(`getClient: ${e.message}`);
        console.warn('[DailyReport] getClient xatosi:', e.message);
      }

      try {
        const tRes = await this.client.request<any>('getTerritory', {});
        const territoriesList = tRes.result?.city || tRes.result?.territory || [];
        territoriesList.forEach((ct: any) => {
          if (ct.SD_id && ct.name) freshTerritoryMap.set(ct.SD_id, ct.name);
          if (ct.CS_id && ct.name) freshTerritoryMap.set(ct.CS_id, ct.name);
        });
        territoryOk = true;
      } catch (e: any) {
        apiErrors.push(`getTerritory: ${e.message}`);
        console.warn('[DailyReport] getTerritory xatosi:', e.message);
      }

      clientsMap = freshClientsMap;
      territoryMap = freshTerritoryMap;
      if (clientsOk && territoryOk) {
        this.cachedClientsMap = freshClientsMap;
        this.cachedTerritoryMap = freshTerritoryMap;
        this.cacheLastFetched = now;
      }
    }

    // Agent team telegram configurations
    const teamConfigs = this.db.getAgentTeamConfigs();

    // Standard 6 agent profiles
    const standardAgents = [
      { id: 'd0_1', name: 'ТП1(Супервайзер 99-362-31-33)' },
      { id: 'd0_2', name: 'ТП2 (Супервайзер) 99-362-31-33' },
      { id: 'd0_3', name: 'ТП3(Супервайзер 99-362-31-33)' },
      { id: 'd0_4', name: 'ТП4 (Супервайзер 99-362-31-33)' },
      { id: 'd0_5', name: 'ТП5 (Супервайзер 99-362-31-33)' },
      { id: 'd0_6', name: 'ТП6 (Супервайзер 99-362-31-33)' }
    ];

    // Group visits by agent
    const visitsByAgent = new Map<string, any[]>();
    rawVisits.forEach((v) => {
      const agId = v.agent_id;
      if (!agId) return;
      if (!visitsByAgent.has(agId)) visitsByAgent.set(agId, []);
      visitsByAgent.get(agId)!.push(v);
    });

    // Group orders by agent
    const ordersByAgent = new Map<string, any[]>();
    rawOrders.forEach((o) => {
      const agId = o.agent?.SD_id || o.agent?.CS_id || o.agent_id;
      if (!agId) return;
      if (!ordersByAgent.has(agId)) ordersByAgent.set(agId, []);
      ordersByAgent.get(agId)!.push(o);
    });

    // Group returns/defects by agent
    const defectsByAgent = new Map<string, any[]>();
    rawDefects.forEach((d) => {
      const agId = d.agent?.SD_id || d.agent?.CS_id || d.agent_id;
      if (!agId) return;
      if (!defectsByAgent.has(agId)) defectsByAgent.set(agId, []);
      defectsByAgent.get(agId)!.push(d);
    });

    // Merge standard agents with API agents, configured agents, and active order/visit agents
    const allAgentIds = new Set<string>(standardAgents.map((a) => a.id));
    apiAgents.forEach((a) => allAgentIds.add(a.id));
    Object.keys(teamConfigs).forEach((id) => allAgentIds.add(id));
    visitsByAgent.forEach((_, id) => allAgentIds.add(id));
    ordersByAgent.forEach((_, id) => allAgentIds.add(id));

    const finalAgentsList = Array.from(allAgentIds).map((id) => {
      const apiAg = apiAgents.find((a) => a.id === id);
      const std = standardAgents.find((a) => a.id === id);
      const cfg = teamConfigs[id];
      return {
        id,
        name: cfg?.agentName || apiAg?.name || std?.name || `Agent ${id}`
      };
    });

    const agentReports: AgentDailyReport[] = [];

    // Local products index for category enrichment
    const localProdByKey = new Map<string, { category?: string; code_1c?: string }>();
    for (const lp of this.db.getProducts()) {
      if (lp.salesdoc_id) localProdByKey.set(lp.salesdoc_id, lp);
      if (lp.id) localProdByKey.set(lp.id, lp);
      if (lp.code_1c) localProdByKey.set(lp.code_1c, lp);
    }

    // Determine day of week in Asia/Tashkent for route lookup (1=Monday ... 6=Saturday, 7=Sunday)
    const dayOfWeek = getTashkentDayOfWeek(today);

    for (const ag of finalAgentsList) {
      const agentVisits = visitsByAgent.get(ag.id) || [];
      const agentOrders = ordersByAgent.get(ag.id) || [];
      const agentDefects = defectsByAgent.get(ag.id) || [];
      const config = teamConfigs[ag.id] || {
        agentId: ag.id,
        agentName: ag.name,
        team1ChatId: '',
        team2ChatId: '',
        isCombinedWorker: ag.id === 'd0_4' || ag.id === 'd0_5'
      };

      // Find visited territories
      const territoriesSet = new Set<string>();
      const visitedClientIds = new Set<string>();
      const unvisitedClientsList: Array<{
        id: string;
        name: string;
        address: string;
        phone: string;
        territory?: string;
      }> = [];

      let okbCount = 0;
      let visitedCount = 0;
      let generalRejects = 0;

      agentVisits.forEach((v) => {
        const cId = v.client_id;
        const clientObj = clientsMap!.get(cId);
        const cityId = clientObj?.city?.SD_id || clientObj?.city?.CS_id || clientObj?.territory?.SD_id || clientObj?.territory?.CS_id;
        const cityName =
          (cityId ? territoryMap!.get(cityId) : undefined) ||
          clientObj?.city?.name ||
          clientObj?.territory?.name;
        if (cityName) territoriesSet.add(cityName);

        const isPlanned = Number(v.planned ?? 0) === 1;
        const isVisited = Number(v.visited ?? 0) === 1;
        const hasOrder = Number(v.has_order ?? 0) === 1;
        const isReject = (v.reject && v.reject !== 'null' && v.reject !== '0') || (!hasOrder && isVisited);

        if (isPlanned) okbCount++;
        if (isVisited) {
          visitedCount++;
          visitedClientIds.add(cId);
        } else {
          // Unvisited shop!
          unvisitedClientsList.push({
            id: cId,
            name: v.client_name || clientObj?.name || `Mijoz ${cId}`,
            address: clientObj?.address || clientObj?.waymark || "Manzil ko'rsatilmagan",
            phone: clientObj?.tel || "Tel ko'rsatilmagan",
            territory: cityName
          });
        }

        if (isReject) generalRejects++;
      });

      // Also extract territories from clients in orders if visits didn't yield official cities
      if (territoriesSet.size === 0) {
        agentOrders.forEach((o) => {
          const cId = o.client?.SD_id || o.client?.CS_id || o.client_id;
          const clientObj = clientsMap!.get(cId);
          const cityId = clientObj?.city?.SD_id || clientObj?.city?.CS_id;
          const cityName = cityId ? territoryMap!.get(cityId) || clientObj?.city?.name : undefined;
          if (cityName) territoriesSet.add(cityName);
        });
      }

      // If okbCount was 0 (e.g. no planned flag), default to total visits
      if (okbCount === 0) okbCount = agentVisits.length;

      const unvisitedCount = unvisitedClientsList.length;

      // Cleaned official city names
      const cleanOfficialCities = Array.from(territoriesSet)
        .filter((t) => t && t.length > 2)
        .map((t) => t.replace(/^\d+\s*р?\.\s*/i, '').trim())
        .filter((t) => t.length > 2 && !/^(d\d+|city|alisher|tolqin|oila|osiyo|shaxrixon)$/i.test(t));

      const uniqueCities = Array.from(new Set(cleanOfficialCities));
      let territoryStr = '';
      if (uniqueCities.length > 0) {
        territoryStr = uniqueCities.slice(0, 2).join(', ');
      } else if (SalesDocDailyReportService.AGENT_WEEKDAY_ROUTES[ag.id]?.[dayOfWeek]) {
        territoryStr = SalesDocDailyReportService.AGENT_WEEKDAY_ROUTES[ag.id][dayOfWeek];
      } else {
        territoryStr = 'Hudud SalesDoc da topilmadi';
      }

      // Determine team mode for agent
      const isSingleTeam = (config.teamMode === 'single') || Boolean(config.isCombinedWorker);
      const agentTeamMode: 'single' | 'dual' = isSingleTeam ? 'single' : 'dual';

      // 1-Komanda calculations
      let team1Sales = 0;
      let team1Returns = 0;
      const team1ClientSet = new Set<string>();

      // 2-Komanda calculations
      let team2Sales = 0;
      let team2Returns = 0;
      const team2ClientSet = new Set<string>();

      // Combined calculations (for 1-team mode or combined overview)
      const combinedClientSet = new Set<string>();

      agentOrders.forEach((o) => {
        const cId = o.client?.SD_id || o.client?.CS_id || o.client_id;
        const orderTotalReturns = Number(o.totalReturnsSumma || 0);
        let orderItemReturnsSum = 0;

        (o.orderProducts || []).forEach((op: any) => {
          const prod = op.product || {};
          const lpMatch =
            localProdByKey.get(prod.SD_id) ||
            localProdByKey.get(prod.CS_id) ||
            localProdByKey.get(prod.code_1C);
          const team = this.classifyProductTeam({
            id: prod.SD_id || prod.CS_id,
            name: prod.name,
            code_1C: prod.code_1C || lpMatch?.code_1c,
            categoryName: op.categoryName || lpMatch?.category
          });
          const rawSumma = Number(op.summa !== undefined && op.summa !== null ? op.summa : ((op.price || 0) * (op.quantity || 0)));
          const returnedQty = Number(op.returned || op.returned_quantity || op.return_quantity || (op as any).returnedQty || 0);
          const itemPrice = Number(op.price || 0);
          const itemQty = Number(op.quantity || 0);
          const itemDiscount = Number(op.discount || 0);

          // Effective unit net price (takes into account unit discounts and missing price)
          const unitDiscount = (itemQty > 0 && itemDiscount > 0) ? (itemDiscount / itemQty) : 0;
          const unitNetPrice = Math.max(0, itemPrice - unitDiscount);
          const effectivePrice = unitNetPrice > 0 ? unitNetPrice : (itemPrice || (itemQty > 0 ? rawSumma / itemQty : 0));

          // Partial or full return sum for this line (supports both returned quantity and direct return_summa)
          const lineReturnSum = Number(op.return_summa || op.returnSumma || (op as any).returned_summa || 0);
          const retVal = lineReturnSum > 0 ? lineReturnSum : (returnedQty > 0 ? (returnedQty * effectivePrice) : 0);

          // Did client keep at least 1 unit or have positive purchase?
          const hasKeptItems = rawSumma > 0 && (itemQty === 0 || itemQty > returnedQty);

          if (team === 'team1') {
            team1Sales += rawSumma;
            if (cId && hasKeptItems) {
              team1ClientSet.add(cId);
              combinedClientSet.add(cId);
            }
            if (retVal > 0) {
              team1Returns += retVal;
              orderItemReturnsSum += retVal;
            }
          } else {
            team2Sales += rawSumma;
            if (cId && hasKeptItems) {
              team2ClientSet.add(cId);
              combinedClientSet.add(cId);
            }
            if (retVal > 0) {
              team2Returns += retVal;
              orderItemReturnsSum += retVal;
            }
          }
        });

        // Chastichniy vozvrat va umumiy orderTotalReturns farqini qamrab olish:
        // Agar buyurtma darajasida totalReturnsSumma mahsulotlar yig'indisidan katta bo'lsa, qolgan qismini ham qo'shamiz
        const unallocatedOrderReturns = Math.max(0, orderTotalReturns - orderItemReturnsSum);
        if (unallocatedOrderReturns > 0) {
          let t1OrderSum = 0;
          let t2OrderSum = 0;
          (o.orderProducts || []).forEach((op: any) => {
            const team = this.classifyProductTeam({
              id: op.product?.SD_id || op.product?.CS_id,
              name: op.product?.name,
              code_1C: op.product?.code_1C,
              categoryName: op.categoryName
            });
            const s = Number(op.summa !== undefined && op.summa !== null ? op.summa : ((op.price || 0) * (op.quantity || 0)));
            if (team === 'team2') t2OrderSum += s;
            else t1OrderSum += s;
          });
          const totalOrder = t1OrderSum + t2OrderSum;
          if (totalOrder > 0) {
            team1Returns += Math.round(unallocatedOrderReturns * (t1OrderSum / totalOrder));
            team2Returns += Math.round(unallocatedOrderReturns * (t2OrderSum / totalOrder));
          } else {
            team1Returns += unallocatedOrderReturns;
          }
        }
      });

      // Dedicated return/defect documents (getOrderDefect)
      agentDefects.forEach((d) => {
        const items = d.defectProducts || d.orderProducts || [];
        items.forEach((dp: any) => {
          const prod = dp.product || {};
          const team = this.classifyProductTeam({
            id: prod.SD_id || prod.CS_id,
            name: prod.name,
            code_1C: prod.code_1C,
            categoryName: dp.categoryName
          });
          const retSum = Number(dp.summa !== undefined && dp.summa !== null ? dp.summa : ((dp.price || 0) * (dp.quantity || 0)));
          if (retSum > 0) {
            if (team === 'team2') {
              team2Returns += retSum;
            } else {
              team1Returns += retSum;
            }
          }
        });
      });

      const team1Akb = team1ClientSet.size;
      const team1Rejects = Math.max(0, visitedCount - team1Akb);

      const team2Akb = team2ClientSet.size;
      const team2Rejects = Math.max(0, visitedCount - team2Akb);

      const combinedAkb = combinedClientSet.size;
      const combinedRejects = Math.max(0, visitedCount - combinedAkb);
      const combinedSales = team1Sales + team2Sales;
      const combinedReturns = team1Returns + team2Returns;

      const worked = visitedCount > 0 || team1Sales > 0 || team2Sales > 0 || team1Returns > 0 || team2Returns > 0;

      // Base team reports
      const combinedReport: AgentDailyTeamReport = {
        teamName: 'Umumiy',
        teamKey: 'team1',
        chatId: config.team1ChatId || config.team2ChatId,
        topicId: config.team1TopicId || config.team2TopicId,
        territory: territoryStr,
        okbTotal: okbCount,
        visitedCount,
        akbCount: combinedAkb,
        rejectsCount: combinedRejects,
        totalSalesSum: combinedSales,
        totalReturnsSum: combinedReturns,
        unvisitedCount,
        unvisitedClients: unvisitedClientsList
      };

      let finalTeam1: AgentDailyTeamReport;
      let finalTeam2: AgentDailyTeamReport;

      if (isSingleTeam) {
        // In 1-team mode, the agent's entire report is UNIFIED (Umumiy)
        finalTeam1 = {
          ...combinedReport,
          teamName: 'Umumiy'
        };
        finalTeam2 = {
          teamName: '2-Komanda',
          teamKey: 'team2',
          chatId: '',
          topicId: '',
          territory: territoryStr,
          okbTotal: okbCount,
          visitedCount,
          akbCount: 0,
          rejectsCount: 0,
          totalSalesSum: 0,
          totalReturnsSum: 0,
          unvisitedCount,
          unvisitedClients: []
        };
      } else {
        // In 2-team mode, Team 1 and Team 2 are separate
        finalTeam1 = {
          teamName: '1-Komanda',
          teamKey: 'team1',
          chatId: config.team1ChatId,
          topicId: config.team1TopicId,
          territory: territoryStr,
          okbTotal: okbCount,
          visitedCount,
          akbCount: team1Akb,
          rejectsCount: team1Rejects,
          totalSalesSum: team1Sales,
          totalReturnsSum: team1Returns,
          unvisitedCount,
          unvisitedClients: unvisitedClientsList
        };
        finalTeam2 = {
          teamName: '2-Komanda',
          teamKey: 'team2',
          chatId: config.team2ChatId,
          topicId: config.team2TopicId,
          territory: territoryStr,
          okbTotal: okbCount,
          visitedCount,
          akbCount: team2Akb,
          rejectsCount: team2Rejects,
          totalSalesSum: team2Sales,
          totalReturnsSum: team2Returns,
          unvisitedCount,
          unvisitedClients: unvisitedClientsList
        };
      }

      agentReports.push({
        agentId: ag.id,
        agentName: ag.name,
        date: today,
        teamMode: agentTeamMode,
        isCombinedWorker: isSingleTeam,
        worked,
        territories: uniqueCities.length > 0 ? uniqueCities : [territoryStr],
        okbTotal: okbCount,
        visitedCount,
        unvisitedCount,
        team1: finalTeam1,
        team2: finalTeam2,
        combined: combinedReport
      });
    }

    const totalOkb = agentReports.reduce((s, r) => s + r.okbTotal, 0);
    const totalVisited = agentReports.reduce((s, r) => s + r.visitedCount, 0);
    const totalUnvisited = agentReports.reduce((s, r) => s + r.unvisitedCount, 0);
    const totalTeam1Sales = agentReports.reduce((s, r) => s + r.team1.totalSalesSum, 0);
    const totalTeam2Sales = agentReports.reduce((s, r) => s + r.team2.totalSalesSum, 0);

    return {
      date: today,
      reports: agentReports,
      ...(apiErrors.length > 0 ? { apiErrors } : {}),
      summary: {
        totalAgents: agentReports.length,
        totalOkb,
        totalVisited,
        totalUnvisited,
        totalTeam1Sales,
        totalTeam2Sales,
        totalSales: totalTeam1Sales + totalTeam2Sales
      }
    };
  }

  /**
   * Build the beautiful Telegram text message for a team daily report
   */
  public buildTeamReportMessage(report: AgentDailyTeamReport, agentName: string, dateStr: string): {
    summaryMessage: string;
    unvisitedMessage?: string;
  } {
    const formattedSum = Math.round(report.totalSalesSum).toLocaleString('uz-UZ') + " so'm";
    const [year, month, day] = dateStr.split('-');
    const displayDate = `${day}.${month}.${year}`;

    const teamLabel = report.teamName === 'Umumiy' ? 'Umumiy hisobot (1 ta komanda)' : report.teamName;
    const lines = [
      `📊 <b>KUNLIK YAKUNIY HISOBOT (22:30)</b>`,
      `📅 <b>Sana:</b> ${displayDate}`,
      `👤 <b>Profil:</b> ${this.escapeHtml(agentName)}`,
      `👥 <b>Komanda:</b> <b>${teamLabel}</b>`,
      `───────────────────────`,
      `🗺️ <b>Kunlik hududi:</b> ${this.escapeHtml(report.territory || 'Asosiy yo\'nalish')}`,
      `📋 <b>Territoriyadagi OKB (Jami reja):</b> <b>${report.okbTotal} ta</b>`,
      `✅ <b>Vizit qilingan do'konlar:</b> <b>${report.visitedCount} ta</b>`,
      `🛒 <b>AKB (Zakaz olingan mijozlar):</b> <b>${report.akbCount} ta</b>`,
      `❌ <b>O'tkazlar (Zakaz olinmagan):</b> <b>${report.rejectsCount} ta</b>`,
      `💰 <b>${report.teamName === 'Umumiy' ? 'Umumiy' : report.teamName} savdo summasi:</b>`,
      `👉 <b>${formattedSum}</b>`
    ];

    if (report.totalReturnsSum > 0) {
      const formattedReturns = Math.round(report.totalReturnsSum).toLocaleString('uz-UZ') + " so'm";
      const netSales = Math.round(report.totalSalesSum - report.totalReturnsSum).toLocaleString('uz-UZ') + " so'm";
      lines.push(`🔄 <b>Vozvrat (qaytarish) summasi:</b> <b>${formattedReturns}</b>`);
      lines.push(`💵 <b>Sof tushum (savdo - vozvrat):</b> <b>${netSales}</b>`);
    }

    lines.push(`───────────────────────`);

    if (report.unvisitedCount > 0) {
      lines.push(`🚫 <b>Tashrif qilinmagan (kirmagan) do'konlar:</b> <b>${report.unvisitedCount} ta</b>`);
      lines.push(`⚠️ <i>Kirmagan do'konlar ro'yxati quyida yuborilmoqda:</i>`);
    } else {
      lines.push(`✨ <b>Barcha rejadagi do'konlarga to'liq tashrif amalga oshirildi (0 ta qoldiq)!</b>`);
    }

    const summaryMessage = lines.join('\n');

    let unvisitedMessage: string | undefined = undefined;
    if (report.unvisitedCount > 0 && report.unvisitedClients.length > 0) {
      const uLines = [
        `📋 <b>KIRMAGAN (TASHRIF QILINMAGAN) DO'KONLAR RO'YXATI:</b>`,
        `👤 <b>Profil:</b> ${this.escapeHtml(agentName)} | <b>${report.teamName}</b>`,
        `📅 <b>Sana:</b> ${displayDate}`,
        `Jami: <b>${report.unvisitedClients.length} ta</b> do'konga agent kirmagan:`,
        `───────────────────────`
      ];

      report.unvisitedClients.slice(0, 50).forEach((c) => {
        uLines.push(`🏪 <b>${this.escapeHtml(c.name)}</b>`);
        const addr = c.address && c.address !== 'null' && c.address.trim() !== '' ? this.escapeHtml(c.address) : "Manzil ko'rsatilmagan";
        const ph = c.phone && c.phone !== 'null' && c.phone.trim() !== '' ? this.escapeHtml(c.phone) : "Tel ko'rsatilmagan";
        uLines.push(`📍 Manzil: ${addr}`);
        uLines.push(`📞 Tel: ${ph}`);
        uLines.push(`⚠️ Holat: Tashrif qilinmagan / Foto olinmagan`);
      });

      if (report.unvisitedClients.length > 50) {
        uLines.push(`<i>... va yana ${report.unvisitedClients.length - 50} ta do'kon</i>`);
      }

      uLines.push(`───────────────────────`);
      uLines.push(`❓ <b>Nega bu do'konlarga tashrif buyurmadingiz?</b>`);
      unvisitedMessage = uLines.join('\n');
    }

    return { summaryMessage, unvisitedMessage };
  }

  /**
   * Send daily reports to all configured agent team groups
   */
  public async sendDailyReports(options: {
    date?: string;
    targetAgentId?: string;
    targetTeam?: 'team1' | 'team2' | 'both';
    onlyUnvisited?: boolean;
  } = {}): Promise<{
    success: boolean;
    totalSent: number;
    failed: number;
    results: Array<{
      agentId: string;
      team: 'team1' | 'team2';
      chatId: string;
      success: boolean;
      error?: string;
    }>;
    error?: string;
  }> {
    const telegramConfig = this.db.getTelegramConfig();
    const botToken = telegramConfig.botToken;

    if (!botToken) {
      return {
        success: false,
        totalSent: 0,
        failed: 0,
        results: [],
        error: "Telegram Bot Token kiritilmagan. Iltimos, Sozlamalardan Bot Tokenni kiriting."
      };
    }

    const reportData = await this.generateDailyReport(options.date);

    const results: Array<{
      agentId: string;
      team: 'team1' | 'team2';
      chatId: string;
      success: boolean;
      error?: string;
    }> = [];

    let totalSent = 0;
    let failed = 0;

    for (const agReport of reportData.reports) {
      if (options.targetAgentId && options.targetAgentId !== agReport.agentId) {
        continue;
      }

      // Teams to send: For single team mode, ONLY send team1 (which contains the combined data)
      const isSingle = agReport.teamMode === 'single' || agReport.isCombinedWorker;
      const teamsToSend: Array<'team1' | 'team2'> = [];
      if (isSingle) {
        teamsToSend.push('team1');
      } else if (!options.targetTeam || options.targetTeam === 'both') {
        teamsToSend.push('team1', 'team2');
      } else {
        teamsToSend.push(options.targetTeam);
      }

      for (const teamKey of teamsToSend) {
        const teamReport = agReport[teamKey];
        const chatId = teamReport.chatId || telegramConfig.defaultChatId;

        if (!chatId) {
          // No chat id configured for this team
          continue;
        }

        const { summaryMessage, unvisitedMessage } = this.buildTeamReportMessage(
          teamReport,
          agReport.agentName,
          reportData.date
        );

        try {
          if (options.onlyUnvisited) {
            // ONLY send unvisited list in the evening
            if (unvisitedMessage) {
              const resUnvisited = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_thread_id: teamReport.topicId ? Number(teamReport.topicId) : undefined,
                  text: unvisitedMessage,
                  parse_mode: 'HTML'
                })
              });
              const ju = await resUnvisited.json();
              if (!ju.ok) {
                throw new Error(ju.description || 'Telegram unvisitedMessage xatosi');
              }
            } else {
              // All shops were visited, no unvisited list to send
              continue;
            }
          } else {
            // Send summary
            const res1 = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                message_thread_id: teamReport.topicId ? Number(teamReport.topicId) : undefined,
                text: summaryMessage,
                parse_mode: 'HTML'
              })
            });

            const j1 = await res1.json();
            if (!j1.ok) {
              throw new Error(j1.description || 'Telegram sendMessage xatosi');
            }

            // If there are unvisited shops, send their list right after!
            if (unvisitedMessage) {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_thread_id: teamReport.topicId ? Number(teamReport.topicId) : undefined,
                  text: unvisitedMessage,
                  parse_mode: 'HTML'
                })
              });
            }
          }

          results.push({
            agentId: agReport.agentId,
            team: teamKey,
            chatId,
            success: true
          });
          totalSent++;
        } catch (err: any) {
          results.push({
            agentId: agReport.agentId,
            team: teamKey,
            chatId,
            success: false,
            error: err.message
          });
          failed++;
        }
      }
    }

    // Record last sent time
    this.db.updateDailyReportConfig({
      lastSentDate: reportData.date,
      lastSentAt: new Date().toISOString()
    });

    return {
      success: failed === 0,
      totalSent,
      failed,
      results
    };
  }

  /**
   * Starts background scheduler checking for 22:30 (Tashkent time, UTC+5)
   */
  private startScheduler(): void {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      try {
        const config = this.db.getDailyReportConfig();
        if (!config.autoSendEnabled) return;

        // Current time in Uzbekistan (Asia/Tashkent, UTC+5)
        const { hours, minutes, dateIso: todayStr } = getTashkentTimeParts();

        // Trigger at 22:30 or later if not already sent today
        const [targetH, targetM] = (config.scheduledTime || '22:30').split(':').map(Number);

        const isTime = hours > targetH || (hours === targetH && minutes >= targetM);
        const notSentToday = config.lastSentDate !== todayStr;

        if (isTime && notSentToday) {
          const telegramConfig = this.db.getTelegramConfig();
          if (!telegramConfig.botToken) {
            // Bot token is not configured yet. Skip without throwing repeated errors.
            return;
          }
          console.log(`[DailyReport] 22:30 yetib keldi! Bugungi (${todayStr}) kunlik hisobot barcha agent guruhlariga yuborilmoqda...`);
          await this.sendDailyReports({ date: todayStr });
        }
      } catch (err: any) {
        console.warn('[DailyReport Scheduler] Error:', err.message);
      }
    }, 30000); // Check every 30 seconds
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
