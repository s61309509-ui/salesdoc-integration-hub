import { SalesDocClient } from '../client/SalesDocClient.js';
import { LocalDb } from '../storage/localDb.js';
import { PhotoAiAnalysisRecord } from '../types/salesdoc.types.js';
import { getTashkentTimeParts, getTashkentTodayIso } from '../utils/timezone.js';

export interface PhotoInfo {
  id: string;
  url: string;
  cat_id: string;
  cat_name: string;
  date: string;
  claimed_polka?: boolean;
  is_polka: boolean;
  is_outside: boolean;
  is_distant_photo?: boolean;
  is_covered_camera?: boolean;
  is_screen_or_rephoto?: boolean;
  is_category_mismatch?: boolean;
  mismatch_reason?: string;
  tag_reason?: string;
  ai_analysis?: PhotoAiAnalysisRecord;
}

export interface VisitAnalysisItem {
  visitKey: string;
  agent_id: string;
  agent_name: string;
  client_id: string;
  client_name: string;
  category_name: string;
  date: string;
  start_date?: string;
  end_date?: string;
  planned: number;
  visited: number;
  gps_visit: number;
  distance_meters: number | null;
  distance_source: 'exact' | 'gps_flag_only' | 'unknown';
  is_distant: boolean;
  has_order: number;
  order_summa: number;
  photos: PhotoInfo[];
  photo_categories: string;
  photo_dates: string;
  has_polka_photo: boolean;
  has_outside_photo: boolean;
  has_covered_camera_photo?: boolean;
  has_fake_polka_photo?: boolean;
  equipment: string;
  last_order_date?: string;
  last_order_categories?: string;
  last_order_summa?: string;
  status:
    | 'valid'
    | 'valid_polka_exception'
    | 'violation_distant_no_polka'
    | 'violation_missing_polka'
    | 'violation_no_photos'
    | 'violation_covered_camera'
    | 'violation_fake_polka';
  status_label: string;
  violation_type: 'none' | 'distant_no_polka' | 'missing_polka' | 'no_photos' | 'covered_camera' | 'fake_polka';
  should_alert: boolean;
  alert_title: string;
  alert_reason: string;
  telegram_sent: boolean;
  telegram_sent_at?: string;
  target_chat_id?: string;
}

export interface VisitMonitorSummary {
  totalVisits: number;
  visitedCount: number;
  withPhotosCount: number;
  distantVisitsCount: number;
  polkaExceptionsCount: number; // Distant but had polka photo (Rule exception: don't alert!)
  violationsDistantNoPolkaCount: number; // Violations: >100m without polka photo
  violationsCoveredCameraCount: number; // Violations: Camera lens covered / dark fake photo
  violationsFakePolkaCount: number; // Violations: Claimed Polka/inside or re-photo, but AI detected mismatch
  violationsNoPhotosCount: number;
  violationsMissingPolkaCount: number;
  aiAuditedPhotosCount: number;
  totalViolationsCount: number;
  telegramSentCount: number;
}

export class SalesDocVisitMonitorService {
  private static instance: SalesDocVisitMonitorService | null = null;
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  public static getInstance(): SalesDocClientServiceStatic {
    if (!SalesDocVisitMonitorService.instance) {
      SalesDocVisitMonitorService.instance = new SalesDocVisitMonitorService();
    }
    return SalesDocVisitMonitorService.instance as any;
  }

  /**
   * Format currency for display: e.g. 814800 -> "814,800"
   */
  private formatSum(num: number): string {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Format datetime for Telegram photo report: "YYYY-MM-DD HH:mm:ss" -> "HH:mm DD-MM-YYYY"
   */
  private formatPhotoTime(dtStr: string): string {
    if (!dtStr) return '';
    try {
      const parts = dtStr.trim().split(' ');
      if (parts.length === 2) {
        const [datePart, timePart] = parts;
        const timeShort = timePart.substring(0, 5); // HH:mm
        const [y, m, d] = datePart.split('-');
        return `${timeShort} ${d}-${m}-${y}`;
      }
    } catch {
      // fallback
    }
    return dtStr;
  }

  /**
   * Evaluate a single photo combining SalesDoc category, manual flags, and authoritative Gemini Vision AI verdict.
   */
  private evaluatePhotoInfo(
    p: any,
    pId: string,
    catId: string,
    catName: string,
    formattedDate: string,
    isDistantVisit: boolean,
    photoFlags: Record<string, any>,
    photoAiMap: Record<string, PhotoAiAnalysisRecord>
  ): PhotoInfo {
    const flagInfo = photoFlags[pId] || (p.url ? photoFlags[p.url] : undefined);
    const aiAnalysis = photoAiMap[pId] || (p.url ? photoAiMap[p.url] : undefined);

    const claimedPolka = Boolean(
      catId === 'd0_1' ||
      /polka|полка|ichi|ичи|внутри|витрина|выкладка|tovar|товар|dokon ichi|do`kon ichi|do'kon ichi|inside/i.test(catName)
    );

    const isCoveredCamera = Boolean(
      flagInfo?.is_covered_camera ||
      p?.is_covered_camera ||
      aiAnalysis?.isCoveredOrDark ||
      aiAnalysis?.verdict === 'covered_or_dark' ||
      /yopiq|qora|soxta|barmoq|dark|black|cover|yopilgan/i.test(catName) ||
      /yopiq|qora|soxta|barmoq|dark|black|cover|yopilgan/i.test(p?.url || '')
    );

    const isScreenOrRephoto = !isCoveredCamera && Boolean(
      aiAnalysis?.verdict === 'screen_or_rephoto' ||
      aiAnalysis?.isScreenOrRephoto
    );

    // Authoritative AI rule: when AI analyzed this photo, AI's pixel verdict overrides agent's cat_id='d0_1' tag
    const isPolka = aiAnalysis
      ? !isCoveredCamera && !isScreenOrRephoto && Boolean(aiAnalysis.isPolka) && aiAnalysis.verdict === 'polka_inside'
      : !isCoveredCamera && (
          claimedPolka ||
          /polka|полка|ichi|inside|shop_inside/i.test(p?.url || '')
        );

    const isOutside = aiAnalysis
      ? !isCoveredCamera && !isScreenOrRephoto && !isPolka && (
          Boolean(aiAnalysis.isOutside) ||
          aiAnalysis.verdict === 'store_front' ||
          catId === 'd0_2' ||
          /tashqi|do`kon|do'kon|dokon|fasad|outside|front/i.test(catName)
        )
      : (
          catId === 'd0_2' ||
          /tashqi|do`kon|do'kon|dokon|fasad|outside|front/i.test(catName)
        );

    const isCategoryMismatch = Boolean(
      aiAnalysis &&
      !isCoveredCamera &&
      ((claimedPolka && !isPolka) || aiAnalysis.matchesClaimedCategory === false || isScreenOrRephoto)
    );

    const mismatchReason = isCategoryMismatch
      ? (
          aiAnalysis?.mismatchReasonUz ||
          (isScreenOrRephoto
            ? "Ekran yoki boshqa rasmdan qayta suratga olingan (soxta rasm)."
            : isOutside
              ? "Agent \"Do'kon ichi (Polka)\" deb belgilagan, lekin AI rasm do'kon tashqarisidan olinganini aniqladi."
              : "Agent \"Do'kon ichi (Polka)\" deb belgilagan, lekin rasmda haqiqiy ichki mahsulot polkasi aniqlanmadi.")
        )
      : undefined;

    const isDistantPhoto = Boolean(
      flagInfo?.is_distant_photo ||
      p?.is_distant_photo ||
      (isDistantVisit && isOutside) ||
      /uzoq|masofa|distant|far/i.test(catName)
    );

    return {
      id: pId,
      url: p?.url || '',
      cat_id: catId,
      cat_name: catName,
      date: formattedDate,
      claimed_polka: claimedPolka,
      is_polka: isPolka,
      is_outside: isOutside,
      is_distant_photo: isDistantPhoto,
      is_covered_camera: isCoveredCamera,
      is_screen_or_rephoto: isScreenOrRephoto,
      is_category_mismatch: isCategoryMismatch,
      ...(mismatchReason ? { mismatch_reason: mismatchReason } : {}),
      tag_reason: isCoveredCamera
        ? (aiAnalysis?.summaryUz || 'Kamerani yopib olingan rasm')
        : isCategoryMismatch
          ? (mismatchReason || aiAnalysis?.summaryUz)
          : isDistantPhoto
            ? 'Uzoqdan olingan rasm'
            : aiAnalysis?.summaryUz,
      ai_analysis: aiAnalysis
    };
  }

  /**
   * Evaluate visit compliance rules consistently across all visit sources.
   */
  private evaluateVisitStatus(params: {
    photos: PhotoInfo[];
    visited: number;
    isDistant: boolean;
    distDisplay: string;
    hasNoVisitRow?: boolean;
  }): {
    hasCoveredCameraPhoto: boolean;
    hasFakePolkaPhoto: boolean;
    hasPolkaPhoto: boolean;
    hasOutsidePhoto: boolean;
    status: VisitAnalysisItem['status'];
    statusLabel: string;
    violationType: VisitAnalysisItem['violation_type'];
    shouldAlert: boolean;
    alertTitle: string;
    alertReason: string;
  } {
    const { photos, visited, isDistant, distDisplay, hasNoVisitRow } = params;
    const hasCoveredCameraPhoto = photos.some((p) => p.is_covered_camera);
    const hasFakePolkaPhoto = photos.some((p) => p.is_category_mismatch || p.is_screen_or_rephoto);
    const hasPolkaPhoto = photos.some((p) => p.is_polka);
    const hasOutsidePhoto = photos.some((p) => p.is_outside);

    if (hasCoveredCameraPhoto) {
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'violation_covered_camera',
        statusLabel: "🚫 Kamerani yopib / to'sib olingan rasm",
        violationType: 'covered_camera',
        shouldAlert: true,
        alertTitle: 'Kamerani yopib olingan rasm',
        alertReason:
          photos.find((p) => p.is_covered_camera)?.tag_reason ||
          "Agent do'kon polkasini rasmga olmasdan kamera linzasini barmoq yoki qorong'u bilan yopib rasm yuklagan!"
      };
    }

    if (hasFakePolkaPhoto) {
      const mismatchPhoto = photos.find((p) => p.is_category_mismatch || p.is_screen_or_rephoto);
      const aiSummary = mismatchPhoto?.ai_analysis?.summaryUz;
      const reason =
        mismatchPhoto?.mismatch_reason ||
        aiSummary ||
        "Agent \"Do'kon ichi (Polka)\" deb yuklagan rasm aslida ichki polka emas!";
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'violation_fake_polka',
        statusLabel: '🎭 Soxta "Do\'kon ichi" rasmi (AI Aniqladi)',
        violationType: 'fake_polka',
        shouldAlert: true,
        alertTitle: "Soxta \"Do'kon ichi (Polka)\" / Mos kelmaydigan rasm",
        alertReason: aiSummary && mismatchPhoto?.mismatch_reason && aiSummary !== mismatchPhoto.mismatch_reason
          ? `${mismatchPhoto.mismatch_reason} AI izohi: ${aiSummary}`
          : reason
      };
    }

    if (isDistant && hasPolkaPhoto) {
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'valid_polka_exception',
        statusLabel: "To'g'ri (Do'kon ichi / Polka rasmi bor — guruhga tashlanmaydi)",
        violationType: 'none',
        shouldAlert: false,
        alertTitle: "Do'kon ichi rasmi mavjud",
        alertReason: "Do'konning ichki polkasi rasmi mavjud bo'lgani sababli guruhga tashlanmaydi."
      };
    }

    if (isDistant && !hasPolkaPhoto) {
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'violation_distant_no_polka',
        statusLabel: `📍 Do'kondan uzoqda vizit qilingan (${distDisplay})`,
        violationType: 'distant_no_polka',
        shouldAlert: true,
        alertTitle: "Do'kondan uzoqda vizit qilingan",
        alertReason: `100m dan uzoqda vizit qilingan (${distDisplay}) va polkani rasmi olinmagan (faqat do'kon uzoqdan rasmga olingan)!`
      };
    }

    if (photos.length === 0 || visited === 0) {
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'violation_no_photos',
        statusLabel: "Tashrif qilinmagan (Kechki ro'yxatda yuboriladi)",
        violationType: 'no_photos',
        shouldAlert: false,
        alertTitle: "Do'konga tashrif buyurilmagan",
        alertReason: "Do'konga tashrif qilinmagan, agent bormagan (Foto-hisobot olinmagan). Kechki umumiy ro'yxatda yuboriladi."
      };
    }

