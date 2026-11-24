import { GoogleGenAI, Type, FunctionDeclaration, Content } from '@google/genai';
import { SalesDocClient } from '../client/SalesDocClient.js';
import { getSalesDocConfig } from '../config/salesdoc.config.js';
import { LocalDb } from '../storage/localDb.js';
import {
  AiServiceStatus,
  PhotoAiAnalysisRecord,
  PhotoAiVerdict
} from '../types/salesdoc.types.js';
import { getTashkentTodayIso } from '../utils/timezone.js';
import { SalesDocAgentDeviceService } from './SalesDocAgentDeviceService.js';
import { SalesDocDailyReportService } from './SalesDocDailyReportService.js';
import { SalesDocPaymentService } from './SalesDocPaymentService.js';
import { SalesDocReferenceService } from './SalesDocReferenceService.js';
import { SalesDocVisitMonitorService, VisitAnalysisItem } from './SalesDocVisitMonitorService.js';

export const GEMINI_MODEL = 'gemini-4-hydrogen';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export interface AiChatMessageInput {
  role: 'user' | 'model';
  text: string;
}

const VALID_VERDICTS: PhotoAiVerdict[] = [
  'polka_inside',
  'store_front',
  'covered_or_dark',
  'screen_or_rephoto',
  'unclear_or_irrelevant',
  'unreadable'
];

export class GeminiAiService {
  private static instance: GeminiAiService | null = null;
  private client: SalesDocClient;
  private db: LocalDb;

  private constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  public static getInstance(client?: SalesDocClient, db?: LocalDb): GeminiAiService {
    if (!GeminiAiService.instance) {
      GeminiAiService.instance = new GeminiAiService(client, db);
    }
    return GeminiAiService.instance;
  }

  private getApiKey(): string {
    const raw = (process.env.GEMINI_API_KEY || '').trim();
    if (!raw || raw === 'MY_GEMINI_API_KEY') return '';
    return raw;
  }

  public isConfigured(): boolean {
    return this.getApiKey().length > 0;
  }

  public getStatus(): AiServiceStatus {
    const configured = this.isConfigured();
    return {
      configured,
      model: GEMINI_MODEL,
      message: configured
        ? `AI Tahlilchi faol (${GEMINI_MODEL}) — tashqi server va AI Studio muhitida ishlashga tayyor.`
        : "GEMINI_API_KEY sozlanmagan. Tashqi serverda .env fayliga yoki AI Studio Secrets bo'limiga GEMINI_API_KEY qo'shing."
    };
  }

