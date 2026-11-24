# SalesDoc API V2 Professional Enterprise Integration Hub

Bu loyiha mavjud dastur va ERP/1C tizimlarini **SalesDoc API V2** bilan professional, xavfsiz va production-ready tarzda integratsiya qilish uchun ishlab chiqilgan to'liq full-stack tizimdir.

---

## 1. Arxitektura va Dizayn

SalesDoc API V2 barcha so'rovlarni bitta endpointga qabul qiladi:
* **Endpoint:** `POST https://<domain>.salesdoc.io/api/v2`
* **Metod aniqlanishi:** JSON body ichidagi `"method"` parametri orqali
* **Autentifikatsiya:** JSON body ichidagi `"auth": { "token": "...", "userId": "..." }` obyekti orqali
* **Filial / Korxona bo'limi:** `"filial_id"` (agar ko'p filialli korxona bo'lsa)

### Arxitektura qatlamlari:

1. **Client / Transport Layer (`server/client/SalesDocClient.ts`):**
   - Singleton pattern
   - Avtomatik `auth` va `filial_id` inyeksiyasi
   - **Rate Limiting:**
     - `setStock`: 5 sekundda maksimal 5 so'rov
     - `setCurrentBalance`: 5 minutda maksimal 3 so'rov
     - `getStockForDate`: 5 minutda maksimal 1 so'rov
   - **Exponential Backoff & Retry:**
     - 429 va 5xx xatoliklarida avtomatik qayta urinish (3 martagacha, jitter bilan)
     - 401 Unauthorized va 400 Validation xatoliklarida qayta urunmaslik (Fast-Fail)
   - **Timeout Control:** `AbortController` (standart 30 soniya)
   - **Security / Masking:** Loglarda token va maxfiy ma'lumotlarni hech qachon ochiq ko'rsatmaslik (`maskSensitiveString`, `sanitizeForLogging`)
   - **Dry Run Mode:** Test muhitida haqiqiy API ga o'zgartirish kiritmasdan xavfsiz simulyatsiya qilish imkoniyati

2. **DTO & Mapper Layer (`server/mappers/salesdoc.mapper.ts`):**
   - Raw API obyektlarini lokal dastur entity'lariga o'girish (va aksincha)
   - Identifikatorlar muvofiqligi (`CS_id`, `SD_id`, `code_1C`)
   - Null va undefined qiymatlardan himoyalangan tur o'zgarishlari

3. **Services Layer:**
   - `SalesDocProductService.ts`: `getProduct`, `getProductCategory`, `setProduct`, `setPrice`
   - `SalesDocClientService.ts`: `getClient`, `getClientCategory`, `setClient`, `setClientPhone`
   - `SalesDocOrderService.ts`: `getOrder`, `setOrder`, `setStatus`, `setDeletedOrder`, `setOrderDefect`
     - **Pre-flight Validation:** Mijoz mavjudligi, kamida 1 dona tovar, miqdor > 0, narx >= 0
     - **Idempotency & Duplicate Prevention:** Bir xil buyurtmani qayta yuborishdan himoyalanish
   - `SalesDocStockService.ts`: `getWarehouse`, `getStock`, `setStock`, `setMovement`
   - `SalesDocPaymentService.ts`: `getPayment`, `getBalance`, `setPayment`, `setCurrentBalance`
   - `SalesDocReferenceService.ts`: Filiallar, agentlar, hududlar, brendlar ma'lumotnomalari
   - `SalesDocSyncService.ts`: 2 tomonlama (Two-Way) to'liq sinxronizatsiya orkestratori

4. **Storage & Persistence (`server/storage/localDb.ts`):**
   - Mahalliy tovarlar, mijozlar, buyurtmalar, qoldiqlar va to'lovlar repozitoriysi
   - Barcha sinxronizatsiya amaliyotlari tarixi (Audit Logs) va metrikalar (Latency, Success Rate)

5. **Web Admin Dashboard (React + Tailwind CSS):**
   - Real-time holat va diagnostika (Connected / Error / Not Configured)
   - Qo'lda sinxronizatsiya qilish tugmalari: Mahsulotlar, Mijozlar, Buyurtmalar, Qoldiqlar, To'lovlar, Full Sync
   - Tovarlar va mijozlar ro'yxati, qarz/balans ko'rinishi
   - Yangi buyurtma yaratish va qat'iy tekshiruvdan o'tkazib SalesDoc ga yuborish
   - **Interactive API Explorer:** Istalgan SalesDoc metodini bevosita UI orqali sinab ko'rish

---

## 2. Sozlash va Ishga Tushirish

### Muhit o'zgaruvchilari (`.env`)

Loyihaning ildiz papkasida `.env` faylini yarating yoki mavjudini to'ldiring:

```env
# SalesDoc API V2 URL
SALESDOC_BASE_URL=https://namdistribution.salesdoc.io/api/v2

# API Token (SalesDoc ma'murlari tomonidan beriladi)
SALESDOC_TOKEN=your_salesdoc_secret_token_here

# Foydalanuvchi identifikatori (ixtiyoriy)
SALESDOC_USER_ID=admin_01

# Filial identifikatori (agar mavjud bo'lsa)
SALESDOC_FILIAL_ID=0

# Xavfsiz test rejimi (true bo'lsa, SalesDoc ga real ma'lumot yozilmaydi)
SALESDOC_DRY_RUN=false
```

### O'rnatish va Sinovlar

```bash
# Avtomatlashtirilgan testlarni ishga tushirish (26 ta test)
npm test

# Dasturni ishlab chiqish rejimida ishga tushirish (Port 3000)
npm run dev

# Production build qilish
npm run build
```

---

## 3. API Endpoints Ro'yxati

Integratsiya serveri frontend yoki tashqi ERP tizimlari uchun quyidagi REST marshrutlarini taqdim etadi:

* `GET /api/salesdoc/status` - API ulanish holati va metrikalari
* `POST /api/salesdoc/test-connection` - Jonli ping va ulanish tekshiruvi
* `POST /api/salesdoc/sync/all` - To'liq 2 tomonlama sinxronizatsiya
* `POST /api/salesdoc/sync/products` - Faqat tovarlar katalogi
* `POST /api/salesdoc/sync/clients` - Mijozlar va ularning qarzdorliklari
* `POST /api/salesdoc/sync/orders` - Buyurtmalar
* `POST /api/salesdoc/sync/stock` - Omborxona qoldiqlari
* `POST /api/salesdoc/sync/payments` - To'lovlar va kassa
* `GET /api/salesdoc/sync/logs` - Sinxronizatsiya audit jurnali
* `POST /api/salesdoc/raw-invoke` - SalesDoc V2 metodlarini to'g'ridan-to'g'ri chaqirish (API Explorer)
