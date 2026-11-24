import { SalesDocClient } from '../client/SalesDocClient.js';
import { LocalDb } from '../storage/localDb.js';
import { generateIsoDateRange, getTashkentTimeParts, getTashkentTodayIso } from '../utils/timezone.js';
import { SalesDocDailyReportService } from './SalesDocDailyReportService.js';

export interface SheetRowData {
  date: string; // DD.MM.YYYY
  isoDate: string; // YYYY-MM-DD
  worked: boolean;
  territory: string;
  okb: number;
  visited: number;
  unvisited: number;
  team1: {
    akb: number;
    rejects: number;
    sales: number;
    salesFormatted: string;
    returns: number;
  };
  team2: {
    akb: number;
    rejects: number;
    sales: number;
    salesFormatted: string;
    returns: number;
  };
  tsvLine: string;
  csvLine: string;
}

export interface AgentSheetTable {
  agentId: string;
  agentName: string;
  sheetTitle: string;
  rows: SheetRowData[];
  tsvContent: string;
  csvContent: string;
  totals: {
    team1Sales: number;
    team2Sales: number;
    totalSales: number;
    team1AkbTotal: number;
    team2AkbTotal: number;
    visitedTotal: number;
    activeDays: number;
  };
}

export class SalesDocGoogleSheetsService {
  private static instance: SalesDocGoogleSheetsService | null = null;
  private client: SalesDocClient;
  private db: LocalDb;
  private dailyReportService: SalesDocDailyReportService;
  private timer: NodeJS.Timeout | null = null;

  public static readonly STANDARD_AGENTS = [
    { id: 'd0_1', name: 'ТП 1 (Умирзок / Нодирбек)', sheetTitle: 'ТП 1' },
    { id: 'd0_2', name: 'ТП 2', sheetTitle: 'ТП 2' },
    { id: 'd0_3', name: 'ТП 3', sheetTitle: 'ТП 3' },
    { id: 'd0_4', name: 'ТП 4', sheetTitle: 'ТП 4' },
    { id: 'd0_5', name: 'ТП 5', sheetTitle: 'ТП 5' },
    { id: 'd0_6', name: 'ТП 6', sheetTitle: 'ТП 6' }
  ];

  public static getInstance(client?: SalesDocClient, db?: LocalDb): SalesDocGoogleSheetsService {
    if (!SalesDocGoogleSheetsService.instance) {
      SalesDocGoogleSheetsService.instance = new SalesDocGoogleSheetsService(client, db);
    }
    return SalesDocGoogleSheetsService.instance;
  }