  private createClient(): GoogleGenAI {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY topilmadi. Tashqi serverda .env fayliga yoki AI Studio Secrets bo'limiga GEMINI_API_KEY kiriting."
      );
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }

  private formatGeminiError(err: any): Error {
    const rawMsg = String(err?.message || err || "Noma'lum Gemini AI xatosi");
    let code: number | undefined = typeof err?.status === 'number' ? err.status : undefined;
    let statusStr = '';
    let detailMsg = rawMsg;

    try {
      const parsed = JSON.parse(rawMsg);
      const inner = parsed?.error || parsed;
      if (inner) {
        if (typeof inner.code === 'number') code = inner.code;
        if (typeof inner.status === 'string') statusStr = inner.status;
        if (typeof inner.message === 'string') detailMsg = inner.message;
      }
    } catch {
      // plain string message
    }

    if (code === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawMsg)) {
      return new Error(
        "Gemini API kunlik bepul limiti (429 RESOURCE_EXHAUSTED) tugagan. Iltimos, birozdan keyin urinib ko'ring yoki tashqi serverda yangi/pullik GEMINI_API_KEY ishlating."
      );
    }
    if (code === 503 || /UNAVAILABLE|high demand/i.test(rawMsg)) {
      return new Error(
        "Gemini AI serveri hozir juda band (503 UNAVAILABLE). Bir necha soniyadan so'ng qayta urinib ko'ring."
      );
    }
    if (code === 400 || code === 401 || code === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMsg)) {
      return new Error(
        `GEMINI_API_KEY noto'g'ri yoki ruxsat berilmagan (${code || statusStr || 'AUTH'}): ${detailMsg}`
      );
    }
    return new Error(`Gemini AI xatosi: ${detailMsg}`);
  }

  private isRetryableOrQuotaError(err: any): { retryable503: boolean; quotaOrBusy: boolean } {
    const raw = String(err?.message || err || '');
    const is503 = err?.status === 503 || /"code":503|UNAVAILABLE|high demand/i.test(raw);
    const is429 = err?.status === 429 || /"code":429|RESOURCE_EXHAUSTED|quota/i.test(raw);
    return {
      retryable503: is503,
      quotaOrBusy: is503 || is429
    };
  }

  private async generateContentResilient(
    ai: GoogleGenAI,
    params: { contents: any; config?: any }
  ): Promise<{ response: any; model: string }> {
    const candidates = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL];
    let lastErr: any = null;

    for (const model of candidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: params.config
          });
          return { response, model };
        } catch (err: any) {
          lastErr = err;
          const { retryable503, quotaOrBusy } = this.isRetryableOrQuotaError(err);
          if (retryable503 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          if (quotaOrBusy) {
            // Try fallback model
            break;
          }
          throw this.formatGeminiError(err);
        }
      }
    }

    throw this.formatGeminiError(lastErr);
  }

  private resolvePhotoUrl(rawUrl: string): string {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) throw new Error("Rasm manzili bo'sh");
    if (trimmed.startsWith('data:image/')) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

    const baseUrl = getSalesDocConfig().baseUrl || 'https://namdistribution.salesdoc.io/api/v2';
    const origin = new URL(baseUrl).origin;
    if (trimmed.startsWith('/')) {
      return `${origin}${trimmed}`;
    }
    return `${origin}/${trimmed}`;
  }

  private async loadImageAsInlinePart(photoUrl: string): Promise<{ mimeType: string; data: string }> {
    const resolved = this.resolvePhotoUrl(photoUrl);

    if (resolved.startsWith('data:image/')) {
      const match = resolved.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        throw new Error("Base64 rasm formati noto'g'ri");
      }
      return { mimeType: match[1], data: match[2] };
    }

    const parsed = new URL(resolved);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error("Faqat http/https rasm manzillariga ruxsat beriladi");
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      throw new Error("Ichki yoki lokal tarmoq rasm manzillariga ruxsat berilmaydi");
    }

    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'image/*,*/*;q=0.8' }
    });

    if (!res.ok) {
      throw new Error(`Rasmni yuklab bo'lmadi (HTTP ${res.status})`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      throw new Error(`Yuklangan fayl rasm emas (${contentType})`);
    }

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      throw new Error("Yuklangan rasm fayli bo'sh (0 bayt)");
    }
    if (arrayBuf.byteLength > 12 * 1024 * 1024) {
      throw new Error("Rasm hajmi 12 MB dan katta");
    }

    const mimeType = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';
    return {
      mimeType,
      data: Buffer.from(arrayBuf).toString('base64')
    };
  }

  /**
   * Real vision auditing of an agent's visit photo via gemini-4-hydrogen.
   */
  public async analyzeVisitPhoto(input: {
    photoUrl: string;
    photoId?: string;
    clientName?: string;
    agentName?: string;
    catName?: string;
    forceRefresh?: boolean;
  }): Promise<PhotoAiAnalysisRecord> {
    const primaryKey = (input.photoId || input.photoUrl || '').trim();
    if (!input.forceRefresh) {
      const cached =
        (input.photoId && this.db.getPhotoAiAnalysis(input.photoId)) ||
        (input.photoUrl && this.db.getPhotoAiAnalysis(input.photoUrl));
      if (cached) {
        return cached;
      }
    }

    const ai = this.createClient();
    const imagePart = await this.loadImageAsInlinePart(input.photoUrl);

    const claimedCat = (input.catName || '').trim();
    const claimedPolka = /polka|полка|ichi|ичи|внутри|витрина|выкладка|tovar|товар|inside/i.test(claimedCat);

    const prompt = [
      "Siz savdo agentlari tashriflarini va foto-qoidabuzarliklarni tekshiruvchi QAT'IY AI auditor sifatida rasmni chuqur tahlil qiling.",
      "Hech qachon taxmin bilan to'qib yozmang: faqat rasmda haqiqatda ko'ringan faktlarni yozing.",
      input.clientName ? `Do'kon nomi: ${input.clientName}` : '',
      input.agentName ? `Agent: ${input.agentName}` : '',
      claimedCat ? `Agent belgilagan kategoriya: "${claimedCat}"` : '',
      claimedPolka
        ? `DIQQAT: Agent bu rasmni "Do'kon ichi (Polka)" deb belgilagan! Rasmda HAQIQATDAN do'kon ichidagi mahsulot polkasi/vitrinasi/muzlatkichi bormi yoki tashqi ko'rinish/ekran/ko'cha/boshqa narsa yuklab aldaganmi, shuni QAT'IY tekshiring!`
        : '',
      "",
      "Quyidagi tasniflardan AYNAN BITTA eng mos 'verdict' ni tanlang:",
      "- 'polka_inside': Faqat DO'KON ICHIDAGI mahsulot polkalari, peshtaxta, vitrina yoki savdo muzlatkichidagi tovarlar aniq ko'rinsagina tanlang.",
      "- 'store_front': Do'konning tashqi fasadi, eshigi, tashqi devori, yozuv taxtasi (vyveska), ko'cha yoki kirish qismi (agar agent buni 'Do'kon ichi' deb yuklagan bo'lsa ham, rasm tashqi bo'lsa SHU verdict ni qo'ying!).",
      "- 'screen_or_rephoto': Boshqa telefon, kompyuter monitori, planshet ekrani yoki qog'ozdagi rasmni qayta suratga olish (ekran ramkasi, piksel to'ri/moiré, ekran yaltirashi, galereya tugmalari ko'rinsa).",
      "- 'covered_or_dark': Kamera barmoq, qo'l, kiyim, cho'ntak yoki matoh bilan yopilgan, qop-qora/juda qorong'u kadr.",
      "- 'unclear_or_irrelevant': Do'kon va mahsulot polkasiga aloqasiz rasm (masalan, asfalt, ko'cha, mashina saloni, poyafzal, shift, bo'sh devor, shaxsiy rasm yoki o'ta loyqa kadr).",
      "- 'unreadable': Rasm fayli buzilgan yoki umuman ajratib bo'lmaydigan darajada yomon.",
      "",
      "Qoidalar:",
      "- Agar rasmda haqiqiy do'kon ichi polkasi/mahsulotlari bo'lsa: isPolka=true, isOutside=false, isCoveredOrDark=false, isScreenOrRephoto=false.",
      "- Agar tashqi ko'rinish/fasad/ko'cha bo'lsa: verdict='store_front', isOutside=true, isPolka=false.",
      "- Agar ekran/qayta surat bo'lsa: verdict='screen_or_rephoto', isScreenOrRephoto=true, isPolka=false.",
      "- Agar kamera yopiq/qorong'u bo'lsa: verdict='covered_or_dark', isCoveredOrDark=true, isPolka=false.",
      "- matchesClaimedCategory: agar agent belgilagan kategoriya bilan rasm haqiqati mos kelsa true; aks holda (masalan 'Do'kon ichi (Polka)' deb tashqi bino/ekran/ko'cha/qora rasm yuklagan bo'lsa) MUTLAQO false qiling.",
      "- mismatchReasonUz: agar matchesClaimedCategory=false bo'lsa, agent qanday aldashga/xatoga yo'l qo'yganini 1 qisqa o'zbekcha gapda yozing; mos bo'lsa bo'sh satr.",
      "- detectedItems: rasmda aniq ko'ringan narsalar ro'yxati (o'zbek tilida, qisqa iboralar).",
      "- summaryUz: rasmda nima ko'ringanini o'zbek tilida 1-2 ta aniq, halol gapda tushuntiring."
    ]
      .filter(Boolean)
      .join('\n');

    const { response, model: usedModel } = await this.generateContentResilient(ai, {
      contents: [
        {
          inlineData: {
            mimeType: imagePart.mimeType,
            data: imagePart.data
          }
        },
        prompt
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: {
              type: Type.STRING,
              enum: VALID_VERDICTS
            },
            confidence: { type: Type.INTEGER },
            isPolka: { type: Type.BOOLEAN },
            isOutside: { type: Type.BOOLEAN },
            isCoveredOrDark: { type: Type.BOOLEAN },
            isScreenOrRephoto: { type: Type.BOOLEAN },
            matchesClaimedCategory: { type: Type.BOOLEAN },
            mismatchReasonUz: { type: Type.STRING },
            detectedItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            summaryUz: { type: Type.STRING }
          },
          required: [
            'verdict',
            'confidence',
            'isPolka',
            'isOutside',
            'isCoveredOrDark',
            'isScreenOrRephoto',
            'matchesClaimedCategory',
            'detectedItems',
            'summaryUz'
          ]
        }
      }
    });

    const rawText = (response.text || '').trim();
    if (!rawText) {
      throw new Error("Gemini AI rasm tahlili uchun bo'sh javob qaytardi");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("Gemini AI JSON javobini o'qib bo'lmadi");
    }

    const verdict: PhotoAiVerdict = VALID_VERDICTS.includes(parsed.verdict)
      ? parsed.verdict
      : 'unclear_or_irrelevant';

    const confidenceNum = Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence))))
      : 50;

    // Authoritative normalization from verdict (verdict wins over raw booleans)
    const isCoveredOrDark = verdict === 'covered_or_dark' || Boolean(parsed.isCoveredOrDark);
    const isScreenOrRephoto = !isCoveredOrDark && (verdict === 'screen_or_rephoto' || Boolean(parsed.isScreenOrRephoto));
    const isPolka = !isCoveredOrDark && !isScreenOrRephoto && verdict === 'polka_inside';
    const isOutside = !isCoveredOrDark && !isScreenOrRephoto && !isPolka && (verdict === 'store_front' || Boolean(parsed.isOutside));

    const categoryMismatchedByRule = (claimedPolka && !isPolka) || isScreenOrRephoto;
    const matchesClaimedCategory = categoryMismatchedByRule
      ? false
      : parsed.matchesClaimedCategory !== false;

    let mismatchReasonUz = String(parsed.mismatchReasonUz || '').trim();
    if (!matchesClaimedCategory && !mismatchReasonUz) {
      if (isScreenOrRephoto) {
        mismatchReasonUz = "Ekran yoki boshqa suratdan qayta olingan soxta rasm aniqlandi.";
      } else if (isCoveredOrDark) {
        mismatchReasonUz = "Kamera yopilgan yoki qorong'u kadr yuklangan.";
      } else if (isOutside) {
        mismatchReasonUz = "Agent \"Do'kon ichi (Polka)\" deb belgilagan, lekin rasm do'konning tashqi tomonidan olingan.";
      } else {
        mismatchReasonUz = "Agent \"Do'kon ichi (Polka)\" deb belgilagan, lekin rasmda do'kon ichidagi mahsulot polkasi yo'q.";
      }
    }

    const record: PhotoAiAnalysisRecord = {
      photoKey: primaryKey,
      photoUrl: input.photoUrl,
      verdict,
      confidence: confidenceNum,
      isPolka,
      isOutside,
      isCoveredOrDark,
      isScreenOrRephoto,
      matchesClaimedCategory,
      ...(mismatchReasonUz ? { mismatchReasonUz } : {}),
      detectedItems: Array.isArray(parsed.detectedItems)
        ? parsed.detectedItems.map((x: any) => String(x)).filter(Boolean).slice(0, 10)
        : [],
      summaryUz: String(parsed.summaryUz || "Rasm tahlil qilindi.").trim(),
      model: usedModel,
      analyzedAt: new Date().toISOString()
    };

    return this.db.savePhotoAiAnalysis([input.photoId || '', input.photoUrl], record);
  }

  /**
   * Batch audit photos for visits using Gemini Vision, reusing persisted cache where present.
   */
  public async analyzeVisitsBatch(
    visits: VisitAnalysisItem[],
    options: { onlyUnanalyzed?: boolean; maxPhotos?: number; forceRefresh?: boolean } = {}
  ): Promise<{
    analyzedCount: number;
    skippedCachedCount: number;
    failedCount: number;
    results: PhotoAiAnalysisRecord[];
    errors: Array<{ photoUrl: string; error: string }>;
  }> {
    const maxPhotos = Math.min(30, Math.max(1, options.maxPhotos ?? 12));
    const onlyUnanalyzed = options.onlyUnanalyzed ?? true;

    const results: PhotoAiAnalysisRecord[] = [];
    const errors: Array<{ photoUrl: string; error: string }> = [];
    let analyzedCount = 0;
    let skippedCachedCount = 0;
    let failedCount = 0;

    for (const v of visits) {
      for (const p of v.photos || []) {
        if (!p.url) continue;
        const cached = this.db.getPhotoAiAnalysis(p.id) || this.db.getPhotoAiAnalysis(p.url);
        if (cached && onlyUnanalyzed && !options.forceRefresh) {
          skippedCachedCount++;
          results.push(cached);
          continue;
        }
        if (analyzedCount >= maxPhotos) break;

        try {
          const rec = await this.analyzeVisitPhoto({
            photoUrl: p.url,
            photoId: p.id,
            clientName: v.client_name,
            agentName: v.agent_name,
            catName: p.cat_name,
            forceRefresh: options.forceRefresh
          });
          analyzedCount++;
          results.push(rec);
        } catch (err: any) {
          failedCount++;
          errors.push({ photoUrl: p.url, error: err.message });
        }
      }
      if (analyzedCount >= maxPhotos) break;
    }

    return {
      analyzedCount,
      skippedCachedCount,
      failedCount,
      results,
      errors
    };
  }

  private getAnalystToolDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'get_daily_report',
        description:
          "SalesDoc kunlik savdo, OKB, vizit, AKB, otkaz, vozvrat (qaytarish) va kirmagan do'konlar hisobotini berilgan sana (YYYY-MM-DD) uchun oladi. Sana berilmasa bugungi Toshkent sanasi olinadi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: {
              type: Type.STRING,
              description: "Sana YYYY-MM-DD formatida (masalan 2026-09-07). Bo'sh bo'lsa bugungi kun."
            }
          }
        }
      },
      {
        name: 'get_visit_monitoring',
        description:
          "Agentlarning tashriflari, GPS masofasi, polka/tashqi/kamera-yopiq rasmlari va AI foto auditi natijalarini oladi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            dateFrom: { type: Type.STRING, description: 'Boshlanish sanasi YYYY-MM-DD' },
            dateTo: { type: Type.STRING, description: 'Tugash sanasi YYYY-MM-DD' },
            agentId: { type: Type.STRING, description: "Agent ID (masalan d0_1) yoki 'all'" }
          }
        }
      },
      {
        name: 'get_agent_device_analysis',
        description:
          "Agentlarning nechta qurilmadan buyurtma yuborayotgani (1-qurilma vs 2-qurilma) va vaqt to'qnashuvlari (kolliziya) tahlilini oladi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            forceRefresh: {
              type: Type.BOOLEAN,
              description: "SalesDoc dan qayta yuklash kerakmi (odatda false)"
            }
          }
        }
      },
      {
        name: 'get_inventory_and_client_debts',
        description:
          "Mahalliy bazadagi mijozlar, ularning qarzdorlik balanslari, ombor zaxiralari va to'lovlar ro'yxatini qaytaradi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            includeZeroBalance: {
              type: Type.BOOLEAN,
              description: "Qarzdorligi 0 bo'lgan mijozlarni ham qo'shish (true/false)"
            }
          }
        }
      },
      {
        name: 'get_cat12_reconciliation',
        description:
          "SM-Причисленя Дукон (d0_12) toifasidagi mijozlarning balans va otgruzka tafovutlari auditi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            includeOrders: {
              type: Type.BOOLEAN,
              description: 'Mijoz buyurtma tafsilotlarini kiritish'
            }
          }
        }
      },
      {
        name: 'get_salesdoc_orders',
        description:
          "SalesDoc mahalliy/sinxronlangan zakazlari ro'yxati (status, agent, summa, mijoz bo'yicha).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            agentId: { type: Type.STRING, description: "Agent ID bo'yicha filtr (ixtiyoriy)" },
            status: { type: Type.STRING, description: "pending | confirmed | delivered | closed | cancelled" },
            limit: { type: Type.INTEGER, description: 'Maksimal qaytariladigan qatorlar soni (default 40)' }
          }
        }
      },
      {
        name: 'get_agent_full_control_report',
        description:
          "Agentlarni to'liq nazorat qilish hisoboti: SalesDoc profil faolligi (active), kunlik savdo/OKB/AKB/vozvrat, GPS/foto/AI soxta-polka qoidabuzarliklari va 2-qurilma to'qnashuvlarini bitta nazorat jadvalida birlashtiradi. Shuningdek SalesDoc API va qurilma boshqaruv imkoniyatlari hamda cheklovlarini ham qaytaradi.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            agentId: { type: Type.STRING, description: "Ma'lum bir agent ID (masalan d0_1) yoki 'all'" },
            date: { type: Type.STRING, description: "Sana YYYY-MM-DD formatida (bo'sh bo'lsa bugungi kun)" }
          }
        }
      },
      {
        name: 'set_agent_salesdoc_status',
        description:
          "Agentning SalesDoc hisobini faollashtiradi (active=true) yoki bloklaydi/o'chiradi (active=false) — setAgent API orqali. Faqat foydalanuvchi aniq bir agentni bloklash yoki faollashtirishni so'ragandagina ishlating.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            agentId: { type: Type.STRING, description: "Agent ID (masalan d0_1, d0_2...)" },
            active: { type: Type.BOOLEAN, description: "true = faollashtirish, false = bloklash" }
          },
          required: ['agentId', 'active']
        }
      }
    ];
  }

  private async executeAnalystTool(name: string, args: Record<string, any>): Promise<any> {
    const dailyService = SalesDocDailyReportService.getInstance(this.client, this.db);
    const visitService = new SalesDocVisitMonitorService(this.client, this.db);
    const deviceService = SalesDocAgentDeviceService.getInstance();
    const paymentService = new SalesDocPaymentService(this.client, this.db);
    const refService = new SalesDocReferenceService(this.client);

    try {
      if (name === 'get_daily_report') {
        const date = typeof args.date === 'string' && args.date.trim() ? args.date.trim() : getTashkentTodayIso();
        const report = await dailyService.generateDailyReport(date);
        return {
          date: report.date,
          summary: report.summary,
          apiErrors: report.apiErrors || [],
          reports: report.reports.map((r) => ({
            agentId: r.agentId,
            agentName: r.agentName,
            worked: r.worked,
            teamMode: r.teamMode,
            territories: r.territories,
            okbTotal: r.okbTotal,
            visitedCount: r.visitedCount,
            unvisitedCount: r.unvisitedCount,
            unvisitedSample: r.team1.unvisitedClients.slice(0, 15).map((c) => c.name),
            team1: {
              akbCount: r.team1.akbCount,
              rejectsCount: r.team1.rejectsCount,
              totalSalesSum: r.team1.totalSalesSum,
              totalReturnsSum: r.team1.totalReturnsSum
            },
            team2: {
              akbCount: r.team2.akbCount,
              rejectsCount: r.team2.rejectsCount,
              totalSalesSum: r.team2.totalSalesSum,
              totalReturnsSum: r.team2.totalReturnsSum
            }
          }))
        };
      }

      if (name === 'get_visit_monitoring') {
        const res = await visitService.analyzeVisits({
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
          agentId: args.agentId,
          limit: 60
        });
        return {
          apiStatus: res.apiStatus,
          summary: res.summary,
          items: res.items.slice(0, 40).map((it) => ({
            visitKey: it.visitKey,
            agentName: it.agent_name,
            clientName: it.client_name,
            date: it.date,
            status: it.status,
            statusLabel: it.status_label,
            distanceMeters: it.distance_meters,
            distanceSource: it.distance_source,
            isDistant: it.is_distant,
            hasPolkaPhoto: it.has_polka_photo,
            hasCoveredCameraPhoto: it.has_covered_camera_photo,
            shouldAlert: it.should_alert,
            alertReason: it.alert_reason,
            telegramSent: it.telegram_sent,
            photosCount: it.photos.length,
            aiPhotoVerdicts: it.photos
              .filter((p) => p.ai_analysis)
              .map((p) => ({
                catName: p.cat_name,
                verdict: p.ai_analysis?.verdict,
                confidence: p.ai_analysis?.confidence,
                summaryUz: p.ai_analysis?.summaryUz
              }))
          }))
        };
      }

      if (name === 'get_agent_device_analysis') {
        const res = await deviceService.analyzeAgentsAndDevices(Boolean(args.forceRefresh));
        return {
          summary: res.summary,
          agents: res.agents.map((a) => ({
            agentId: a.agentId,
            agentName: a.agentName,
            totalOrders: a.totalOrders,
            totalRevenue: a.totalRevenue,
            isDualDevice: a.isDualDevice,
            collisionsCount: a.collisionsCount,
            dev1Orders: a.dev1.ordersCount,
            dev2Orders: a.dev2.ordersCount,
            collisions: a.collisions.slice(0, 10)
          }))
        };
      }

      if (name === 'get_inventory_and_client_debts') {
        const clients = this.db.getClients();
        const stock = this.db.getStock();
        const payments = this.db.getPayments();
        const includeZero = Boolean(args.includeZeroBalance);
        const filteredClients = includeZero
          ? clients
          : clients.filter((c) => c.balance !== 0);

        const debtors = filteredClients
          .filter((c) => c.balance < 0)
          .sort((a, b) => a.balance - b.balance)
          .slice(0, 30)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance, phone: c.phone }));

        return {
          clientsTotalCount: clients.length,
          debtorsCount: clients.filter((c) => c.balance < 0).length,
          totalDebtAmount: clients.reduce((s, c) => (c.balance < 0 ? s + Math.abs(c.balance) : s), 0),
          topDebtors: debtors,
          stockItemsCount: stock.length,
          lowStockItems: stock.filter((s) => s.quantity <= 5).slice(0, 20),
          paymentsCount: payments.length,
          recentPaymentsSum: payments.slice(0, 20).reduce((s, p) => s + p.amount, 0)
        };
      }

      if (name === 'get_cat12_reconciliation') {
        const recon = await paymentService.getCat12Reconciliation();
        return {
          category: recon.category,
          summary: recon.summary,
          clients: recon.clients.slice(0, 30).map((c) => ({
            clientId: c.clientId,
            clientName: c.clientName,
            shippedOrdersCount: c.shippedOrdersCount,
            shippedOrdersSum: c.shippedOrdersSum,
            currentBalance: c.currentBalance,
            netDebt: c.netDebt,
            ...(args.includeOrders ? { orders: c.orders.slice(0, 5) } : {})
          }))
        };
      }

      if (name === 'get_salesdoc_orders') {
        let orders = this.db.getOrders();
        if (args.agentId && args.agentId !== 'all') {
          orders = orders.filter((o) => o.agent_id === args.agentId);
        }
        if (args.status) {
          orders = orders.filter((o) => o.status === args.status);
        }
        const limit = Math.min(100, Math.max(1, Number(args.limit || 40)));
        return {
          totalMatched: orders.length,
          totalSum: orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
          orders: orders.slice(0, limit).map((o) => ({
            id: o.id,
            salesdocId: o.salesdoc_id,
            customerName: o.customer_name,
            agentName: o.agent_name,
            orderDate: o.order_date,
            status: o.status,
            totalAmount: o.total_amount,
            itemsCount: o.items.length
          }))
        };
      }

      if (name === 'get_agent_full_control_report') {
        const targetDate = typeof args.date === 'string' && args.date.trim() ? args.date.trim() : getTashkentTodayIso();
        const targetAgent = typeof args.agentId === 'string' && args.agentId.trim() ? args.agentId.trim() : 'all';

        const [agentsRes, dailyReport, visitsRes, devicesRes] = await Promise.all([
          refService.getAgents().catch((e: any) => ({ error: e.message, result: { agent: [] } })),
          dailyService.generateDailyReport(targetDate).catch((e: any) => ({ error: e.message, reports: [], apiErrors: [e.message] })),
          visitService.analyzeVisits({ dateFrom: targetDate, dateTo: targetDate, agentId: targetAgent }).catch((e: any) => ({ error: e.message, items: [], summary: null })),
          deviceService.analyzeAgentsAndDevices(false).catch((e: any) => ({ error: e.message, agents: [] }))
        ]);

        const rawAgents: any[] = (agentsRes as any)?.result?.agent || [];
        const dailyReports: any[] = (dailyReport as any)?.reports || [];
        const visitItems: VisitAnalysisItem[] = (visitsRes as any)?.items || [];
        const deviceAgents: any[] = (devicesRes as any)?.agents || [];

        const agentIdsSet = new Set<string>();
        rawAgents.forEach((a) => agentIdsSet.add(String(a.SD_id || a.CS_id || a.id || '')));
        dailyReports.forEach((r) => agentIdsSet.add(String(r.agentId || '')));
        deviceAgents.forEach((d) => agentIdsSet.add(String(d.agentId || '')));
        agentIdsSet.delete('');

        const profiles = Array.from(agentIdsSet)
          .filter((id) => targetAgent === 'all' || id === targetAgent)
          .map((id) => {
            const raw = rawAgents.find((a) => (a.SD_id || a.CS_id || a.id) === id);
            const day = dailyReports.find((r) => r.agentId === id);
            const dev = deviceAgents.find((d) => d.agentId === id);
            const myVisits = visitItems.filter((v) => v.agent_id === id);
            const myViolations = myVisits.filter((v) => v.should_alert);
            return {
              agentId: id,
              name: raw?.name || day?.agentName || dev?.agentName || id,
              login: raw?.user?.[0]?.login || '',
              salesDocActive: raw ? (raw.active === true || raw.active === 'Y' || raw.active === 1) : null,
              workedToday: day?.worked ?? null,
              okbTotal: day?.okbTotal ?? 0,
              visitedCount: day?.visitedCount ?? myVisits.length,
              unvisitedCount: day?.unvisitedCount ?? 0,
              totalSalesSum: (day?.team1?.totalSalesSum || 0) + (day?.team2?.totalSalesSum || 0),
              totalReturnsSum: (day?.team1?.totalReturnsSum || 0) + (day?.team2?.totalReturnsSum || 0),
              violationsTotal: myViolations.length,
              fakePolkaViolations: myVisits.filter((v) => v.status === 'violation_fake_polka').length,
              coveredCameraViolations: myVisits.filter((v) => v.status === 'violation_covered_camera').length,
              distantViolations: myVisits.filter((v) => v.status === 'violation_distant_no_polka').length,
              isDualDevice: dev?.isDualDevice ?? false,
              deviceCollisionsCount: dev?.collisionsCount ?? 0
            };
          });

        return {
          date: targetDate,
          totalAgents: profiles.length,
          agents: profiles,
          apiErrors: [
            ...((dailyReport as any)?.apiErrors || []),
            ...((agentsRes as any)?.error ? [(agentsRes as any).error] : [])
          ],
          capabilitiesAndBoundaries: {
            supportedRealControls: [
              "SalesDoc hisobini faollashtirish/bloklash (setAgent active: true/false)",
              "Gemini Vision orqali soxta 'Do'kon ichi (Polka)', tashqi bino, ekran rasmi va yopilgan kamerani aniqlash",
              "100m GPS nazorati va 2-qurilma / vaqt to'qnashuvini aniqlash",
              "Telegram guruhlarga real-vaqtda ogohlantirish yuborish"
            ],
            unsupportedHardwareMdm: [
              "Agent telefonini masofadan qulflash (screen lock) yoki o'chirish mumkin emas",
              "Telefon GPS/kamera sozlamalarini OS darajasida majburan yoqish/o'chirish mumkin emas",
              "Qurilma IMEI/batareya/o'rnatilgan ilovalarni ko'rish mumkin emas (buning uchun Android MDM yechimi kerak)"
            ]
          }
        };
      }

      if (name === 'set_agent_salesdoc_status') {
        const agentId = String(args.agentId || '').trim();
        if (!agentId || typeof args.active !== 'boolean') {
          return { error: "agentId va active (boolean) majburiy" };
        }
        const result = await refService.setAgentActiveStatus(agentId, args.active);
        this.db.addSyncLog({
          method: 'setAgent',
          direction: 'outbound',
          entity: 'reference',
          records_processed: 1,
          records_failed: 0,
          status: 'success',
          duration_ms: 0,
          dry_run: this.client.getConfig().dryRun
        });
        return {
          success: true,
          ...result,
          dryRun: this.client.getConfig().dryRun
        };
      }

      return { error: `Noma'lum vosita: ${name}` };
    } catch (err: any) {
      return {
        error: err.message || "Ma'lumot olishda xatolik yuz berdi",
        hint: "Agar SalesDoc 401/avtorizatsiya xatosi bo'lsa, foydalanuvchiga login/parol yoki tokenni yangilash kerakligini ochiq ayting."
      };
    }
  }

  /**
   * Grounded Business & Operations Analyst chat with function calling.
   */
  public async askBusinessAnalyst(
    question: string,
    history: AiChatMessageInput[] = []
  ): Promise<{
    answer: string;
    model: string;
    toolsUsed: string[];
    generatedAt: string;
  }> {
    const trimmed = (question || '').trim();
    if (!trimmed) {
      throw new Error("Savol matni bo'sh bo'lmasligi kerak");
    }

    const ai = this.createClient();
    const todayIso = getTashkentTodayIso();

    const systemInstruction = [
      "Siz SalesDoc savdo va distribyutsiya tizimining rasmiy AI Biznes va Operatsion Tahlilchisisiz.",
      `Bugungi Toshkent sanasi: ${todayIso}. Barcha javoblarni aniq, lo'nda va tushunarli O'ZBEK tilida bering.`,
      "",
      "MUTLAQO HALOLLIK VA ANIQLIK QOIDALARI (BUZISH TAQIQLANADI):",
      "1. HECH QACHON raqamlar, do'kon nomlari, agent natijalari, masofa metrlari, qarzdorliklar yoki holatlarni o'zingizdan to'qib chiqarmang.",
      "2. Har doim savolga javob berishdan oldin tegishli vositalarni (tools) chaqiring va FAQAT vositadan qaytgan real faktlarga tayaning.",
      "3. Agar vosita xatolik qaytarsa (masalan SalesDoc 401 Invalid token, tarmoq xatosi) yoki ma'lumot topilmasa (0 ta yozuv, bo'sh baza), buni YASHIRMANG — qaysi ma'lumot topilmaganini va buning sababini ochiq ayting.",
      "4. Agar 'apiErrors' maydoni bo'sh bo'lmasa, hisobot qisman yoki to'liq yuklanmaganini albatta eslatib o'ting.",
      "5. Agent qurilmasini boshqarish haqida so'ralsa, halol bo'ling: SalesDoc API faqat agent akkauntini bloklash/faollashtirish (setAgent) va 2-qurilma/foto/GPS nazoratini bera oladi; telefon ekranini qulflash yoki OS/kamerani masofadan boshqarish (MDM) imkoniyati yo'qligini ochiq ayting.",
      "6. Pul summalarini so'm formatida (masalan 1,250,000 so'm) ko'rsating."
    ].join('\n');

    const contents: Content[] = [];
    for (const msg of history.slice(-12)) {
      if (!msg.text || !msg.text.trim()) continue;
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text.trim() }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: trimmed }]
    });

    const toolsUsed: string[] = [];
    const maxRounds = 6;
    let activeModel = GEMINI_MODEL;

    for (let round = 0; round < maxRounds; round++) {
      const { response, model: usedModel } = await this.generateContentResilient(ai, {
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: this.getAnalystToolDeclarations() }]
        }
      });
      activeModel = usedModel;

      const candidateContent = response.candidates?.[0]?.content;
      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        const answer = (response.text || '').trim();
        if (!answer) {
          throw new Error("AI javob bera olmadi (bo'sh natija qaytdi)");
        }
        return {
          answer,
          model: activeModel,
          toolsUsed: Array.from(new Set(toolsUsed)),
          generatedAt: new Date().toISOString()
        };
      }

      if (candidateContent) {
        contents.push(candidateContent);
      }

      const responseParts: any[] = [];
      for (const call of functionCalls) {
        const callName = call.name || '';
        toolsUsed.push(callName);
        const toolResult = await this.executeAnalystTool(callName, (call.args || {}) as Record<string, any>);
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: { result: toolResult }
          }
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts
      });
    }

    throw new Error("AI tahlil davomida juda ko'p vosita so'rovlari bajarildi. Savolni qisqaroq qilib qayta bering.");
  }
}
