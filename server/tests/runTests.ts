/**
 * Automated Test Suite for SalesDoc API V2 Integration Hub
 * Tests all core requirements: Auth, Client, Services, Mappers, Validation, Idempotency, and Errors
 */
import { getSalesDocConfig, maskSensitiveString, sanitizeForLogging } from '../config/salesdoc.config.js';
import { SalesDocClient } from '../client/SalesDocClient.js';
import {
  DuplicateOrderError,
  SalesDocApiError,
  SalesDocUnauthorizedError,
  SalesDocValidationError
} from '../client/errors.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import { SalesDocOrderService } from '../services/SalesDocOrderService.js';
import { SalesDocVisitMonitorService } from '../services/SalesDocVisitMonitorService.js';
import { SalesDocDailyReportService } from '../services/SalesDocDailyReportService.js';
import { SalesDocReferenceService } from '../services/SalesDocReferenceService.js';
import { LocalOrder } from '../types/salesdoc.types.js';
import { generateIsoDateRange, getTashkentDayOfWeek } from '../utils/timezone.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, message?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${message || 'Assertion failed'}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING SALESDOC API V2 INTEGRATION TEST SUITE');
  console.log('=============================================================\n');

  // Test 1: Configuration & Token Masking Security
  console.log('📋 Test Group 1: Configuration & Security');
  const config = getSalesDocConfig();
  assert(config.baseUrl.includes('/api/v2'), 'Base URL format matches API V2');
  assert(config.maxRetries === 3, 'Default maxRetries is 3');

  const masked = maskSensitiveString('secret_token_123456789');
  assert(!masked.includes('123456'), 'maskSensitiveString hides middle of token');
  assert(masked.startsWith('sec') && masked.endsWith('789'), 'maskSensitiveString preserves prefix and suffix');

  const sanitized = sanitizeForLogging({
    method: 'login',
    auth: { token: 'my_super_secret_token', password: 'my_password' },
    publicField: 'hello'
  });
  assert(sanitized.auth.token !== 'my_super_secret_token', 'sanitizeForLogging masks auth.token');
  assert(sanitized.auth.password !== 'my_password', 'sanitizeForLogging masks auth.password');
  assert(sanitized.publicField === 'hello', 'sanitizeForLogging retains public fields');

  // Test 2: Error Hierarchy & Retryability
  console.log('\n📋 Test Group 2: Error Classification & Retry Policy');
  const authErr = new SalesDocUnauthorizedError('User not found');
  assert(authErr.code === 401, 'SalesDocUnauthorizedError has code 401');
  assert(authErr.retryable === false, 'SalesDocUnauthorizedError is NOT retryable');

  const valErr = new SalesDocValidationError('Invalid payload', ['Field is required']);
  assert(valErr.retryable === false, 'SalesDocValidationError is NOT retryable');
  assert(valErr.validationErrors.length === 1, 'SalesDocValidationError contains validation list');

  const apiErr = new SalesDocApiError('Server error', 500);
  assert(apiErr.code === 500, 'SalesDocApiError preserves status code');

  // Test 3: Data Mappers
  console.log('\n📋 Test Group 3: Data Mappers & DTOs');
  const rawProduct = {
    SD_id: 'd0_999',
    code_1C: '1C-PROD-999',
    name: 'Mineral Water 0.5L',
    barCode: '4780000000001',
    category: { name: 'Water' },
    unit: { name: 'dona', code_1C: 'pc' },
    prices: [{ price: 4000 }]
  };
  const localProd = SalesDocMapper.toLocalProduct(rawProduct);
  assert(localProd.name === 'Mineral Water 0.5L', 'Product mapper preserves name');
  assert(localProd.code_1c === '1C-PROD-999', 'Product mapper preserves code_1C');
  assert(localProd.price === 4000, 'Product mapper extracts price');

  const payload = SalesDocMapper.toSalesDocProductPayload(localProd);
  assert(payload.code_1C === '1C-PROD-999', 'Reverse product mapper produces correct code_1C');
  assert(payload.unit.code_1C === 'dona', 'Reverse product mapper includes unit code');

  const mappedOrder = SalesDocMapper.toLocalOrder({
    SD_id: 'ORD_SD_4',
    status: 4,
    totalSumma: 50000,
    totalSummaAfterDiscount: 45000,
    dateCreate: '2026-09-07 14:10:00',
    client: { SD_id: 'CL_1', name: 'Test Store', code_1C: 'C100' },
    orderProducts: [
      { product: { SD_id: 'P_1', name: 'Semichka', code_1C: '1C-1' }, count: 2, price: 22500, totalSumma: 45000 }
    ]
  });
  assert(mappedOrder.status === 'closed', 'Order mapper maps status 4 to closed');
  assert(mappedOrder.total_amount === 45000, 'Order mapper prefers totalSummaAfterDiscount');
  assert(mappedOrder.items.length === 1 && mappedOrder.items[0].quantity === 2, 'Order mapper parses orderProducts');

  // Test 4: Order Validation Business Rules
  console.log('\n📋 Test Group 4: Order Validation & Business Rules');
  const db = LocalDb.getInstance();
  const client = SalesDocClient.getInstance();
  const orderService = new SalesDocOrderService(client, db);

  // 4.1 Invalid empty customer
  try {
    orderService.validateOrder({
      id: 'TEST-ORD-1',
      customer_id: '',
      customer_name: '',
      order_date: '2026-09-07',
      status: 'pending',
      total_amount: 100,
      items: [{ product_id: 'P1', product_name: 'P1', quantity: 1, price: 100, total: 100 }],
      sync_status: 'pending',
      created_at: '',
      updated_at: ''
    });
    assert(false, 'Validation accepts missing customer');
  } catch (e: any) {
    assert(e instanceof SalesDocValidationError, 'Validation rejects missing customer');
  }

  // 4.2 Invalid zero quantity
  try {
    orderService.validateOrder({
      id: 'TEST-ORD-2',
      customer_id: 'CLI-001',
      customer_name: 'Customer 1',
      order_date: '2026-09-07',
      status: 'pending',
      total_amount: 0,
      items: [{ product_id: 'PRD-001', product_name: 'P1', quantity: 0, price: 100, total: 0 }],
      sync_status: 'pending',
      created_at: '',
      updated_at: ''
    });
    assert(false, 'Validation accepts zero quantity');
  } catch (e: any) {
    assert(e instanceof SalesDocValidationError, 'Validation rejects zero quantity');
  }

  // 4.3 Valid order passes
  const validOrder: LocalOrder = {
    id: 'TEST-ORD-VALID',
    customer_id: 'CLI-001',
    customer_name: 'Korzinka',
    customer_code_1c: '000000100',
    order_date: '2026-09-07',
    status: 'pending',
    total_amount: 15000,
    items: [{ product_id: 'PRD-001', product_name: 'Cola', quantity: 1, price: 15000, total: 15000 }],
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    orderService.validateOrder(validOrder);
    assert(true, 'Validation succeeds on valid order');
  } catch (e: any) {
    assert(false, 'Validation fails on valid order', e.message);
  }

  // Test 5: Idempotency & Duplicate Order Prevention
  console.log('\n📋 Test Group 5: Idempotency & Duplicate Order Prevention');
  const syncedOrder: LocalOrder = {
    ...validOrder,
    id: 'ORD-ALREADY-SYNCED',
    salesdoc_id: 'SD_ORD_777',
    sync_status: 'synced'
  };

  try {
    orderService.checkDuplicate(syncedOrder, false);
    assert(false, 'checkDuplicate allows already synced order without force');
  } catch (e: any) {
    assert(e instanceof DuplicateOrderError, 'checkDuplicate blocks already synced order with DuplicateOrderError');
  }

  // Test 6: Dry-Run Mode Execution
  console.log('\n📋 Test Group 6: Dry Run Execution Mode');
  const dryClient = new SalesDocClient({ dryRun: true });
  const dryResponse = await dryClient.request('setOrder', undefined, { order: [validOrder] });
  assert(dryResponse.status === true, 'Dry-run returns status: true');
  assert((dryResponse.result as any)?.dryRun === true, 'Dry-run marks result as dryRun');

  // Test 7: Local Repository Storage & Zero-Fabrication Rules
  console.log('\n📋 Test Group 7: Local Repository, Timezone & Zero-Fabrication Rules');
  assert(Array.isArray(db.getProducts()), 'db.getProducts() returns array');
  assert(Array.isArray(db.getClients()), 'db.getClients() returns array');
  assert(Array.isArray(db.getOrders()), 'db.getOrders() returns array');
  assert(typeof db.getPhotoAiAnalyses() === 'object', 'db.getPhotoAiAnalyses() returns cache map');

  const monitorService = new SalesDocVisitMonitorService(dryClient, db);
  assert(
    typeof (monitorService as any).ensureDemonstrationVisits === 'undefined',
    'ensureDemonstrationVisits fake seeder has been removed'
  );

  // Test 8: Asia/Tashkent Timezone Utilities
  assert(getTashkentDayOfWeek('2026-09-07') === 1, '2026-09-07 is Monday (1) in Tashkent timezone');
  assert(getTashkentDayOfWeek('2026-09-06') === 7, '2026-09-06 is Sunday (7) in Tashkent timezone');
  const range = generateIsoDateRange('2026-09-05', '2026-09-07');
  assert(
    range.length === 3 && range[0].iso === '2026-09-05' && range[2].iso === '2026-09-07',
    'generateIsoDateRange returns inclusive UTC+5 date sequence'
  );

  // Test 9: Authoritative AI Photo Mismatch Override & Agent Control (Dry Run)
  console.log('\n📋 Test Group 9: AI Category-Mismatch Override & Agent Control');
  const testVisitFakeKey = `TEST_FAKE_POLKA_${Date.now()}`;
  const testVisitScreenKey = `TEST_SCREEN_POLKA_${Date.now()}`;
  const testVisitRealKey = `TEST_REAL_POLKA_${Date.now()}`;
  const fakePhotoId = `TEST_P_FAKE_${Date.now()}`;
  const screenPhotoId = `TEST_P_SCREEN_${Date.now()}`;
  const realPhotoId = `TEST_P_REAL_${Date.now()}`;

  try {
    db.savePhotoAiAnalysis([fakePhotoId], {
      photoKey: fakePhotoId,
      photoUrl: 'https://example.com/fake-outside.jpg',
      verdict: 'store_front',
      confidence: 95,
      isPolka: false,
      isOutside: true,
      isCoveredOrDark: false,
      isScreenOrRephoto: false,
      matchesClaimedCategory: false,
      mismatchReasonUz: "Agent \"Do'kon ichi (Polka)\" deb yuklagan, lekin tashqi fasad aniqlandi.",
      detectedItems: ['signboard', 'facade'],
      summaryUz: "Do'kon tashqi ko'rinishi",
      model: 'gemini-2.5-flash',
      analyzedAt: new Date().toISOString()
    });

    db.savePhotoAiAnalysis([screenPhotoId], {
      photoKey: screenPhotoId,
      photoUrl: 'https://example.com/screen-rephoto.jpg',
      verdict: 'screen_or_rephoto',
      confidence: 92,
      isPolka: false,
      isOutside: false,
      isCoveredOrDark: false,
      isScreenOrRephoto: true,
      matchesClaimedCategory: false,
      mismatchReasonUz: 'Monitor ekranidan qayta rasmga olingan.',
      detectedItems: ['screen bezel', 'moiré pattern'],
      summaryUz: 'Ekran surati',
      model: 'gemini-2.5-flash',
      analyzedAt: new Date().toISOString()
    });

    db.savePhotoAiAnalysis([realPhotoId], {
      photoKey: realPhotoId,
      photoUrl: 'https://example.com/real-polka.jpg',
      verdict: 'polka_inside',
      confidence: 96,
      isPolka: true,
      isOutside: false,
      isCoveredOrDark: false,
      isScreenOrRephoto: false,
      matchesClaimedCategory: true,
      detectedItems: ['shelves', 'snacks', 'drinks'],
      summaryUz: "Do'kon ichidagi mahsulot polkalari",
      model: 'gemini-2.5-flash',
      analyzedAt: new Date().toISOString()
    });

    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
    db.addCustomVisit({
      visitKey: testVisitFakeKey,
      agent_id: 'd0_1',
      agent_name: 'Test Agent 1',
      client_id: 'TEST_CL_1',
      client_name: 'Test Fake Polka Store',
      date: `${todayIso} 10:00:00`,
      distance_meters: 160,
      photos: [
        { id: fakePhotoId, url: 'https://example.com/fake-outside.jpg', cat_id: 'd0_1', cat_name: "Do'kon ichi (Polka )", date: `${todayIso} 10:00:00` }
      ],
      order_summa: 0
    });

    db.addCustomVisit({
      visitKey: testVisitScreenKey,
      agent_id: 'd0_1',
      agent_name: 'Test Agent 1',
      client_id: 'TEST_CL_2',
      client_name: 'Test Screen Rephoto Store',
      date: `${todayIso} 10:05:00`,
      distance_meters: 15,
      photos: [
        { id: screenPhotoId, url: 'https://example.com/screen-rephoto.jpg', cat_id: 'd0_1', cat_name: "Do'kon ichi (Polka )", date: `${todayIso} 10:05:00` }
      ],
      order_summa: 0
    });

    db.addCustomVisit({
      visitKey: testVisitRealKey,
      agent_id: 'd0_1',
      agent_name: 'Test Agent 1',
      client_id: 'TEST_CL_3',
      client_name: 'Test Real Polka Store',
      date: `${todayIso} 10:10:00`,
      distance_meters: 180,
      photos: [
        { id: realPhotoId, url: 'https://example.com/real-polka.jpg', cat_id: 'd0_1', cat_name: "Do'kon ichi (Polka )", date: `${todayIso} 10:10:00` }
      ],
      order_summa: 0
    });

    const monitorRes = await monitorService.analyzeVisits({ agentId: 'd0_1', dateFrom: todayIso, dateTo: todayIso });
    const fakeItem = monitorRes.items.find((i) => i.visitKey === testVisitFakeKey);
    const screenItem = monitorRes.items.find((i) => i.visitKey === testVisitScreenKey);
    const realItem = monitorRes.items.find((i) => i.visitKey === testVisitRealKey);

    assert(
      Boolean(fakeItem && !fakeItem.has_polka_photo && fakeItem.has_fake_polka_photo && fakeItem.status === 'violation_fake_polka' && fakeItem.should_alert),
      'AI store_front verdict overrides d0_1 tag and flags violation_fake_polka'
    );
    assert(
      Boolean(screenItem && !screenItem.has_polka_photo && screenItem.has_fake_polka_photo && screenItem.status === 'violation_fake_polka' && screenItem.should_alert),
      'AI screen_or_rephoto verdict overrides d0_1 tag and flags violation_fake_polka'
    );
    assert(
      Boolean(realItem && realItem.has_polka_photo && !realItem.has_fake_polka_photo && realItem.status === 'valid_polka_exception' && !realItem.should_alert),
      'Genuine AI polka_inside verdict on distant visit evaluates as valid_polka_exception'
    );

    // Ensure realItem IS suppressed offline by Telegram polka-exception rule
    const realSuppressedRes = await monitorService.sendVisitToTelegram(testVisitRealKey, {
      customBotToken: 'OFFLINE_DUMMY_TOKEN',
      item: realItem
    });
    assert(
      realSuppressedRes.success === false && String(realSuppressedRes.error || '').includes('Polka'),
      'Genuine polka visit is suppressed by Telegram polka-exception rule'
    );

    // Ensure fakeItem will NOT be suppressed and generates proper fake-polka Telegram caption
    const fakeCaption = monitorService.buildTelegramCaption(fakeItem!);
    assert(
      !fakeItem!.has_polka_photo && Boolean(fakeItem!.has_fake_polka_photo) && fakeCaption.includes('SOXTA'),
      'Fake polka violation bypasses polka-exception rule and builds SOXTA Telegram caption'
    );

    // Dry-run setAgentActiveStatus test
    const dryRefService = new SalesDocReferenceService(dryClient);
    const setAgentRes = await dryRefService.setAgentActiveStatus('d0_1', false, { name: 'Test Agent' });
    assert(
      setAgentRes.agentId === 'd0_1' && setAgentRes.active === false && (setAgentRes.salesdocResult?.result as any)?.dryRun === true,
      'SalesDocReferenceService.setAgentActiveStatus executes setAgent cleanly in dryRun mode'
    );
  } finally {
    db.deleteCustomVisit(testVisitFakeKey);
    db.deleteCustomVisit(testVisitScreenKey);
    db.deleteCustomVisit(testVisitRealKey);
    db.deletePhotoAiAnalysis([fakePhotoId, screenPhotoId, realPhotoId]);
  }

  // Test 10: Unvisited Stores Must NOT Be Alerted During Daytime & 22:30 Scheduler Guard
  console.log('\n📋 Test Group 10: Unvisited Store Suppression & 22:30 Scheduler Guard');
  const todayIso10 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const stubClient = {
    getConfig: () => ({ token: 'stub-token', savedLogin: '', savedPassword: '', dryRun: true }),
    request: async (method: string) => {
      if (method === 'getPRCategory') return { status: true, result: { prCategory: [] } };
      return { status: true, result: {} };
    },
    fetchAllPages: async (method: string) => {
      if (method === 'getVisit') {
        return [
          {
            agent_id: 'd0_1',
            agent_name: 'ТП1',
            client_id: 'UNVISITED_C1',
            client_name: 'Hali Kirilmagan Store',
            category_name: 'MM',
            date: `${todayIso10} 02:06:00`,
            start_date: null,
            end_date: null,
            planned: 1,
            visited: 0,
            gps_visit: 0,
            has_order: 0,
            order_summa: 0
          },
          {
            agent_id: 'd0_1',
            agent_name: 'ТП1',
            client_id: 'DISTANT_VISITED_OUTSIDE',
            client_name: 'Uzoqda Tashqi Rasm Store',
            category_name: 'MM',
            date: `${todayIso10} 11:00:00`,
            start_date: `${todayIso10} 11:00:00`,
            end_date: `${todayIso10} 11:02:00`,
            planned: 1,
            visited: 1,
            gps_visit: 0,
            distance: 155,
            has_order: 0,
            order_summa: 0
          },
          {
            agent_id: 'd0_1',
            agent_name: 'ТП1',
            client_id: 'DISTANT_VISITED_NOPHOTO',
            client_name: 'Uzoqda Rasmsiz Store',
            category_name: 'MM',
            date: `${todayIso10} 12:00:00`,
            start_date: `${todayIso10} 12:00:00`,
            end_date: `${todayIso10} 12:01:00`,
            planned: 1,
            visited: 1,
            gps_visit: 0,
            has_order: 0,
            order_summa: 0
          }
        ];
      }
      if (method === 'getPhotoReport') {
        return [
          {
            SD_id: 'PH_OUT_1',
            agent_id: 'd0_1',
            client_id: 'DISTANT_VISITED_OUTSIDE',
            cat_id: 'd0_2',
            date: `${todayIso10} 11:01:00`,
            url: 'https://example.com/outside.jpg'
          }
        ];
      }
      return [];
    }
  } as any;

  const stubMonitor = new SalesDocVisitMonitorService(stubClient, db);
  const stubRes = await stubMonitor.analyzeVisits({ agentId: 'd0_1', dateFrom: todayIso10, dateTo: todayIso10 });
  const unvisitedItem = stubRes.items.find((i) => i.client_id === 'UNVISITED_C1');
  const distantOutsideItem = stubRes.items.find((i) => i.client_id === 'DISTANT_VISITED_OUTSIDE');
  const distantNoPhotoItem = stubRes.items.find((i) => i.client_id === 'DISTANT_VISITED_NOPHOTO');

  assert(
    Boolean(
      unvisitedItem &&
        !unvisitedItem.is_distant &&
        unvisitedItem.status === 'violation_no_photos' &&
        !unvisitedItem.should_alert
    ),
    'Unvisited planned store (visited=0, gps_visit=0, photos=0) is NOT marked distant and has should_alert=false'
  );

  const blockedUnvisitedSend = await stubMonitor.sendVisitToTelegram(unvisitedItem!.visitKey, {
    customBotToken: 'OFFLINE_DUMMY_TOKEN',
    item: unvisitedItem
  });
  assert(
    blockedUnvisitedSend.success === false,
    'sendVisitToTelegram blocks sending unvisited (visited=0) store individually during the day'
  );

  assert(
    Boolean(
      distantOutsideItem &&
        distantOutsideItem.is_distant &&
        distantOutsideItem.status === 'violation_distant_no_polka' &&
        distantOutsideItem.should_alert
    ),
    'Visited distant store with outside-only photo triggers violation_distant_no_polka alert'
  );

  assert(
    Boolean(
      distantNoPhotoItem &&
        distantNoPhotoItem.is_distant &&
        distantNoPhotoItem.status === 'violation_distant_no_polka' &&
        distantNoPhotoItem.should_alert &&
        !distantNoPhotoItem.alert_reason.includes("faqat tashqi ko'rinish")
    ),
    'Visited distant store without photos alerts accurately without false outside-photo text'
  );

  assert(
    SalesDocDailyReportService.isScheduledDispatchDue({
      hours: 13,
      minutes: 25,
      dateIso: '2026-11-24',
      scheduledTime: '22:30'
    }) === false,
    'Daily report + unvisited list scheduler does NOT trigger at 13:25 Tashkent time'
  );
  assert(
    SalesDocDailyReportService.isScheduledDispatchDue({
      hours: 22,
      minutes: 29,
      dateIso: '2026-11-24',
      scheduledTime: '22:30'
    }) === false,
    'Daily report + unvisited list scheduler does NOT trigger at 22:29 Tashkent time'
  );
  assert(
    SalesDocDailyReportService.isScheduledDispatchDue({
      hours: 22,
      minutes: 30,
      dateIso: '2026-11-24',
      scheduledTime: '22:30'
    }) === true,
    'Daily report + unvisited list scheduler triggers at 22:30 Tashkent time'
  );
  assert(
    SalesDocDailyReportService.isScheduledDispatchDue({
      hours: 22,
      minutes: 35,
      dateIso: '2026-11-24',
      scheduledTime: '22:30',
      lastSentDate: '2026-11-24'
    }) === false,
    'Daily report + unvisited list scheduler does NOT resend on same day'
  );

  console.log('\n=============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