  private constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
    this.dailyReportService = SalesDocDailyReportService.getInstance(this.client, this.db);
    this.startScheduler();
  }

  /**
   * Starts background scheduler checking for 22:30 (Tashkent time, UTC+5)
   * to automatically push daily report rows to Google Sheets webhook.
   */
  private startScheduler(): void {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      try {
        const config = this.db.getGoogleSheetsConfig();
        if (!config.autoSyncEnabled || !config.webhookUrl) return;

        // Current time in Uzbekistan (Asia/Tashkent, UTC+5)
        const { hours, minutes, dateIso: todayStr } = getTashkentTimeParts();

        // Trigger at 22:30 or later if not already synced today
        const isTime = hours > 22 || (hours === 22 && minutes >= 30);
        const notSyncedToday = config.lastSyncedDate !== todayStr;

        if (isTime && notSyncedToday) {
          console.log(`[GoogleSheets Scheduler] 22:30 yetib keldi! Bugungi (${todayStr}) ma'lumotlar Google Sheets ga yuborilmoqda...`);
          await this.syncToGoogleSheets(todayStr);
        }
      } catch (err: any) {
        console.warn('[GoogleSheets Scheduler] Error:', err.message);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Helper to clean up territory names into human readable short labels
   */
  private cleanTerritory(territories: string[]): string {
    if (!territories || territories.length === 0) return '';
    const filtered = territories
      .filter((t) => t && t.length > 2)
      .map((t) => t.replace(/^\d+\s*р?\.\s*/i, '').trim())
      .filter((t) => t.length > 2 && !/^(d\d+|city|alisher|tolqin|oila|osiyo|shaxrixon)$/i.test(t));

    const unique = Array.from(new Set(filtered));
    if (unique.length > 0) {
      return unique.slice(0, 2).join(', ');
    }
    return territories[0] || '';
  }

  /**
   * Generates a date range list from start to end (inclusive)
   */
  public generateDateRange(startDateStr: string = '2026-08-31', endDateStr: string = '2026-10-07'): Array<{ iso: string; formatted: string }> {
    return generateIsoDateRange(startDateStr, endDateStr);
  }

  private getTargetAgents(filterAgentId?: string): Array<{ id: string; name: string; sheetTitle: string }> {
    const map = new Map<string, { id: string; name: string; sheetTitle: string }>();
    for (const a of SalesDocGoogleSheetsService.STANDARD_AGENTS) {
      map.set(a.id, a);
    }
    const cfgs = this.db.getAgentTeamConfigs();
    for (const [id, cfg] of Object.entries(cfgs)) {
      if (!map.has(id)) {
        const c = cfg as any;
        map.set(id, {
          id,
          name: c?.agentName || id,
          sheetTitle: c?.agentName || id
        });
      }
    }
    const all = Array.from(map.values());
    return filterAgentId ? all.filter((a) => a.id === filterAgentId) : all;
  }

  /**
   * Builds the entire multi-agent Google Sheets data from startDate to endDate.
   * Leverages caching in LocalDb so repeated loads are instantaneous.
   */
  public async getSheetsReport(options?: {
    startDate?: string;
    endDate?: string;
    forceRefresh?: boolean;
    agentId?: string;
  }): Promise<{
    sheets: AgentSheetTable[];
    dateRange: { start: string; end: string; totalDays: number };
    googleSheetsConfig: any;
    apiWarnings?: string[];
  }> {
    const startDate = options?.startDate || '2026-08-31';
    const endDate = options?.endDate || '2026-10-07';
    const dateList = this.generateDateRange(startDate, endDate);

    // Current date (Asia/Tashkent UTC+5)
    const todayIso = getTashkentTodayIso();

    const cache = this.db.getSheetsHistoryCache();
    const targetAgents = this.getTargetAgents(options?.agentId);
    const apiWarnings: string[] = [];

    // Collect dates that have occurred and need live fetch or refresh
    const datesToFetch: string[] = [];
    for (const d of dateList) {
      if (d.iso <= todayIso) {
        if (options?.forceRefresh || !cache[d.iso]) {
          datesToFetch.push(d.iso);
        }
      }
    }

    // Fetch missing dates
    let cacheDirty = false;
    if (datesToFetch.length > 0) {
      for (const dIso of datesToFetch) {
        try {
          const reportRes = await this.dailyReportService.generateDailyReport(dIso);
          if (reportRes.apiErrors && reportRes.apiErrors.length > 0) {
            apiWarnings.push(`${dIso}: ${reportRes.apiErrors.join('; ')}`);
            // Do NOT cache failed/partial API error days as unworked!
            continue;
          }
          const dayMap: Record<string, any> = {};
          (reportRes.reports || []).forEach((r) => {
            dayMap[r.agentId] = r;
          });
          cache[dIso] = dayMap;
          cacheDirty = true;
        } catch (err: any) {
          apiWarnings.push(`${dIso}: ${err.message}`);
          console.warn(`[SheetsService] Kunlik ma'lumotni olishda xato (${dIso}):`, err.message);
        }
      }
      if (cacheDirty) {
        this.db.setSheetsHistoryCache(cache);
      }
    }

    const sheets: AgentSheetTable[] = [];

    for (const ag of targetAgents) {
      const rows: SheetRowData[] = [];
      let team1Sales = 0;
      let team2Sales = 0;
      let team1AkbTotal = 0;
      let team2AkbTotal = 0;
      let visitedTotal = 0;
      let activeDays = 0;

      for (const d of dateList) {
        const isPastOrToday = d.iso <= todayIso;
        const agentDayData = cache[d.iso]?.[ag.id];

        let worked = false;
        let territory = '';
        let okb = 0;
        let visited = 0;
        let unvisited = 0;

        let t1_akb = 0;
        let t1_rejects = 0;
        let t1_sales = 0;
        let t1_returns = 0;

        let t2_akb = 0;
        let t2_rejects = 0;
        let t2_sales = 0;
        let t2_returns = 0;

        if (isPastOrToday && agentDayData) {
          territory = agentDayData.team1?.territory || this.cleanTerritory(agentDayData.territories || []);
          okb = agentDayData.okbTotal || 0;
          visited = agentDayData.visitedCount || 0;
          unvisited = agentDayData.unvisitedCount || 0;

          const t1 = agentDayData.team1 || {};
          const t2 = agentDayData.team2 || {};

          t1_sales = t1.totalSalesSum || t1.totalSales || 0;
          t1_returns = t1.totalReturnsSum || t1.returns || 0;
          t1_akb = t1.akbCount || t1.akb || 0;
          t1_rejects = t1.rejectsCount || t1.rejects || (visited > t1_akb ? visited - t1_akb : 0);

          t2_sales = t2.totalSalesSum || t2.totalSales || 0;
          t2_returns = t2.totalReturnsSum || t2.returns || 0;
          t2_akb = t2.akbCount || t2.akb || 0;
          t2_rejects = t2.rejectsCount || t2.rejects || (visited > t2_akb ? visited - t2_akb : 0);

          worked = visited > 0 || t1_sales > 0 || t2_sales > 0 || t1_returns > 0 || t2_returns > 0;
        }

        if (worked) {
          activeDays++;
          team1Sales += t1_sales;
          team2Sales += t2_sales;
          team1AkbTotal += t1_akb;
          team2AkbTotal += t2_akb;
          visitedTotal += visited;
        }

        const t1_salesFormatted = t1_sales > 0 ? t1_sales.toLocaleString('en-US') : '0';
        const t2_salesFormatted = t2_sales > 0 ? t2_sales.toLocaleString('en-US') : '0';

        // Formatting TSV and CSV lines according to user's exact specification:
        // Table 1 (1-Komanda): Sana, Територия, ОКБ, ВИЗИТ, АКБ, Отказ, Сум, Возрат, Кирилмади
        // Gap: \t (Column J is blank)
        // Table 2 (2-Komanda): Sana, Територия, ОКБ, ВИЗИТ, АКБ, Отказ, Сум, Возрат, Кирилмади
        // USER DIRECTIVE: "lekin ponniy ochiq bosa tegma chunki osha kuni agent ishlamagan boladi"
        // If unworked: leave completely blank/open, do NOT populate fake 0s into columns!
        let tsvLine = '';
        let csvLine = '';

        if (!isPastOrToday) {
          // Future date waiting to be worked
          tsvLine = `${d.formatted}\t\t\t\t\t\t\t\t\t\t${d.formatted}\t\t\t\t\t\t\t\t`;
          csvLine = `${d.formatted},,,,,,,,,,${d.formatted},,,,,,,,`;
        } else if (!worked) {
          // Unworked day: Leave completely open/blank (untouched)
          tsvLine = `${d.formatted}\t\t\t\t\t\t\t\t\t\t${d.formatted}\t\t\t\t\t\t\t\t`;
          csvLine = `${d.formatted},,,,,,,,,,${d.formatted},,,,,,,,`;
        } else {
          // Worked = true: populate both tables cleanly with real sales and real returns (vozvrati)
          const t1_tsv = `${d.formatted}\t${territory}\t${okb}\t${visited}\t${t1_akb}\t${t1_rejects}\t${t1_sales}\t${t1_returns}\t${unvisited}`;
          const t2_tsv = `${d.formatted}\t${territory}\t${okb}\t${visited}\t${t2_akb}\t${t2_rejects}\t${t2_sales}\t${t2_returns}\t${unvisited}`;
          tsvLine = `${t1_tsv}\t\t${t2_tsv}`;

          const t1_csv = `"${d.formatted}","${territory}",${okb},${visited},${t1_akb},${t1_rejects},"${t1_salesFormatted}",${t1_returns},${unvisited}`;
          const t2_csv = `"${d.formatted}","${territory}",${okb},${visited},${t2_akb},${t2_rejects},"${t2_salesFormatted}",${t2_returns},${unvisited}`;
          csvLine = `${t1_csv},,${t2_csv}`;
        }

        rows.push({
          date: d.formatted,
          isoDate: d.iso,
          worked,
          territory,
          okb,
          visited,
          unvisited,
          team1: {
            akb: t1_akb,
            rejects: t1_rejects,
            sales: t1_sales,
            salesFormatted: t1_salesFormatted,
            returns: t1_returns
          },
          team2: {
            akb: t2_akb,
            rejects: t2_rejects,
            sales: t2_sales,
            salesFormatted: t2_salesFormatted,
            returns: t2_returns
          },
          tsvLine,
          csvLine
        });
      }

      // Build header & full tsv/csv
      const headerTsv = `Сана\tТеритория\tОКБ\tВИЗИТ\tАКБ\tОтказ\tСум\tВозрат\tКирилмади\t\tСана\tТеритория\tОКБ\tВИЗИТ\tАКБ\tОтказ\tСум\tВозрат\tКирилмади`;
      const headerCsv = `Сана,Територия,ОКБ,ВИЗИТ,АКБ,Отказ,Сум,Возрат,Кирилмади,,Сана,Територия,ОКБ,ВИЗИТ,АКБ,Отказ,Сум,Возрат,Кирилмади`;

      const tsvContent = `${headerTsv}\n${rows.map((r) => r.tsvLine).join('\n')}`;
      const csvContent = `${headerCsv}\n${rows.map((r) => r.csvLine).join('\n')}`;

      sheets.push({
        agentId: ag.id,
        agentName: ag.name,
        sheetTitle: ag.sheetTitle,
        rows,
        tsvContent,
        csvContent,
        totals: {
          team1Sales,
          team2Sales,
          totalSales: team1Sales + team2Sales,
          team1AkbTotal,
          team2AkbTotal,
          visitedTotal,
          activeDays
        }
      });
    }

    return {
      sheets,
      dateRange: { start: startDate, end: endDate, totalDays: dateList.length },
      googleSheetsConfig: this.db.getGoogleSheetsConfig(),
      ...(apiWarnings.length > 0 ? { apiWarnings } : {})
    };
  }

  /**
   * Syncs a specific date or today's row to Google Sheets Webhook
   */
  public async syncToGoogleSheets(dateIsoParam?: string): Promise<{ success: boolean; message: string; payload?: any }> {
    const config = this.db.getGoogleSheetsConfig();
    if (!config.webhookUrl) {
      return {
        success: false,
        message: "Google Sheets Webhook URL sozlanmagan. Iltimos, sozlamalardan Webhook URL ni kiriting."
      };
    }

    const dateIso = dateIsoParam || getTashkentTodayIso();

    const reportRes = await this.dailyReportService.generateDailyReport(dateIso);
    if (reportRes.apiErrors && reportRes.apiErrors.length > 0) {
      return {
        success: false,
        message: `SalesDoc API xatosi (${dateIso}): ${reportRes.apiErrors.join('; ')}. Soxta bo'sh yozuvlar Google Sheets ga yuborilmadi.`
      };
    }

    const cache = this.db.getSheetsHistoryCache();
    const dayMap: Record<string, any> = {};
    (reportRes.reports || []).forEach((r) => {
      dayMap[r.agentId] = r;
    });
    cache[dateIso] = dayMap;
    this.db.setSheetsHistoryCache(cache);

    const [yyyy, mm, dd] = dateIso.split('-');
    const formattedDate = `${dd}.${mm}.${yyyy}`;

    const agentsPayload: Array<{
      agentId: string;
      sheetTitle: string;
      dateFormatted: string;
      worked: boolean;
      team1: {
        territory: string;
        okb: number;
        visited: number;
        akb: number;
        rejects: number;
        sales: number;
        returns: number;
        unvisited: number;
      };
      team2: {
        territory: string;
        okb: number;
        visited: number;
        akb: number;
        rejects: number;
        sales: number;
        returns: number;
        unvisited: number;
      };
      tsvLine: string;
    }> = [];

    for (const ag of this.getTargetAgents()) {
      const rep = dayMap[ag.id];
      const territory = rep?.team1?.territory || (rep ? this.cleanTerritory(rep.territories || []) : '');
      const okb = rep?.okbTotal || 0;
      const visited = rep?.visitedCount || 0;
      const unvisited = rep?.unvisitedCount || 0;

      const t1 = rep?.team1 || {};
      const t2 = rep?.team2 || {};

      const t1_sales = t1.totalSalesSum || t1.totalSales || 0;
      const t1_returns = t1.totalReturnsSum || t1.returns || 0;
      const t1_akb = t1.akbCount || t1.akb || 0;
      const t1_rejects = t1.rejectsCount || t1.rejects || (visited > t1_akb ? visited - t1_akb : 0);

      const t2_sales = t2.totalSalesSum || t2.totalSales || 0;
      const t2_returns = t2.totalReturnsSum || t2.returns || 0;
      const t2_akb = t2.akbCount || t2.akb || 0;
      const t2_rejects = t2.rejectsCount || t2.rejects || (visited > t2_akb ? visited - t2_akb : 0);

      const worked = visited > 0 || t1_sales > 0 || t2_sales > 0 || t1_returns > 0 || t2_returns > 0;

      let tsvLine = '';
      if (!worked) {
        tsvLine = `${formattedDate}\t\t\t\t\t\t\t\t\t\t${formattedDate}\t\t\t\t\t\t\t\t`;
      } else {
        const t1_tsv = `${formattedDate}\t${territory}\t${okb}\t${visited}\t${t1_akb}\t${t1_rejects}\t${t1_sales}\t${t1_returns}\t${unvisited}`;
        const t2_tsv = `${formattedDate}\t${territory}\t${okb}\t${visited}\t${t2_akb}\t${t2_rejects}\t${t2_sales}\t${t2_returns}\t${unvisited}`;
        tsvLine = `${t1_tsv}\t\t${t2_tsv}`;
      }

      agentsPayload.push({
        agentId: ag.id,
        sheetTitle: ag.sheetTitle,
        dateFormatted: formattedDate,
        worked,
        team1: {
          territory,
          okb,
          visited,
          akb: t1_akb,
          rejects: t1_rejects,
          sales: t1_sales,
          returns: t1_returns,
          unvisited
        },
        team2: {
          territory,
          okb,
          visited,
          akb: t2_akb,
          rejects: t2_rejects,
          sales: t2_sales,
          returns: t2_returns,
          unvisited
        },
        tsvLine
      });
    }

    const payload = {
      action: 'updateDailyRow',
      date: formattedDate,
      isoDate: dateIso,
      timestamp: new Date().toISOString(),
      agents: agentsPayload
    };

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      this.db.updateGoogleSheetsConfig({
        lastSyncedAt: new Date().toISOString(),
        lastSyncedDate: dateIso
      });

      return {
        success: response.ok,
        message: response.ok
          ? `Google Sheets muvaffaqiyatli yangilandi (${formattedDate})`
          : `Google Sheets xatosi (${response.status}): ${responseText.slice(0, 100)}`,
        payload
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Google Sheets Webhook ga ulanib bo'lmadi: ${err.message}`
      };
    }
  }

  /**
   * "Kelgan joyidan to'ldirib borish" (Catch-up sync):
   * Scans all passed days from 2026-08-31 up to today.
   * For every worked day, populates missing fields (territory, returns/vozvrati, sales, etc.).
   * Leaves unworked days completely empty/untouched.
   */
  public async syncCatchup(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    syncedDates: string[];
    skippedDates: string[];
    totalWorkedRowsUpdated: number;
    webhookResult?: any;
    message: string;
  }> {
    const startDate = options?.startDate || '2026-08-31';

    const todayIso = getTashkentTodayIso();
    const endDate = options?.endDate || todayIso;

    const dateList = this.generateDateRange(startDate, endDate);
    const syncedDates: string[] = [];
    const skippedDates: string[] = [];
    const failedDates: string[] = [];
    let totalWorkedRowsUpdated = 0;

    const daysPayload: any[] = [];
    const config = this.db.getGoogleSheetsConfig();
    const cache = this.db.getSheetsHistoryCache();
    const targetAgents = this.getTargetAgents();

    for (const d of dateList) {
      if (d.iso > todayIso) continue;

      try {
        const reportRes = await this.dailyReportService.generateDailyReport(d.iso);
        if (reportRes.apiErrors && reportRes.apiErrors.length > 0) {
          failedDates.push(`${d.iso} (${reportRes.apiErrors[0]})`);
          continue;
        }
        const dayMap: Record<string, any> = {};
        (reportRes.reports || []).forEach((r) => {
          dayMap[r.agentId] = r;
        });
        cache[d.iso] = dayMap;

        const agentsForDay: any[] = [];
        let anyWorkedForDay = false;

        for (const ag of targetAgents) {
          const rep = dayMap[ag.id];
          const territory = rep?.team1?.territory || (rep ? this.cleanTerritory(rep.territories || []) : '');
          const okb = rep?.okbTotal || 0;
          const visited = rep?.visitedCount || 0;
          const unvisited = rep?.unvisitedCount || 0;

          const t1 = rep?.team1 || {};
          const t2 = rep?.team2 || {};

          const t1_sales = t1.totalSalesSum || t1.totalSales || 0;
          const t1_returns = t1.totalReturnsSum || t1.returns || 0;
          const t1_akb = t1.akbCount || t1.akb || 0;
          const t1_rejects = t1.rejectsCount || t1.rejects || (visited > t1_akb ? visited - t1_akb : 0);

          const t2_sales = t2.totalSalesSum || t2.totalSales || 0;
          const t2_returns = t2.totalReturnsSum || t2.returns || 0;
          const t2_akb = t2.akbCount || t2.akb || 0;
          const t2_rejects = t2.rejectsCount || t2.rejects || (visited > t2_akb ? visited - t2_akb : 0);

          const worked = visited > 0 || t1_sales > 0 || t2_sales > 0 || t1_returns > 0 || t2_returns > 0;
          if (worked) {
            anyWorkedForDay = true;
            totalWorkedRowsUpdated++;
          }

          agentsForDay.push({
            agentId: ag.id,
            sheetTitle: ag.sheetTitle,
            dateFormatted: d.formatted,
            worked,
            team1: {
              territory,
              okb,
              visited,
              akb: t1_akb,
              rejects: t1_rejects,
              sales: t1_sales,
              returns: t1_returns,
              unvisited
            },
            team2: {
              territory,
              okb,
              visited,
              akb: t2_akb,
              rejects: t2_rejects,
              sales: t2_sales,
              returns: t2_returns,
              unvisited
            }
          });
        }

        if (anyWorkedForDay) {
          syncedDates.push(d.iso);
          daysPayload.push({
            date: d.formatted,
            isoDate: d.iso,
            agents: agentsForDay
          });
        } else {
          skippedDates.push(d.iso);
        }
      } catch (err: any) {
        failedDates.push(`${d.iso} (${err.message})`);
        console.warn(`[syncCatchup] Kun ${d.iso} da xatolik:`, err.message);
      }
    }

    this.db.setSheetsHistoryCache(cache);

    let webhookResult: any = null;
    if (config.webhookUrl && daysPayload.length > 0) {
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'catchup',
            timestamp: new Date().toISOString(),
            days: daysPayload
          })
        });
        const resText = await response.text();
        const isHtml = resText.trim().startsWith('<') || resText.includes('<!doctype') || resText.includes('<html');
        let parsed: any = null;
        try {
          parsed = JSON.parse(resText);
        } catch (e) {
          // not json
        }

        const isRealSuccess = response.ok && !isHtml && (parsed?.status === 'success' || parsed?.totalUpdated !== undefined);

        webhookResult = {
          ok: isRealSuccess,
          status: response.status,
          isHtml,
          text: resText.slice(0, 300),
          error: isRealSuccess
            ? undefined
            : (isHtml
                ? "Noto'g'ri havola: Siz loyiha muharriri (.../edit) manzilini kiritgansiz. Google Sheets qabul qilishi uchun oxiri /exec bilan tugaydigan Veb-ilova URL manzili kerak!"
                : (parsed?.message || `HTTP ${response.status}`))
        };

        if (isRealSuccess) {
          this.db.updateGoogleSheetsConfig({
            lastSyncedAt: new Date().toISOString(),
            lastSyncedDate: todayIso
          });
        }
      } catch (netErr: any) {
        webhookResult = { ok: false, error: netErr.message };
      }
    } else if (!config.webhookUrl) {
      webhookResult = {
        ok: false,
        missingUrl: true,
        error: 'Google Sheets Webhook URL kiritilmagan'
      };
    }

    const hasWebhookUrl = Boolean(config.webhookUrl);
    const success = hasWebhookUrl && Boolean(webhookResult?.ok);

    let message = '';
    if (failedDates.length > 0 && syncedDates.length === 0) {
      message = `❌ SalesDoc API xatosi tufayli ma'lumotlar yuklanmadi (${failedDates[0]}). Soxta 0 yozuvlar saqlanmadi.`;
    } else if (!hasWebhookUrl) {
      message = `⚠️ Google Sheets Webhook URL sozlanmagan! ${syncedDates.length} ta kun hisoblab tayyorlandi. Google Sheets ga to'ldirish uchun Webhook URL ni kiriting.`;
    } else if (!success) {
      message = `❌ Google Sheets ga yozilmadi! ${webhookResult?.error || 'Noto\'g\'ri URL yoki ruxsat berilmagan'}`;
    } else {
      message = `${syncedDates.length} ta kun uchun jami ${totalWorkedRowsUpdated} ta agent yozuvi Google Sheets ga muvaffaqiyatli uzatildi. ${skippedDates.length} ta dam olish kuni tegilmasdan ochiq qoldirildi.${failedDates.length > 0 ? ` (${failedDates.length} ta kunda API xatosi sabab o'tkazildi)` : ''}`;
    }

    return {
      success,
      syncedDates,
      skippedDates,
      totalWorkedRowsUpdated,
      webhookResult,
      message
    };
  }

  /**
   * Test connection to Google Apps Script Webhook
   */
  public async testWebhook(webhookUrl?: string): Promise<{
    success: boolean;
    status?: number;
    message: string;
    details?: any;
  }> {
    const url = (webhookUrl || this.db.getGoogleSheetsConfig().webhookUrl || '').trim();
    if (!url) {
      return {
        success: false,
        message: 'Google Sheets Webhook URL kiritilmagan'
      };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          timestamp: new Date().toISOString()
        })
      });
      const text = await res.text();
      const isHtml = text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<html');
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = text.slice(0, 300);
      }

      if (isHtml) {
        return {
          success: false,
          status: res.status,
          message: "❌ Noto'g'ri havola: Siz loyiha muharriri (.../edit) manzilini kiritgansiz! Apps Script da 'Joylashtirish' tugmasi orqali beriladigan va oxiri '/exec' bilan tugaydigan Veb-ilova URL manzilini kiriting.",
          details: parsed
        };
      }

      const isRealSuccess = res.ok && parsed && (parsed.status === 'success' || parsed.service);
      return {
        success: Boolean(isRealSuccess),
        status: res.status,
        message: isRealSuccess
          ? '✅ Google Sheets Webhook muvaffaqiyatli ulandi va javob berdi!'
          : `⚠️ Google Sheets xatolik qaytardi: ${parsed?.message || 'Kutilmagan javob'}`,
        details: parsed
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Ulanishda xatolik: ${err.message}`,
        details: err.message
      };
    }
  }

  /**
   * Ready-to-copy Google Apps Script code snippet that runs on Google Sheets
   */
  public getGoogleAppsScriptSnippet(): string {
    return `/**
 * Google Apps Script - SalesDoc kunlik hisobotini avtomatik qabul qiluvchi Webhook
 * Ushbu kodni Google Sheets -> Extensions -> Apps Script bo'limiga qo'ying
 * va 'Deploy' -> 'New deployment' -> 'Web app' (Anyone access) qilib e'lon qiling!
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ready",
    service: "SalesDoc Google Sheets Webhook",
    time: new Date().toISOString(),
    message: "SalesDoc Google Sheets Webhook faol va ishlashga tayyor!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Webhook sinash so'rovi
    if (data.action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Test muvaffaqiyatli! Google Sheets Webhook faol holatda."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Yagona kun yoki ko'p kunlik (catchup) sinxronlashni qo'llab-quvvatlaydi
    var daysList = [];
    if (data.action === 'catchup' && Array.isArray(data.days)) {
      daysList = data.days;
    } else if (data.agents && data.date) {
      daysList = [{ date: data.date, isoDate: data.isoDate || data.date, agents: data.agents }];
    }
    
    var totalUpdated = 0;
    
    daysList.forEach(function(dayItem) {
      var targetDate = dayItem.date;
      var isoDate = dayItem.isoDate || dayItem.date;
      var agents = dayItem.agents || [];
      
      agents.forEach(function(ag) {
        // MUHIM QOIDA: Agar agent o'sha kuni ishlamagan bo'lsa (worked === false),
        // qatorga umuman TEGILMAYDI, bo'sh joyi ochiq qoldiriladi!
        if (ag.worked === false) return;
        
        var sheet = findOrCreateSheet(ss, ag.sheetTitle, ag.agentId);
        if (!sheet) return;
        
        // Sana qatorini qidirish
        var foundRow = findDateRow(sheet, targetDate, isoDate);
        
        // Agar sana topilmasa, keyingi bo'sh qatorga qo'shamiz
        if (foundRow === -1) {
          foundRow = Math.max(sheet.getLastRow() + 1, 2);
          sheet.getRange(foundRow, 1).setValue(targetDate);
        }
        
        var r = foundRow;
        
        // 1-Komanda (Ustunlar A - I: 1 - 9)
        // Sana, Територия, ОКБ, ВИЗИТ, АКБ, Отказ, Сум, Возрат, Кирилмади
        sheet.getRange(r, 1).setValue(targetDate);
        sheet.getRange(r, 2).setValue(ag.team1.territory || "");
        sheet.getRange(r, 3).setValue(ag.team1.okb || 0);
        sheet.getRange(r, 4).setValue(ag.team1.visited || 0);
        sheet.getRange(r, 5).setValue(ag.team1.akb || 0);
        sheet.getRange(r, 6).setValue(ag.team1.rejects || 0);
        sheet.getRange(r, 7).setValue(ag.team1.sales || 0);
        sheet.getRange(r, 8).setValue(ag.team1.returns || 0); // VOZVRAT
        sheet.getRange(r, 9).setValue(ag.team1.unvisited || 0);
        
        // 2-Komanda (Ustunlar K - S: 11 - 19)
        // Sana, Територия, ОКБ, ВИЗИТ, АКБ, Отказ, Сум, Возрат, Кирилмади
        sheet.getRange(r, 11).setValue(targetDate);
        sheet.getRange(r, 12).setValue(ag.team2.territory || "");
        sheet.getRange(r, 13).setValue(ag.team2.okb || 0);
        sheet.getRange(r, 14).setValue(ag.team2.visited || 0);
        sheet.getRange(r, 15).setValue(ag.team2.akb || 0);
        sheet.getRange(r, 16).setValue(ag.team2.rejects || 0);
        sheet.getRange(r, 17).setValue(ag.team2.sales || 0);
        sheet.getRange(r, 18).setValue(ag.team2.returns || 0); // VOZVRAT
        sheet.getRange(r, 19).setValue(ag.team2.unvisited || 0);
        
        totalUpdated++;
      });
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Yangilandi: " + totalUpdated + " ta yozuv",
      totalUpdated: totalUpdated
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Yordamchi: Varaqni nomi bo'yicha qidirish (registr, probel yoki Kirill/Lotin 'TP' farqisiz)
function findOrCreateSheet(ss, sheetTitle, agentId) {
  var sheets = ss.getSheets();
  var norm = function(str) {
    return (str || '').toLowerCase().replace(/[\\s_\\-]/g, '').replace(/tp/g, 'тп');
  };
  var t1 = norm(sheetTitle);
  var t2 = norm(agentId);
  for (var i = 0; i < sheets.length; i++) {
    var sName = norm(sheets[i].getName());
    if (sName === t1 || sName === t2) return sheets[i];
  }
  var direct = ss.getSheetByName(sheetTitle) || ss.getSheetByName(agentId);
  if (direct) return direct;
  
  // Varaq mavjud bo'lmasa, avtomatik yaratish va sarlavhalarni qo'yish
  try {
    var newSheet = ss.insertSheet(sheetTitle);
    initHeaders(newSheet);
    return newSheet;
  } catch(e) {
    return sheets[0];
  }
}

// Sarlavhalarni 1-qatorga yozish
function initHeaders(sheet) {
  var headers = ["Сана", "Територия", "ОКБ", "ВИЗИТ", "АКБ", "Отказ", "Сум", "Возрат", "Кирилмади"];
  for (var i = 0; i < headers.length; i++) {
    sheet.getRange(1, i + 1).setValue(headers[i]);
    sheet.getRange(1, i + 11).setValue(headers[i]);
  }
}

// Sanani qatordan qidirish (31.08, 31.08.2026 yoki 2026-08-31 formatlarini taniydi)
function findDateRow(sheet, targetDate, isoDate) {
  var lastRow = Math.max(sheet.getLastRow(), 50);
  var dayMonth = (targetDate || '').slice(0, 5); // Masalan: "31.08"
  
  for (var r = 2; r <= lastRow; r++) {
    var val = sheet.getRange(r, 1).getDisplayValue();
    if (!val) continue;
    var s = String(val).trim();
    if (s === targetDate || s === isoDate || s.indexOf(dayMonth) === 0) {
      return r;
    }
  }
  return -1;
}`;
  }
}