    if (hasPolkaPhoto) {
      return {
        hasCoveredCameraPhoto,
        hasFakePolkaPhoto,
        hasPolkaPhoto,
        hasOutsidePhoto,
        status: 'valid',
        statusLabel: hasNoVisitRow
          ? "To'g'ri (Polka rasmi mavjud)"
          : "To'g'ri tashrif (Polka va ichki rasm mavjud)",
        violationType: 'none',
        shouldAlert: false,
        alertTitle: hasNoVisitRow ? "Do'kon ichi rasmi mavjud" : "Tashrif me'yorida",
        alertReason: hasNoVisitRow
          ? "Do'kon ichidan Polka rasmi mavjud (GPS ma'lumoti getVisit orqali kelmagan)."
          : "Tashrif GPS mezonlari va foto-hisobot talablariga javob beradi."
      };
    }

    return {
      hasCoveredCameraPhoto,
      hasFakePolkaPhoto,
      hasPolkaPhoto,
      hasOutsidePhoto,
      status: 'violation_missing_polka',
      statusLabel: "Polka rasmi yo'q",
      violationType: 'missing_polka',
      shouldAlert: false,
      alertTitle: 'Polka rasmi olinmagan',
      alertReason: "Do'kon tashqi ko'rinishi olingan, biroq mahsulot polkasi (ichki qismi) rasmi yuklanmagan!"
    };
  }

  /**
   * Fetch and analyze visits, photos, and orders to detect GPS and shelf photo violations
   */
  public async analyzeVisits(options: {
    dateFrom?: string;
    dateTo?: string;
    agentId?: string;
    limit?: number;
  } = {}): Promise<{
    summary: VisitMonitorSummary;
    items: VisitAnalysisItem[];
    telegramConfig: ReturnType<LocalDb['getTelegramConfig']>;
    apiStatus: {
      connected: boolean;
      hasToken: boolean;
      error?: string;
      totalApiVisits: number;
      totalApiPhotos: number;
      dateFrom: string;
      dateTo: string;
    };
  }> {
    const today = getTashkentTodayIso();
    const dateFrom = options.dateFrom || today;
    const dateTo = options.dateTo || dateFrom;

    const prCategoriesMap = new Map<string, string>();
    prCategoriesMap.set('d0_1', 'Do`kon ichi (Polka )');
    prCategoriesMap.set('d0_2', 'Do`kon (Tashqi Tomoni)');

    let apiError: string | undefined = undefined;
    let rawVisits: any[] = [];
    let rawPhotos: any[] = [];
    let rawOrders: any[] = [];
    let rawInventory: any[] = [];

    const config = this.client.getConfig();
    let hasToken = Boolean(config.token && config.token.trim() !== '');

    // Auto-login if token is missing but credentials exist
    if (!hasToken && config.savedLogin && config.savedPassword) {
      try {
        console.log(`[VisitMonitor] Token yo'q, saqlangan login '${config.savedLogin}' orqali avtomatik login qilinmoqda...`);
        await this.client.loginWithCredentials(config.savedLogin, config.savedPassword);
        hasToken = Boolean(this.client.getConfig().token);
      } catch (err: any) {
        console.warn('[VisitMonitor] Avtomatik login xatosi:', err.message);
      }
    }

    if (!hasToken) {
      apiError = "SalesDoc avtorizatsiya ma'lumotlari kiritilmagan. Yuqoridagi 'Sozlamalar' tugmasi orqali login va parolingizni bir marta kiriting (diskda doimiy saqlanadi).";
    } else {
      // 1. Fetch photo report categories
      let authFailed = false;
      try {
        const catRes = await this.client.request<{ prCategory: Array<{ CS_id: string; SD_id: string; name: string }> }>('getPRCategory');
        if (catRes.result?.prCategory) {
          catRes.result.prCategory.forEach((c) => {
            if (c.SD_id) prCategoriesMap.set(c.SD_id, c.name);
            if (c.CS_id) prCategoriesMap.set(c.CS_id, c.name);
          });
        }
      } catch (e: any) {
        if (e.code === 401 || /invalid token|user not found|unauthorized/i.test(e.message)) {
          authFailed = true;
          apiError = "SalesDoc avtorizatsiya xatosi: Token eskirgan yoki bekor qilingan. Sozlamalardan login va parolni kiriting.";
          console.warn('[VisitMonitor] SalesDoc token is invalid (401). Please update token or login in UI.');
        } else {
          console.warn('[VisitMonitor] Notice on PRCategory:', e.message);
        }
      }

      // If token is invalid (401), stop immediately and don't make 3 more failing requests
      if (!authFailed) {
        // 2. Fetch visits (paginated)
        try {
          rawVisits = await this.client.fetchAllPages<any>(
            'getVisit',
            {
              filter: {
                period: {
                  date: { from: dateFrom, to: dateTo }
                }
              }
            },
            (res: any) => res?.visit || [],
            1000,
            10
          );
        } catch (e: any) {
          if (e.code === 401 || /invalid token|user not found|unauthorized/i.test(e.message)) {
            authFailed = true;
            apiError = 'SalesDoc Auth Error [401]: Invalid token (SalesDoc API tokeningiz eskirgan yoki xato)';
          } else {
            console.warn('[VisitMonitor] Failed to fetch getVisit:', e.message);
            apiError = e.message;
          }
        }

        if (!authFailed) {
          // 3. Fetch photo reports (paginated)
          try {
            rawPhotos = await this.client.fetchAllPages<any>(
              'getPhotoReport',
              {
                filter: {
                  period: {
                    date: { from: dateFrom, to: dateTo }
                  }
                }
              },
              (res: any) => res?.photoReport || [],
              1000,
              10
            );
          } catch (e: any) {
            console.warn('[VisitMonitor] Failed to fetch getPhotoReport:', e.message);
          }

          // 4. Fetch orders for this period (1=New, 2=Otgrujen, 3=Delivered, 4=Closed)
          try {
            rawOrders = await this.client.fetchAllPages<any>(
              'getOrder',
              {
                filter: {
                  agent: 'all',
                  status: [1, 2, 3, 4],
                  period: {
                    date: { from: dateFrom, to: dateTo }
                  }
                }
              },
              (res: any) => res?.order || [],
              1000,
              10
            );
          } catch (e: any) {
            console.warn('[VisitMonitor] Failed to fetch getOrder:', e.message);
          }

          // 4b. Fetch active client equipment/inventory best-effort
          try {
            rawInventory = await this.client.fetchAllPages<any>(
              'getInventory',
              {},
              (res: any) => res?.inventory || [],
              500,
              5
            );
          } catch (e: any) {
            console.warn('[VisitMonitor] Notice on getInventory:', e.message);
          }
        }
      }
    }

    // Index active equipment per client
    const equipmentByClient = new Map<string, string[]>();
    for (const inv of rawInventory) {
      if (inv?.to_date) continue; // Only active equipment currently at store
      const eqName = String(inv?.name || '').trim();
      if (!eqName) continue;
      const clientIds = [inv?.client?.SD_id, inv?.client?.CS_id, inv?.client_id].filter(Boolean).map(String);
      for (const cId of clientIds) {
        const list = equipmentByClient.get(cId) || [];
        if (!list.includes(eqName)) list.push(eqName);
        equipmentByClient.set(cId, list);
      }
    }

    // Build local product lookup for real order category names
    const localProdMap = new Map<string, { name: string; category?: string }>();
    for (const lp of this.db.getProducts()) {
      const info = { name: lp.name, category: lp.category };
      if (lp.id) localProdMap.set(String(lp.id), info);
      if (lp.salesdoc_id) localProdMap.set(String(lp.salesdoc_id), info);
      if (lp.code_1c) localProdMap.set(String(lp.code_1c), info);
    }

    const photoAiMap = this.db.getPhotoAiAnalyses();
    const photoFlags = this.db.getPhotoFlags();
    const agentTeamConfigs = this.db.getAgentTeamConfigs();

    // 5. Index photos by client_id and date
    // Group photos by client_id (normalized)
    const photosByClient = new Map<string, any[]>();
    for (const p of rawPhotos) {
      const cId = p.client_id;
      if (!cId) continue;
      if (!photosByClient.has(cId)) {
        photosByClient.set(cId, []);
      }
      photosByClient.get(cId)!.push(p);
    }

    // Index orders by client_id
    const ordersByClient = new Map<string, any[]>();
    for (const o of rawOrders) {
      const cId = o.client?.SD_id || o.client?.CS_id || o.client_id;
      if (!cId) continue;
      if (!ordersByClient.has(cId)) {
        ordersByClient.set(cId, []);
      }
      ordersByClient.get(cId)!.push(o);
    }

    const telegramConfig = this.db.getTelegramConfig();
    const sentAlerts = this.db.getSentAlerts();

    // 6. Map visits to VisitAnalysisItem
    // If no visits returned from SalesDoc for this specific single day filter (e.g. weekend or mock period),
    // we can construct visit items from the active photo reports!
    const clientVisitedSet = new Set<string>();
    const analysisItems: VisitAnalysisItem[] = [];

    // Process visits from getVisit
    for (const v of rawVisits) {
      if (options.agentId && options.agentId !== 'all' && v.agent_id !== options.agentId) {
        continue;
      }

      const clientId = v.client_id;
      clientVisitedSet.add(clientId);

      const gpsVisit = Number(v.gps_visit ?? 1);
      const rawDist =
        typeof v.distance === 'number'
          ? v.distance
          : typeof v.distance_meters === 'number'
            ? v.distance_meters
            : null;
      const distanceMeters: number | null = rawDist;
      const distanceSource: VisitAnalysisItem['distance_source'] =
        distanceMeters !== null ? 'exact' : 'gps_flag_only';
      const isDistant = distanceMeters !== null ? distanceMeters > 100 : gpsVisit === 0;

      const clientPhotos = (photosByClient.get(clientId) || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const clientOrders = (ordersByClient.get(clientId) || []).sort((a, b) => (b.orderCreated || b.dateDocument || '').localeCompare(a.orderCreated || a.dateDocument || ''));
      const latestOrder = clientOrders[0];

      // Parse photos (merging SalesDoc categories, manual flags, and authoritative Gemini Vision AI verdicts)
      const photos: PhotoInfo[] = clientPhotos.map((p, pIdx) => {
        const pId = p.SD_id || p.CS_id || `P_${pIdx}`;
        const catName = prCategoriesMap.get(p.cat_id) || (p.cat_id === 'd0_1' ? 'Do`kon ichi (Polka )' : 'Do`kon (Tashqi Tomoni)');
        return this.evaluatePhotoInfo(
          p,
          pId,
          p.cat_id || '',
          catName,
          p.date,
          isDistant,
          photoFlags,
          photoAiMap
        );
      });

      // Order info
      const lastOrderDate = latestOrder ? (latestOrder.orderCreated || latestOrder.dateDocument || latestOrder.dateCreate) : undefined;
      let lastOrderCategories: string = '—';
      let lastOrderSumma: string = '0';

      if (latestOrder) {
        const prods = latestOrder.orderProducts || [];
        const catNames = Array.from(
          new Set(
            prods
              .map((pr: any) => {
                const pKey = String(pr.product?.SD_id || pr.product?.CS_id || pr.product?.code_1C || pr.productId || '');
                const localProd = pKey ? localProdMap.get(pKey) : undefined;
                return pr.categoryName || localProd?.category || pr.product?.name || pr.productName || localProd?.name;
              })
              .filter(Boolean)
          )
        ).slice(0, 3) as string[];
        lastOrderCategories = catNames.length > 0 ? catNames.join(', ') : "Kategoriya ko'rsatilmagan";
        const sumVal = Number(latestOrder.totalSummaAfterDiscount || latestOrder.totalSumma || v.order_summa || 0);
        lastOrderSumma = this.formatSum(sumVal);
      } else if (v.order_summa && v.order_summa > 0) {
        lastOrderSumma = this.formatSum(v.order_summa);
        lastOrderCategories = 'Savdo hujjati';
      }

      // Photos formatting
      const photoCategoriesStr = photos.length > 0
        ? photos.map((p) => p.cat_name).join(', ')
        : 'Foto olinmagan';

      const photoDatesStr = photos.length > 0
        ? photos.map((p) => this.formatPhotoTime(p.date)).join(', ')
        : '—';

      const distDisplay = distanceMeters !== null ? `${distanceMeters}m` : '100m dan uzoqda (GPS flag: 0)';
      const evaluated = this.evaluateVisitStatus({
        photos,
        visited: Number(v.visited ?? 1),
        isDistant,
        distDisplay
      });

      const visitKey = `VISIT_${v.agent_id}_${v.client_id}_${(v.date || '').replace(/[^0-9]/g, '')}`;
      const sentRecord = sentAlerts[visitKey];
      const targetChatId = telegramConfig.agentChatIds[v.agent_id] || telegramConfig.defaultChatId || '';
      const activeEquipment = (equipmentByClient.get(clientId) || []).join(', ') || "Yo'q";

      analysisItems.push({
        visitKey,
        agent_id: v.agent_id,
        agent_name: v.agent_name || agentTeamConfigs[v.agent_id]?.agentName || `Agent ${v.agent_id}`,
        client_id: v.client_id,
        client_name: v.client_name || `Mijoz ${v.client_id}`,
        category_name: v.category_name || "Kategoriya ko'rsatilmagan",
        date: v.date,
        start_date: v.start_date,
        end_date: v.end_date,
        planned: Number(v.planned ?? 0),
        visited: Number(v.visited ?? 1),
        gps_visit: gpsVisit,
        distance_meters: distanceMeters,
        distance_source: distanceSource,
        is_distant: isDistant,
        has_order: Number(v.has_order ?? 0),
        order_summa: Number(v.order_summa ?? 0),
        photos,
        photo_categories: photoCategoriesStr,
        photo_dates: photoDatesStr,
        has_polka_photo: evaluated.hasPolkaPhoto,
        has_outside_photo: evaluated.hasOutsidePhoto,
        has_covered_camera_photo: evaluated.hasCoveredCameraPhoto,
        has_fake_polka_photo: evaluated.hasFakePolkaPhoto,
        equipment: activeEquipment,
        last_order_date: lastOrderDate,
        last_order_categories: lastOrderCategories,
        last_order_summa: lastOrderSumma,
        status: evaluated.status,
        status_label: evaluated.statusLabel,
        violation_type: evaluated.violationType,
        should_alert: evaluated.shouldAlert,
        alert_title: evaluated.alertTitle,
        alert_reason: evaluated.alertReason,
        telegram_sent: !!sentRecord && sentRecord.success,
        telegram_sent_at: sentRecord?.sentAt,
        target_chat_id: targetChatId
      });
    }

    // Also include photos that might not have a direct visit row in getVisit today (independent photoReports)
    for (const [clientId, photosList] of photosByClient.entries()) {
      if (clientVisitedSet.has(clientId)) continue;

      const p0 = photosList[0];
      if (!p0) continue;
      if (options.agentId && options.agentId !== 'all' && p0.agent_id !== options.agentId) {
        continue;
      }

      const clientOrders = (ordersByClient.get(clientId) || []).sort((a, b) => (b.orderCreated || b.dateDocument || '').localeCompare(a.orderCreated || a.dateDocument || ''));
      const latestOrder = clientOrders[0];

      const photos: PhotoInfo[] = photosList.map((p, idx) => {
        const pId = p.SD_id || p.CS_id || `PH_${idx}`;
        const catName = prCategoriesMap.get(p.cat_id) || (p.cat_id === 'd0_1' ? 'Do`kon ichi (Polka )' : 'Do`kon (Tashqi Tomoni)');
        return this.evaluatePhotoInfo(
          p,
          pId,
          p.cat_id || '',
          catName,
          p.date,
          false,
          photoFlags,
          photoAiMap
        );
      });

      // No direct getVisit row exists for this photoReport -> do NOT fabricate GPS distance
      const gpsVisit = -1;
      const isDistant = false;
      const distanceMeters: number | null = null;
      const distanceSource: VisitAnalysisItem['distance_source'] = 'unknown';

      const evaluated = this.evaluateVisitStatus({
        photos,
        visited: 1,
        isDistant,
        distDisplay: "Masofa ko'rsatilmagan",
        hasNoVisitRow: true
      });

      const lastOrderDate = latestOrder ? (latestOrder.orderCreated || latestOrder.dateDocument || latestOrder.dateCreate) : undefined;
      let lastOrderCategories: string = '—';
      let lastOrderSumma: string = '0';

      if (latestOrder) {
        const prods = latestOrder.orderProducts || [];
        const catNames = Array.from(
          new Set(
            prods
              .map((pr: any) => {
                const pKey = String(pr.product?.SD_id || pr.product?.CS_id || pr.product?.code_1C || pr.productId || '');
                const localProd = pKey ? localProdMap.get(pKey) : undefined;
                return pr.categoryName || localProd?.category || pr.product?.name || pr.productName || localProd?.name;
              })
              .filter(Boolean)
          )
        ).slice(0, 3) as string[];
        lastOrderCategories = catNames.length > 0 ? catNames.join(', ') : "Kategoriya ko'rsatilmagan";
        const sumVal = Number(latestOrder.totalSummaAfterDiscount || latestOrder.totalSumma || 0);
        lastOrderSumma = this.formatSum(sumVal);
      }

      const photoCategoriesStr = photos.map((p) => p.cat_name).join(', ');
      const photoDatesStr = photos.map((p) => this.formatPhotoTime(p.date)).join(', ');

      const visitKey = `PHOTO_${p0.agent_id}_${clientId}_${(p0.date || '').replace(/[^0-9]/g, '')}`;
      const sentRecord = sentAlerts[visitKey];
      const targetChatId = telegramConfig.agentChatIds[p0.agent_id] || telegramConfig.defaultChatId || '';

      const localClient = this.db.getClientById(clientId);
      const clientName = localClient?.name || `Mijoz (${clientId})`;
      const catName = localClient?.category || "Kategoriya ko'rsatilmagan";
      const agentNameResolved = agentTeamConfigs[p0.agent_id]?.agentName || `Agent ${p0.agent_id}`;
      const activeEquipment = (equipmentByClient.get(clientId) || []).join(', ') || "Yo'q";

      analysisItems.push({
        visitKey,
        agent_id: p0.agent_id,
        agent_name: agentNameResolved,
        client_id: clientId,
        client_name: clientName,
        category_name: catName,
        date: p0.date,
        start_date: p0.date,
        end_date: p0.date,
        planned: 0,
        visited: 1,
        gps_visit: gpsVisit,
        distance_meters: distanceMeters,
        distance_source: distanceSource,
        is_distant: isDistant,
        has_order: latestOrder ? 1 : 0,
        order_summa: latestOrder ? Number(latestOrder.totalSummaAfterDiscount || latestOrder.totalSumma || 0) : 0,
        photos,
        photo_categories: photoCategoriesStr,
        photo_dates: photoDatesStr,
        has_polka_photo: evaluated.hasPolkaPhoto,
        has_outside_photo: evaluated.hasOutsidePhoto,
        has_covered_camera_photo: evaluated.hasCoveredCameraPhoto,
        has_fake_polka_photo: evaluated.hasFakePolkaPhoto,
        equipment: activeEquipment,
        last_order_date: lastOrderDate,
        last_order_categories: lastOrderCategories,
        last_order_summa: lastOrderSumma,
        status: evaluated.status,
        status_label: evaluated.statusLabel,
        violation_type: evaluated.violationType,
        should_alert: evaluated.shouldAlert,
        alert_title: evaluated.alertTitle,
        alert_reason: evaluated.alertReason,
        telegram_sent: !!sentRecord && sentRecord.success,
        telegram_sent_at: sentRecord?.sentAt,
        target_chat_id: targetChatId
      });
    }

    // Process stored custom/incoming visits
    const customVisits = this.db.getCustomVisits();

    for (const cv of customVisits) {
      if (options.agentId && options.agentId !== 'all' && cv.agent_id !== options.agentId) {
        continue;
      }
      const visitKey = cv.visitKey || `CVISIT_${cv.agent_id}_${cv.client_id}_${cv.id || Date.now()}`;
      const sentRecord = sentAlerts[visitKey];
      const targetChatId = telegramConfig.agentChatIds[cv.agent_id] || telegramConfig.defaultChatId || '';
      const distanceMeters: number | null = typeof cv.distance_meters === 'number' ? cv.distance_meters : null;
      const distanceSource: VisitAnalysisItem['distance_source'] = distanceMeters !== null ? 'exact' : 'unknown';
      const isDistant = distanceMeters !== null ? distanceMeters > 100 : false;

      const photos: PhotoInfo[] = (cv.photos || []).map((p: any, idx: number) => {
        const pId = p.id || `P_${idx}`;
        const catId = p.cat_id || (idx === 0 ? 'd0_2' : 'd0_1');
        const catName = p.cat_name || (catId === 'd0_1' ? 'Do`kon ichi (Polka )' : 'Do`kon (Tashqi Tomoni)');
        return this.evaluatePhotoInfo(
          p,
          pId,
          catId,
          catName,
          this.formatPhotoTime(p.date || cv.date),
          isDistant,
          photoFlags,
          photoAiMap
        );
      });

      const distDisplay = distanceMeters !== null ? `${distanceMeters}m` : "Masofa ko'rsatilmagan";
      const evaluated = this.evaluateVisitStatus({
        photos,
        visited: 1,
        isDistant,
        distDisplay
      });

      const activeEquipment = cv.equipment || (equipmentByClient.get(cv.client_id) || []).join(', ') || "Yo'q";

      analysisItems.push({
        visitKey,
        agent_id: cv.agent_id,
        agent_name: cv.agent_name || agentTeamConfigs[cv.agent_id]?.agentName || `Agent ${cv.agent_id}`,
        client_id: cv.client_id,
        client_name: cv.client_name || `Mijoz ${cv.client_id}`,
        category_name: cv.category_name || "Kategoriya ko'rsatilmagan",
        date: cv.date,
        start_date: cv.start_date || cv.date,
        end_date: cv.end_date,
        planned: 1,
        visited: 1,
        gps_visit: distanceMeters === null ? -1 : isDistant ? 0 : 1,
        distance_meters: distanceMeters,
        distance_source: distanceSource,
        is_distant: isDistant,
        has_order: cv.order_summa > 0 ? 1 : 0,
        order_summa: Number(cv.order_summa ?? 0),
        photos,
        photo_categories: photos.map((p) => p.cat_name).join(', ') || 'Foto yo`q',
        photo_dates: photos.map((p) => p.date).join(', ') || '—',
        has_polka_photo: evaluated.hasPolkaPhoto,
        has_outside_photo: evaluated.hasOutsidePhoto,
        has_covered_camera_photo: evaluated.hasCoveredCameraPhoto,
        has_fake_polka_photo: evaluated.hasFakePolkaPhoto,
        equipment: activeEquipment,
        last_order_date: cv.last_order_date || '—',
        last_order_categories: cv.last_order_categories || "Ko'rsatilmagan",
        last_order_summa: this.formatSum(Number(cv.order_summa ?? 0)),
        status: evaluated.status,
        status_label: evaluated.statusLabel,
        violation_type: evaluated.violationType,
        should_alert: evaluated.shouldAlert,
        alert_title: evaluated.alertTitle,
        alert_reason: evaluated.alertReason,
        telegram_sent: !!sentRecord && sentRecord.success,
        telegram_sent_at: sentRecord?.sentAt,
        target_chat_id: targetChatId
      });
    }

    // Sort: violations first, then most recent date
    analysisItems.sort((a, b) => {
      if (a.should_alert && !b.should_alert) return -1;
      if (!a.should_alert && b.should_alert) return 1;
      return (b.date || '').localeCompare(a.date || '');
    });

    const aiAuditedPhotosCount = analysisItems.reduce(
      (sum, it) => sum + it.photos.filter((p) => Boolean(p.ai_analysis)).length,
      0
    );

    // Compute summary
    const summary: VisitMonitorSummary = {
      totalVisits: analysisItems.length,
      visitedCount: analysisItems.filter((i) => i.visited === 1).length,
      withPhotosCount: analysisItems.filter((i) => i.photos.length > 0).length,
      distantVisitsCount: analysisItems.filter((i) => i.is_distant).length,
      polkaExceptionsCount: analysisItems.filter((i) => i.status === 'valid_polka_exception').length,
      violationsDistantNoPolkaCount: analysisItems.filter((i) => i.status === 'violation_distant_no_polka').length,
      violationsCoveredCameraCount: analysisItems.filter((i) => i.status === 'violation_covered_camera').length,
      violationsFakePolkaCount: analysisItems.filter((i) => i.status === 'violation_fake_polka').length,
      violationsNoPhotosCount: analysisItems.filter((i) => i.status === 'violation_no_photos').length,
      violationsMissingPolkaCount: analysisItems.filter((i) => i.status === 'violation_missing_polka').length,
      aiAuditedPhotosCount,
      totalViolationsCount: analysisItems.filter((i) => i.should_alert).length,
      telegramSentCount: analysisItems.filter((i) => i.telegram_sent).length
    };

    return {
      summary,
      items: options.limit ? analysisItems.slice(0, options.limit) : analysisItems,
      telegramConfig,
      apiStatus: {
        connected: !apiError && (rawVisits.length > 0 || rawPhotos.length > 0),
        hasToken: Boolean(this.client.getConfig().token && this.client.getConfig().token.trim() !== ''),
        error: apiError,
        totalApiVisits: rawVisits.length,
        totalApiPhotos: rawPhotos.length,
        dateFrom,
        dateTo
      }
    };
  }

  /**
   * Build Telegram HTML formatted message matching the exact layout from user's image
   */
  public buildTelegramCaption(item: VisitAnalysisItem): string {
    const lines = [
      `🏪 <b>${this.escapeHtml(item.client_name)}</b>`,
      `Категория клиента: ${this.escapeHtml(item.category_name || 'MM-Mini Market')}`,
      `Категория фото-отчёта: ${this.escapeHtml(item.photo_categories || 'Do `kon (Tashqi Tomoni), Do `kon ichi (Polka )')}`,
      `Дата и время фото: ${this.escapeHtml(item.photo_dates || '—')}`,
      `Оборудование/инвентарь: ${this.escapeHtml(item.equipment || 'Нет')}`,
      `Дата последнего заказа: ${this.escapeHtml(item.last_order_date || '—')}`,
      `Категории последнего заказа: ${this.escapeHtml(item.last_order_categories || '—')}`,
      `Сумма последнего заказа: ${this.escapeHtml(item.last_order_summa || '0')}`,
      `Агент: ${this.escapeHtml(item.agent_name)}`
    ];

    if (item.status === 'violation_covered_camera') {
      lines.push('');
      lines.push('🚫 <b>KAMERANI YOPIB / TO\'SIB OLINGAN RASM!</b>');
      lines.push(`📸 <b>Sabab:</b> ${this.escapeHtml(item.alert_reason)}`);
    } else if (item.status === 'violation_fake_polka') {
      lines.push('');
      lines.push('🎭 <b>SOXTA "DO\'KON ICHI (POLKA)" / MOS EMAS RASM!</b>');
      lines.push(`🤖 <b>AI Tahlili:</b> ${this.escapeHtml(item.alert_reason)}`);
    } else if (item.is_distant || item.violation_type === 'distant_no_polka') {
      const distInfo = item.distance_meters !== null ? `${item.distance_meters} metr` : '100m dan uzoqda (GPS flag: 0)';
      lines.push('');
      lines.push(`📍 <b>DO'KONDAN UZOQDA VIZIT QILINGAN: ${distInfo}</b>`);
      lines.push(`📸 <b>Sabab:</b> ${this.escapeHtml(item.alert_reason)}`);
    } else if (item.should_alert) {
      lines.push('');
      lines.push(`ℹ️ <b>${this.escapeHtml(item.alert_title)}</b>`);
      lines.push(`📸 <b>Sabab:</b> ${this.escapeHtml(item.alert_reason)}`);
    }

    return lines.join('\n');
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Send visit report/alert to the agent's Telegram group or default chat
   */
  public async sendVisitToTelegram(
    visitKey: string,
    options: {
      customChatId?: string;
      customBotToken?: string;
      item?: VisitAnalysisItem;
    } = {}
  ): Promise<{
    success: boolean;
    chatId: string;
    messageId?: number;
    error?: string;
  }> {
    const config = this.db.getTelegramConfig();
    const botToken = options.customBotToken || config.botToken;

    if (!botToken) {
      throw new Error("Telegram Bot Token kiritilmagan. Iltimos, BotFather'dan olingan tokenni sozlamalarga kiriting.");
    }

    // Get item data
    let item = options.item;
    if (!item) {
      const analysis = await this.analyzeVisits();
      item = analysis.items.find((i) => i.visitKey === visitKey);
    }

    if (!item) {
      throw new Error(`Tashrif topilmadi: ${visitKey}`);
    }

    // Strict requirement: only suppress if genuine inside polka photo exists and NO covered camera or fake polka mismatch
    if (item.has_polka_photo && !item.has_covered_camera_photo && !item.has_fake_polka_photo) {
      return {
        success: false,
        chatId: '',
        error: "Do'kon ichidan (Polka) rasmi mavjud. Qoidaga ko'ra do'kon ichidan rasm bo'lsa, xatolik deb hisoblanmaydi va guruhga tashlanmaydi."
      };
    }

    const teamConfigs = this.db.getAgentTeamConfigs();
    const agentTeam = teamConfigs[item.agent_id];
    const isSingleTeam = (agentTeam?.teamMode === 'single') || Boolean(agentTeam?.isCombinedWorker);

    interface TargetDestination {
      chatId: string;
      topicId?: string;
    }
    const destinations: TargetDestination[] = [];

    if (options.customChatId) {
      destinations.push({ chatId: options.customChatId });
    } else if (isSingleTeam) {
      // 1-Komanda rejimida faqat bitta guruhga yuboriladi
      const cId = agentTeam?.team1ChatId || agentTeam?.team2ChatId;
      const tId = agentTeam?.team1TopicId || agentTeam?.team2TopicId;
      if (cId) {
        destinations.push({ chatId: cId, topicId: tId });
      } else {
        const fallback = config.agentChatIds[item.agent_id] || config.defaultChatId;
        if (fallback) destinations.push({ chatId: fallback });
      }
    } else {
      // 2-Komanda rejimida: tegishli guruhlarga
      if (agentTeam?.team1ChatId) {
        destinations.push({ chatId: agentTeam.team1ChatId, topicId: agentTeam.team1TopicId });
      }
      if (agentTeam?.team2ChatId && agentTeam.team2ChatId !== agentTeam.team1ChatId) {
        destinations.push({ chatId: agentTeam.team2ChatId, topicId: agentTeam.team2TopicId });
      }
      if (destinations.length === 0) {
        const fallback = config.agentChatIds[item.agent_id] || config.defaultChatId;
        if (fallback) destinations.push({ chatId: fallback });
      }
    }

    if (destinations.length === 0) {
      throw new Error(`Agent (${item.agent_name}) uchun Telegram guruh ID topilmadi. Sozlamalardan komanda guruhini ulang.`);
    }

    const caption = this.buildTelegramCaption(item);
    let lastMessageId: number | undefined;
    let successfulChatId = destinations[0].chatId;

    try {
      for (const dest of destinations) {
        const threadIdNum = dest.topicId ? parseInt(dest.topicId, 10) : undefined;
        
        // Dispatch photos and alert with automatic multipart and buffer fallback
        const resultMessageId = await this.sendTelegramPhotoWithFallback(
          botToken,
          dest.chatId,
          threadIdNum,
          item.photos || [],
          caption
        );

        lastMessageId = resultMessageId;
        successfulChatId = dest.chatId;
      }

      // Record successful delivery
      this.db.recordSentAlert(visitKey, {
        chatId: successfulChatId,
        messageId: lastMessageId,
        success: true
      });

      return {
        success: true,
        chatId: successfulChatId,
        messageId: lastMessageId
      };
    } catch (err: any) {
      const errMsg = err.message || 'Telegram xabari yuborishda noma\'lum xatolik';
      this.db.recordSentAlert(visitKey, {
        chatId: successfulChatId,
        success: false,
        error: errMsg
      });
      throw new Error(errMsg);
    }
  }

  /**
   * Dispatches photos to Telegram with full fallback logic (mediaGroup -> single photo -> server buffer -> text message)
   */
  private async sendTelegramPhotoWithFallback(
    botToken: string,
    chatId: string,
    threadId: number | undefined,
    photos: Array<{ url: string; cat_name?: string }>,
    caption: string
  ): Promise<number | undefined> {
    const threadIdNum = threadId && !isNaN(threadId) ? threadId : undefined;
    const basePayload: Record<string, any> = { chat_id: chatId };
    if (threadIdNum) basePayload.message_thread_id = threadIdNum;

    // Filter valid photos
    const validPhotos = photos.filter((p) => p.url && typeof p.url === 'string' && p.url.trim() !== '');

    if (validPhotos.length === 0) {
      // Send text only
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...basePayload,
          text: caption,
          parse_mode: 'HTML'
        })
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.description || 'Telegram sendMessage xatosi');
      return j.result?.message_id;
    }

    // Attempt 1: If 2 or more photos, try sending as media group
    if (validPhotos.length >= 2) {
      try {
        const media = validPhotos.slice(0, 10).map((p, idx) => ({
          type: 'photo',
          media: p.url,
          caption: idx === 0 ? caption : undefined,
          parse_mode: idx === 0 ? 'HTML' : undefined
        }));

        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...basePayload,
            media
          })
        });

        const j = await res.json();
        if (j.ok) {
          return Array.isArray(j.result) ? j.result[0]?.message_id : j.result?.message_id;
        }
        console.warn('[Telegram] sendMediaGroup URL dispatch rejected:', j.description);
      } catch (err: any) {
        console.warn('[Telegram] sendMediaGroup exception:', err.message);
      }
    }

    // Attempt 2: Try single photo send with URL
    for (const p of validPhotos.slice(0, 2)) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...basePayload,
            photo: p.url,
            caption,
            parse_mode: 'HTML'
          })
        });
        const j = await res.json();
        if (j.ok) {
          return j.result?.message_id;
        }
        console.warn('[Telegram] sendPhoto URL rejected:', j.description);
      } catch (err: any) {
        console.warn('[Telegram] sendPhoto exception:', err.message);
      }

      // Attempt 3: If URL is unreachable by Telegram or is base64, buffer on server and stream as multipart/form-data
      try {
        if (p.url.startsWith('http://') || p.url.startsWith('https://')) {
          const imgRes = await fetch(p.url);
          if (imgRes.ok) {
            const arrayBuf = await imgRes.arrayBuffer();
            const form = new FormData();
            form.append('chat_id', chatId);
            if (threadIdNum) form.append('message_thread_id', String(threadIdNum));
            form.append('caption', caption);
            form.append('parse_mode', 'HTML');
            form.append('photo', new Blob([arrayBuf], { type: 'image/jpeg' }), 'dalil_rasm.jpg');

            const upRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: 'POST',
              body: form
            });
            const upJ = await upRes.json();
            if (upJ.ok) {
              return upJ.result?.message_id;
            }
          }
        } else if (p.url.startsWith('data:image')) {
          const base64Data = p.url.split(',')[1];
          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const form = new FormData();
            form.append('chat_id', chatId);
            if (threadIdNum) form.append('message_thread_id', String(threadIdNum));
            form.append('caption', caption);
            form.append('parse_mode', 'HTML');
            form.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'dalil_rasm.jpg');

            const upRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: 'POST',
              body: form
            });
            const upJ = await upRes.json();
            if (upJ.ok) {
              return upJ.result?.message_id;
            }
          }
        }
      } catch (uploadErr: any) {
        console.warn('[Telegram] Buffer upload exception:', uploadErr.message);
      }
    }

    // Attempt 4: Ultimate fallback to sendMessage so the violation alert is NEVER lost
    const resFallback = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...basePayload,
        text: caption,
        parse_mode: 'HTML'
      })
    });
    const jf = await resFallback.json();
    if (!jf.ok) {
      throw new Error(jf.description || 'Telegram xabari yuborib bo\'lmadi');
    }
    return jf.result?.message_id;
  }

  /**
   * Test Telegram connection by calling getMe and optionally sending a test ping
   */
  public async testTelegram(token: string, chatId?: string): Promise<{
    botInfo: any;
    pingSuccess: boolean;
    message?: string;
  }> {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = await res.json();

    if (!json.ok) {
      throw new Error(`Telegram Bot Token noto'g'ri: ${json.description || 'Xatolik'}`);
    }

    let pingSuccess = false;
    let message = `Bot muvaffaqiyatli ulandi: @${json.result.username} (${json.result.first_name})`;

    if (chatId) {
      try {
        const pingRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ <b>SalesDoc Foto & GPS Nazorati</b> ulandi!\n🤖 Bot: @${json.result.username}\n⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}`,
            parse_mode: 'HTML'
          })
        });
        const pingJson = await pingRes.json();
        if (pingJson.ok) {
          pingSuccess = true;
          message += ` va "${chatId}" guruhiga sinov xabari yuborildi!`;
        } else {
          message += `, ammo guruhga xabar yuborilmadi: ${pingJson.description}`;
        }
      } catch (e: any) {
        message += `, xabar yuborishda xatolik: ${e.message}`;
      }
    }

    return {
      botInfo: json.result,
      pingSuccess,
      message
    };
  }

  /**
   * Batch scan and send all unsent violations to their respective agent groups
   */
  public async autoSendViolations(): Promise<{
    sentCount: number;
    failedCount: number;
    results: Array<{ visitKey: string; clientName: string; agentName: string; success: boolean; error?: string }>;
  }> {
    const analysis = await this.analyzeVisits();
    const violations = analysis.items.filter((i) => i.should_alert && !i.telegram_sent);

    let sentCount = 0;
    let failedCount = 0;
    const results: Array<{ visitKey: string; clientName: string; agentName: string; success: boolean; error?: string }> = [];

    for (const item of violations) {
      try {
        await this.sendVisitToTelegram(item.visitKey, { item });
        sentCount++;
        results.push({
          visitKey: item.visitKey,
          clientName: item.client_name,
          agentName: item.agent_name,
          success: true
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          visitKey: item.visitKey,
          clientName: item.client_name,
          agentName: item.agent_name,
          success: false,
          error: err.message
        });
      }
    }

    return {
      sentCount,
      failedCount,
      results
    };
  }

  private monitorTimer: NodeJS.Timeout | null = null;
  private isScanning: boolean = false;

  /**
   * Start periodic background scan for agent visits & violations
   */
  public startBackgroundMonitoring(intervalSeconds: number = 60): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    const ms = Math.max(15, intervalSeconds) * 1000;
    this.db.updateMonitorStatus({ isRunning: true, intervalSeconds });
    console.log(`[VisitMonitor] Started automatic background monitoring every ${intervalSeconds}s`);

    this.monitorTimer = setInterval(async () => {
      await this.runAutoMonitorCycle();
    }, ms);

    // Initial check after 3s
    setTimeout(() => {
      this.runAutoMonitorCycle().catch((err) => {
        console.warn('[VisitMonitor] Initial auto-cycle warning:', err.message);
      });
    }, 3000);
  }

  /**
   * Stop background monitoring
   */
  public stopBackgroundMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    this.db.updateMonitorStatus({ isRunning: false });
    console.log('[VisitMonitor] Stopped automatic background monitoring');
  }

  /**
   * Automatically run Gemini Vision photo audit on unanalyzed photos when enabled and GEMINI_API_KEY is available.
   * Prioritizes photos claiming to be "Do'kon ichi (Polka)" and distant visits so fake polka fraud is caught first.
   */
  private async runAutoAiPhotoAuditIfEnabled(
    items: VisitAnalysisItem[],
    maxPhotos: number = 10
  ): Promise<{ auditedCount: number; errors: string[] }> {
    const monitorStatus = this.db.getMonitorStatus();
    if (monitorStatus.autoAiAudit === false) {
      return { auditedCount: 0, errors: [] };
    }
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return { auditedCount: 0, errors: [] };
    }

    const candidates = items
      .filter((it) => it.photos.some((p) => p.url && !p.ai_analysis))
      .sort((a, b) => {
        const aScore = (a.photos.some((p) => p.claimed_polka && !p.ai_analysis) ? 2 : 0) + (a.is_distant ? 1 : 0);
        const bScore = (b.photos.some((p) => p.claimed_polka && !p.ai_analysis) ? 2 : 0) + (b.is_distant ? 1 : 0);
        return bScore - aScore;
      });

    if (candidates.length === 0) {
      return { auditedCount: 0, errors: [] };
    }

    try {
      const { GeminiAiService } = await import('./GeminiAiService.js');
      const aiService = GeminiAiService.getInstance(this.client, this.db);
      const batchRes = await aiService.analyzeVisitsBatch(candidates, {
        onlyUnanalyzed: true,
        maxPhotos
      });
      return {
        auditedCount: batchRes.analyzedCount,
        errors: batchRes.errors.map((e) => `AI Audit: ${e.error}`)
      };
    } catch (err: any) {
      return { auditedCount: 0, errors: [`AI Audit: ${err.message}`] };
    }
  }

  /**
   * Run one auto-monitor check cycle
   */
  public async runAutoMonitorCycle(): Promise<{
    scanned: number;
    violationsDetected: number;
    newAlertsSent: number;
    aiAuditedCount: number;
    errors: string[];
  }> {
    if (this.isScanning) {
      return { scanned: 0, violationsDetected: 0, newAlertsSent: 0, aiAuditedCount: 0, errors: ['Tekshiruv allaqachon jarayonda'] };
    }

    this.isScanning = true;
    const errors: string[] = [];
    let newAlertsSent = 0;
    let aiAuditedCount = 0;

    try {
      const config = this.db.getTelegramConfig();
      let analysis = await this.analyzeVisits();

      // Auto-audit unanalyzed photos with Gemini Vision first so fake "do'kon ichi" photos are caught before alerting
      const aiAudit = await this.runAutoAiPhotoAuditIfEnabled(analysis.items, 10);
      aiAuditedCount = aiAudit.auditedCount;
      if (aiAudit.errors.length > 0) {
        errors.push(...aiAudit.errors.slice(0, 3));
      }
      if (aiAuditedCount > 0) {
        analysis = await this.analyzeVisits();
      }

      const violations = analysis.items.filter((i) => i.should_alert && !i.telegram_sent);

      // If autoSendAlerts is enabled and botToken is configured, dispatch alerts
      if (config.autoSendAlerts && config.botToken) {
        for (const item of violations) {
          try {
            await this.sendVisitToTelegram(item.visitKey, { item });
            newAlertsSent++;
          } catch (err: any) {
            errors.push(`${item.agent_name} (${item.client_name}): ${err.message}`);
          }
        }
      }

      this.db.updateMonitorStatus({
        lastRunAt: new Date().toISOString(),
        totalRunsIncrement: true,
        lastResults: {
          totalVisits: analysis.summary.totalVisits,
          violations: analysis.summary.totalViolationsCount,
          aiAuditedCount,
          newAlertsSent,
          errors
        }
      });

      return {
        scanned: analysis.summary.totalVisits,
        violationsDetected: analysis.summary.totalViolationsCount,
        newAlertsSent,
        aiAuditedCount,
        errors
      };
    } catch (err: any) {
      errors.push(`Cycle error: ${err.message}`);
      return { scanned: 0, violationsDetected: 0, newAlertsSent: 0, aiAuditedCount: 0, errors };
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Record an incoming visit submitted by an agent device / webhook
   */
  public async recordIncomingVisit(data: {
    agent_id: string;
    agent_name?: string;
    client_id: string;
    client_name?: string;
    category_name?: string;
    distance_meters?: number;
    photos?: Array<{
      url: string;
      cat_id?: string;
      cat_name?: string;
      date?: string;
    }>;
    order_summa?: number;
    equipment?: string;
    last_order_date?: string;
    last_order_categories?: string;
  }): Promise<{
    item: VisitAnalysisItem;
    alertSent: boolean;
    telegramResult?: any;
  }> {
    const { dateTimeStr } = getTashkentTimeParts();

    const agentId = data.agent_id || 'd0_1';
    const clientId = data.client_id || `CLI_${Date.now()}`;
    const visitKey = `INCOMING_${agentId}_${clientId}_${Date.now()}`;

    const photos = (data.photos || []).map((p, idx) => ({
      id: `P_${Date.now()}_${idx}`,
      url: p.url || '',
      cat_id: p.cat_id || (idx === 0 ? 'd0_2' : 'd0_1'),
      cat_name: p.cat_name || (p.cat_id === 'd0_1' ? 'Do`kon ichi (Polka )' : 'Do`kon (Tashqi Tomoni)'),
      date: p.date || dateTimeStr
    }));

    const agentTeamConfigs = this.db.getAgentTeamConfigs();
    const rawVisit = {
      visitKey,
      agent_id: agentId,
      agent_name: data.agent_name || agentTeamConfigs[agentId]?.agentName || `Agent ${agentId}`,
      client_id: clientId,
      client_name: data.client_name || `Mijoz (${clientId})`,
      category_name: data.category_name || "Kategoriya ko'rsatilmagan",
      date: dateTimeStr,
      distance_meters: typeof data.distance_meters === 'number' ? data.distance_meters : null,
      photos,
      order_summa: Number(data.order_summa ?? 0),
      equipment: data.equipment || "Yo'q",
      last_order_date: data.last_order_date || '—',
      last_order_categories: data.last_order_categories || "Ko'rsatilmagan",
      is_incoming: true
    };

    this.db.addCustomVisit(rawVisit);

    // Analyze immediately, and run Gemini Vision on any incoming photo URLs if enabled
    let analysis = await this.analyzeVisits();
    let item = analysis.items.find((i) => i.visitKey === visitKey) || analysis.items[0];
    if (item && item.photos.some((p) => p.url && !p.ai_analysis)) {
      const auditRes = await this.runAutoAiPhotoAuditIfEnabled([item], 4);
      if (auditRes.auditedCount > 0) {
        analysis = await this.analyzeVisits();
        item = analysis.items.find((i) => i.visitKey === visitKey) || analysis.items[0];
      }
    }

    let alertSent = false;
    let telegramResult: any = null;

    const telegramConfig = this.db.getTelegramConfig();
    if (item && item.should_alert && telegramConfig.autoSendAlerts && telegramConfig.botToken) {
      try {
        telegramResult = await this.sendVisitToTelegram(item.visitKey, { item });
        alertSent = true;
      } catch (e: any) {
        console.warn('[VisitMonitor] Failed to auto-send incoming visit violation:', e.message);
      }
    }

    return {
      item,
      alertSent,
      telegramResult
    };
  }

  /**
   * Import tabular data exported from SalesDoc "Отчет по визитам" & "GPS 2" or Google Sheets
   */
  public async importSalesDocReport(input: string | any[]): Promise<{
    importedCount: number;
    items: any[];
    summary: VisitMonitorSummary;
  }> {
    let rows: any[] = [];
    if (typeof input === 'string') {
      const text = input.trim();
      if (text.startsWith('[') || text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // ignore, parse as text lines
        }
      }
      if (rows.length === 0) {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          const firstLine = lines[0];
          const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');
          const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
            if (cols.length < 2) continue;
            const rowObj: Record<string, string> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = cols[idx] || '';
            });
            rows.push(rowObj);
          }
        }
      }
    } else if (Array.isArray(input)) {
      rows = input;
    }

    const createdVisits: any[] = [];
    for (const r of rows) {
      // Find keys case-insensitively
      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          for (const rowKey of Object.keys(r)) {
            if (rowKey.toLowerCase() === k.toLowerCase() || rowKey.toLowerCase().includes(k.toLowerCase())) {
              return String(r[rowKey] || '').trim();
            }
          }
        }
        return '';
      };

      const tp = getTashkentTimeParts();
      const agentRaw = getVal('агент', 'agent', 'сотрудник') || "Noma'lum agent";
      const clientRaw = getVal('клиент', 'торговая точка', 'client', 'докон', 'do`kon', 'do\'kon', 'наименование') || "Noma'lum mijoz";
      const catRaw = getVal('категория', 'category', 'тип тт') || "Kategoriya ko'rsatilmagan";
      const dateRaw = getVal('дата', 'время', 'date', 'start_date') || tp.dateTimeStr;

      // Distance / GPS 2 (honest: null unless number or explicit marker found)
      const distField = getVal('дистанция', 'расстояние', 'distance', 'gps 2', 'gps', 'masofa');
      let distVal: number | null = null;
      const numMatch = distField.match(/(\d+)/);
      if (numMatch) {
        distVal = parseInt(numMatch[1], 10);
      } else if (distField.toLowerCase().includes('вне') || distField.toLowerCase().includes('uzo') || distField.toLowerCase().includes('out')) {
        distVal = 145;
      } else if (distField.toLowerCase().includes('в радиусе') || distField.toLowerCase().includes('meyor') || distField.toLowerCase().includes('in')) {
        distVal = 30;
      }

      // Photos (keep only real URLs provided in import data, never inject stock Unsplash URLs)
      const photosField = getVal('фото', 'фотоотчет', 'photo', 'rasm');
      const polkaField = getVal('полка', 'фото полки', 'polka');
      const outsideField = getVal('фасад', 'внешний вид', 'tashqi', 'do`kon');

      const photos: any[] = [];
      const hasPolka = polkaField.length > 0 || photosField.toLowerCase().includes('полк') || photosField.toLowerCase().includes('polka');
      const hasOutside = outsideField.length > 0 || photosField.toLowerCase().includes('фасад') || photosField.toLowerCase().includes('tashq') || photosField.toLowerCase().includes('внешн') || (photosField.length > 0 && !hasPolka);

      if (hasOutside) {
        photos.push({
          url: outsideField.startsWith('http') ? outsideField : (photosField.startsWith('http') ? photosField : ''),
          cat_id: 'd0_2',
          cat_name: 'Do`kon (Tashqi Tomoni)',
          date: dateRaw
        });
      }
      if (hasPolka) {
        photos.push({
          url: polkaField.startsWith('http') ? polkaField : '',
          cat_id: 'd0_1',
          cat_name: 'Do`kon ichi (Polka )',
          date: dateRaw
        });
      }

      // Order sum
      const sumField = getVal('сумма', 'заказ', 'summa', 'order_sum');
      const sumClean = parseFloat(sumField.replace(/[^\d.]/g, '')) || 0;

      // Extract agent ID
      let agentId = 'd0_1';
      if (agentRaw.includes('ТП1') || agentRaw.includes('d0_1')) agentId = 'd0_1';
      else if (agentRaw.includes('ТП2') || agentRaw.includes('d0_2')) agentId = 'd0_2';
      else if (agentRaw.includes('ТП3') || agentRaw.includes('d0_3')) agentId = 'd0_3';
      else if (agentRaw.includes('ТП4') || agentRaw.includes('d0_4')) agentId = 'd0_4';
      else if (agentRaw.includes('ТП5') || agentRaw.includes('d0_5')) agentId = 'd0_5';
      else if (agentRaw.includes('ТП6') || agentRaw.includes('d0_6')) agentId = 'd0_6';

      const visitRecord = {
        id: `SD_IMP_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        agent_id: agentId,
        agent_name: agentRaw,
        client_id: `CLI_IMP_${Math.random().toString(36).substring(2, 6)}`,
        client_name: clientRaw,
        category_name: catRaw,
        date: dateRaw,
        distance_meters: distVal ?? undefined,
        order_summa: sumClean,
        photos,
        equipment: getVal('оборудование', 'inventar') || "Yo'q",
        last_order_categories: getVal('товары', 'kategoriyalar') || "Ko'rsatilmagan"
      };

      await this.recordIncomingVisit(visitRecord);
      createdVisits.push(visitRecord);
    }

    const analysis = await this.analyzeVisits();
    return {
      importedCount: createdVisits.length,
      items: createdVisits,
      summary: analysis.summary
    };
  }

  /**
   * Clear all custom visits
   */
  public clearCustomVisits(): void {
    this.db.clearCustomVisits();
  }

  /**
   * Delete a specific custom visit
   */
  public deleteCustomVisit(visitKey: string): boolean {
    return this.db.deleteCustomVisit(visitKey);
  }
}

type SalesDocClientServiceStatic = SalesDocVisitMonitorService;
