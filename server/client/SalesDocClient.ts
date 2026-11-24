import { getSalesDocConfig, SalesDocConfig, sanitizeForLogging, saveSalesDocCredentialsToDisk } from '../config/salesdoc.config.js';
import {
  SalesDocBaseError,
  SalesDocApiError,
  SalesDocForbiddenError,
  SalesDocNetworkError,
  SalesDocRateLimitError,
  SalesDocTimeoutError,
  SalesDocUnauthorizedError
} from './errors.js';
import { SalesDocRequest, SalesDocResponse } from '../types/salesdoc.types.js';

export interface RequestOptions {
  timeoutMs?: number;
  skipRetry?: boolean;
  dryRun?: boolean;
}

export interface ConnectionTestResult {
  connected: boolean;
  status: 'connected' | 'error' | 'not_configured';
  latencyMs: number;
  message: string;
  url: string;
  hasToken: boolean;
  tokenMasked: string;
  userId: string;
  filialId: string;
}

export class SalesDocClient {
  private static instance: SalesDocClient | null = null;
  private config: SalesDocConfig;
  private refreshAuthPromise: Promise<{ userId: string; token: string }> | null = null;

  // Rate limiter timestamps for rate-limited endpoints
  private rateLimitTimestamps: Map<string, number[]> = new Map();

  constructor(customConfig?: Partial<SalesDocConfig>) {
    this.config = {
      ...getSalesDocConfig(),
      ...(customConfig || {})
    };
  }

  public static getInstance(): SalesDocClient {
    if (!SalesDocClient.instance) {
      SalesDocClient.instance = new SalesDocClient();
    }
    return SalesDocClient.instance;
  }

  public updateConfig(newConfig: Partial<SalesDocConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
    saveSalesDocCredentialsToDisk({
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      userId: this.config.userId,
      filialId: this.config.filialId,
      savedLogin: this.config.savedLogin,
      savedPassword: this.config.savedPassword,
      dryRun: this.config.dryRun,
      timeoutMs: this.config.timeoutMs,
      lastLoginAt: this.config.lastLoginAt,
      lastTokenRefreshAt: this.config.lastTokenRefreshAt
    });
  }

  public async loginWithCredentials(login: string, password: string): Promise<{ userId: string; token: string }> {
    const payload = {
      method: 'login',
      auth: {
        login,
        password
      }
    };

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': this.config.userAgent
      },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (jsonErr) {
      throw new Error(`SalesDoc server javobi noto'g'ri (status ${response.status}): ${rawText.slice(0, 150)}`);
    }

    if (!parsed.status) {
      const errMsg = parsed.error?.message || 'Login failed';
      throw new Error(`SalesDoc login failed: ${errMsg}`);
    }

    const token = parsed.result?.token || parsed.token || parsed.result?.auth?.token;
    const userId = parsed.result?.userId || parsed.result?.user_id || parsed.userId || login;

    if (!token) {
      throw new Error(`SalesDoc server javobida token qaytmadi`);
    }

    const now = new Date().toISOString();
    this.config.savedLogin = login;
    this.config.savedPassword = password;
    this.config.lastLoginAt = now;
    this.config.lastTokenRefreshAt = now;

    this.updateConfig({
      userId,
      token,
      savedLogin: login,
      savedPassword: password,
      lastLoginAt: now,
      lastTokenRefreshAt: now
    });
    console.log(`[SalesDocClient] Foydalanuvchi '${login}' (${userId}) uchun yangi token muvaffaqiyatli saqlandi.`);
    return { userId, token };
  }

  public getConfig(): Readonly<SalesDocConfig> {
    return { ...this.config };
  }

  /**
   * Main request method to SalesDoc API V2.
   * All requests are POST to this.config.baseUrl with JSON body.
   */
  public async request<TResult = any, TParams = any, TData = any>(
    method: string,
    params?: TParams,
    data?: TData,
    options: RequestOptions = {}
  ): Promise<SalesDocResponse<TResult>> {
    const isDryRun = options.dryRun ?? this.config.dryRun;

    // Handle Dry-run for mutating methods (starting with 'set' or 'sync')
    if (isDryRun && (method.startsWith('set') || method.startsWith('sync'))) {
      console.log(`[SalesDocClient][DRY-RUN] Simulated execution for method '${method}'`);
      return {
        status: true,
        result: {
          completed: 1,
          error: 0,
          data: data || {},
          dryRun: true,
          message: `Simulated successful execution of ${method} (DRY RUN active)`
        } as any
      };
    }

    // Enforce rate limits based on API Documentation specifications
    this.enforceRateLimits(method);

    // If a token refresh is currently in progress and this is not the login request itself,
    // wait for the fresh token before proceeding so we don't send requests with an expired token!
    if (this.refreshAuthPromise && method !== 'login') {
      try {
        await this.refreshAuthPromise;
      } catch {
        // Will be caught/retried in loop
      }
    }

    // Proactively login if token is completely missing and credentials are saved
    if (!this.config.token && method !== 'login') {
      const currentLogin = this.config.savedLogin || getSalesDocConfig().savedLogin || process.env.SALESDOC_LOGIN;
      const currentPassword = this.config.savedPassword || getSalesDocConfig().savedPassword || process.env.SALESDOC_PASSWORD;
      if (currentLogin && currentPassword) {
        if (!this.refreshAuthPromise) {
          this.refreshAuthPromise = (async () => {
            try {
              return await this.loginWithCredentials(currentLogin, currentPassword);
            } finally {
              setTimeout(() => {
                this.refreshAuthPromise = null;
              }, 1500);
            }
          })();
        }
        try {
          await this.refreshAuthPromise;
        } catch {
          this.refreshAuthPromise = null;
        }
      }
    }

    const maxRetries = options.skipRetry ? 0 : this.config.maxRetries;
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      const tokenUsed = this.config.token;
      try {
        return await this.executeSingleRequest<TResult, TParams, TData>(method, params, data, options);
      } catch (err: any) {
        lastError = err;

        // Auto-relogin and refresh token if 401 Unauthorized / Invalid token occurs and credentials are saved
        const errMsg = String(err?.message || '');
        const isAuth401 =
          err instanceof SalesDocUnauthorizedError ||
          err?.name === 'SalesDocUnauthorizedError' ||
          err?.code === 401 ||
          /401/i.test(errMsg) ||
          /invalid token/i.test(errMsg) ||
          /user not found/i.test(errMsg) ||
          /unauthorized/i.test(errMsg);

        const currentLogin = this.config.savedLogin || getSalesDocConfig().savedLogin || process.env.SALESDOC_LOGIN;
        const currentPassword = this.config.savedPassword || getSalesDocConfig().savedPassword || process.env.SALESDOC_PASSWORD;

        if (isAuth401 && currentLogin && currentPassword && method !== 'login') {
          // If another concurrent request already updated the token after this request was sent,
          // simply replay immediately with the new token without calling loginWithCredentials again!
          if (this.config.token && this.config.token !== tokenUsed) {
            return await this.executeSingleRequest<TResult, TParams, TData>(method, params, data, options);
          }

          // If already in-flight, await the shared refresh promise; otherwise initiate a new one
          if (!this.refreshAuthPromise) {
            console.log(
              `[SalesDocClient] Sessiya muddati tugadi, foydalanuvchi '${currentLogin}' uchun token yangilanmoqda...`
            );
            this.refreshAuthPromise = (async () => {
              try {
                return await this.loginWithCredentials(currentLogin, currentPassword);
              } finally {
                // Keep the resolved promise for 2000ms so all simultaneous/queued requests reuse the fresh token
                setTimeout(() => {
                  this.refreshAuthPromise = null;
                }, 2000);
              }
            })();
          }

          try {
            await this.refreshAuthPromise;
          } catch (refreshErr: any) {
            this.refreshAuthPromise = null;
            console.warn(`[SalesDocClient] Avtomatik tokenni yangilashda xatolik:`, refreshErr.message);
            throw new SalesDocUnauthorizedError(
              `SalesDoc avtorizatsiyasi eskirgan va avtomatik yangilab bo'lmadi: ${refreshErr.message}. Iltimos, Sozlamalar bo'limidan login va parolni tekshiring.`,
              err.details
            );
          }

          // Retry the single request immediately with the refreshed token!
          return await this.executeSingleRequest<TResult, TParams, TData>(method, params, data, options);
        }

        // Do NOT retry for non-retryable errors (e.g. 401 Unauthorized, 400 Validation, 403 Forbidden)
        if (!err.retryable || attempt >= maxRetries) {
          throw err;
        }

        attempt++;
        const backoffMs = this.config.retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
        console.warn(
          `[SalesDocClient] Request ${method} failed (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(backoffMs)}ms... Error: ${err.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
  }

  /**
   * Internal single HTTP request executor
   */
  private async executeSingleRequest<TResult, TParams, TData>(
    method: string,
    params?: TParams,
    data?: TData,
    options: RequestOptions = {}
  ): Promise<SalesDocResponse<TResult>> {
    const timeoutMs = options.timeoutMs || this.config.timeoutMs;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const authPayload: { token?: string; userId?: string } = {};
    if (this.config.token) authPayload.token = this.config.token;
    if (this.config.userId) authPayload.userId = this.config.userId;

    const requestPayload: SalesDocRequest<TParams, TData> = {
      method,
      auth: authPayload
    };

    if (this.config.filialId) {
      requestPayload.filial = { filial_id: this.config.filialId };
    }
    if (params !== undefined && params !== null) {
      // If caller passed { params: ... }, flatten it cleanly
      if (typeof params === 'object' && params !== null && 'params' in params && Object.keys(params).length === 1) {
        requestPayload.params = (params as any).params;
      } else {
        requestPayload.params = params;
      }
    }
    if (data !== undefined && data !== null) {
      requestPayload.data = data;
    }

    const startTime = Date.now();
    const sanitizedLog = sanitizeForLogging({
      method,
      hasAuth: Boolean(this.config.token),
      params,
      dataSummary: Array.isArray(data) ? `Array[${(data as any).length}]` : typeof data
    });

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': this.config.userAgent
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      const latencyMs = Date.now() - startTime;

      // Read raw text first to inspect body safely
      const rawText = await response.text();

      // Handle HTTP level error codes
      if (!response.ok) {
        if (response.status === 401) {
          throw new SalesDocUnauthorizedError(`HTTP 401 Unauthorized from SalesDoc`, { latencyMs, raw: rawText.slice(0, 200) });
        }
        if (response.status === 403) {
          throw new SalesDocForbiddenError(`HTTP 403 Forbidden. Check IP whitelist or credentials.`, { latencyMs, raw: rawText.slice(0, 200) });
        }
        if (response.status === 429) {
          throw new SalesDocRateLimitError(`HTTP 429 Rate Limit Exceeded`, 429, { latencyMs });
        }
        if (response.status >= 500) {
          throw new SalesDocNetworkError(`HTTP ${response.status} ${response.statusText} from SalesDoc`, { latencyMs, raw: rawText.slice(0, 200) });
        }
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (jsonErr) {
        // If server returned non-JSON text (HTML, error page, or plain text)
        if (rawText.includes('403 Forbidden') || response.status === 403) {
          throw new SalesDocForbiddenError(`Access denied by SalesDoc server (403 Forbidden)`, { raw: rawText.slice(0, 200), latencyMs });
        }
        if (rawText.includes('401') || response.status === 401) {
          throw new SalesDocUnauthorizedError(`Unauthorized: Invalid token or user not found`, { raw: rawText.slice(0, 200), latencyMs });
        }
        // Non-JSON is a deterministic API/server error - DO NOT RETRY
        throw new SalesDocApiError(`SalesDoc server returned non-JSON response (${response.status} ${response.statusText}): ${rawText.slice(0, 150)}`, response.status, { raw: rawText.slice(0, 200), latencyMs });
      }

      // Check for SalesDoc application-level error
      if (parsed.status === false) {
        const errCode = parsed.error?.code || response.status || 400;
        const errMsg = parsed.error?.message || 'SalesDoc API error occurred';
        const errData = parsed.error?.data || parsed.result;

        if (errCode === 401 || /user not found/i.test(errMsg) || /invalid token/i.test(errMsg)) {
          throw new SalesDocUnauthorizedError(errMsg, { errCode, errData, latencyMs });
        }

        if (errCode === 407 || /limit/i.test(errMsg)) {
          throw new SalesDocApiError(`SalesDoc Request Limit Exceeded: ${errMsg}`, 407, { errData, latencyMs });
        }

        if (errCode === 429) {
          throw new SalesDocRateLimitError(errMsg, 429, { errData, latencyMs });
        }

        throw new SalesDocApiError(errMsg, errCode, { errData, latencyMs });
      }

      return parsed as SalesDocResponse<TResult>;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new SalesDocTimeoutError(timeoutMs);
      }
      if (err instanceof SalesDocBaseError) {
        throw err;
      }
      throw new SalesDocNetworkError(err.message || 'Unknown network error connecting to SalesDoc', err);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Helper to fetch all pages sequentially with safety boundary.
   */
  public async fetchAllPages<T>(
    method: string,
    baseParams: any = {},
    arrayExtractor: (result: any) => T[],
    pageSize: number = 200,
    maxPages: number = 50
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= maxPages) {
      const response = await this.request(method, {
        ...baseParams,
        limit: pageSize,
        page: currentPage
      });

      const items = arrayExtractor(response.result) || [];
      if (items.length === 0) {
        break;
      }

      allItems.push(...items);

      const total = response.pagination?.total;
      if (typeof total === 'number') {
        if (allItems.length >= total || items.length < pageSize) {
          hasMore = false;
        }
      } else if (items.length < pageSize) {
        hasMore = false;
      }

      currentPage++;
    }

    return allItems;
  }

  /**
   * Test connection to SalesDoc API.
   * Tests live endpoint with configured credentials and returns clear diagnostics.
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    let hasToken = Boolean(this.config.token && this.config.token.trim() !== '');

    // If token is missing but saved credentials exist, attempt login first
    if (!hasToken && this.config.savedLogin && this.config.savedPassword) {
      try {
        console.log(`[SalesDocClient] Token yo'q, saqlangan login '${this.config.savedLogin}' orqali kirilmoqda...`);
        await this.loginWithCredentials(this.config.savedLogin, this.config.savedPassword);
        hasToken = Boolean(this.config.token && this.config.token.trim() !== '');
      } catch (loginErr: any) {
        return {
          connected: false,
          status: 'error',
          latencyMs: Date.now() - startTime,
          message: `SalesDoc tizimiga kirib bo'lmadi: ${loginErr.message}. Iltimos, Sozlamalardan login va parolni tekshiring.`,
          url: this.config.baseUrl,
          hasToken: false,
          tokenMasked: 'NOT_SET',
          userId: this.config.userId || this.config.savedLogin || 'N/A',
          filialId: this.config.filialId || 'None'
        };
      }
    }

    const tokenMasked = hasToken
      ? `${this.config.token.slice(0, 3)}...${this.config.token.slice(-3)}`
      : 'NOT_SET';

    if (!hasToken) {
      return {
        connected: false,
        status: 'not_configured',
        latencyMs: 0,
        message: "SalesDoc tokeni yoki login-paroli kiritilmagan. Yuqoridagi 'Sozlamalar' tugmasi orqali kiriting.",
        url: this.config.baseUrl,
        hasToken: false,
        tokenMasked,
        userId: this.config.userId || 'N/A',
        filialId: this.config.filialId || 'None'
      };
    }

    try {
      // Call lightweight reference method to verify credentials
      await this.request('getValyutaType', { limit: 1 }, undefined, {
        timeoutMs: 12000,
        skipRetry: true
      });

      const latencyMs = Date.now() - startTime;
      return {
        connected: true,
        status: 'connected',
        latencyMs,
        message: `SalesDoc API V2 ga muvaffaqiyatli ulandi (${latencyMs}ms)`,
        url: this.config.baseUrl,
        hasToken: true,
        tokenMasked,
        userId: this.config.userId || 'N/A',
        filialId: this.config.filialId || 'None'
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      let userFriendlyMessage = err.message;

      if (err instanceof SalesDocUnauthorizedError) {
        userFriendlyMessage = `SalesDoc avtorizatsiya xatosi: Token eskirgan yoki xato. Tizim sozlamalari bo'limidan SalesDoc login va parolingizni kiritib "Saqlash va Ulanish" ni bosing — token avtomatik yangilanadi va doimiy saqlanadi.`;
      } else if (err instanceof SalesDocForbiddenError) {
        userFriendlyMessage = `HTTP 403 Forbidden: IP address or User-Agent blocked by SalesDoc firewall.`;
      } else if (err instanceof SalesDocTimeoutError) {
        userFriendlyMessage = `Connection timed out connecting to ${this.config.baseUrl}.`;
      }

      return {
        connected: false,
        status: 'error',
        latencyMs,
        message: userFriendlyMessage,
        url: this.config.baseUrl,
        hasToken: true,
        tokenMasked,
        userId: this.config.userId || 'N/A',
        filialId: this.config.filialId || 'None'
      };
    }
  }

  /**
   * Rate limiting helper according to documentation:
   * - setStock: max 5 requests per 5s
   * - setCurrentBalance: max 3 requests per 5m
   * - getStockForDate: max 1 request per 5m
   */
  private enforceRateLimits(method: string): void {
    const now = Date.now();
    let maxCalls = 0;
    let windowMs = 0;

    if (method === 'setStock') {
      maxCalls = 5;
      windowMs = 5000;
    } else if (method === 'setCurrentBalance') {
      maxCalls = 3;
      windowMs = 300000; // 5 mins
    } else if (method === 'getStockForDate') {
      maxCalls = 1;
      windowMs = 300000; // 5 mins
    }

    if (maxCalls > 0 && windowMs > 0) {
      const timestamps = this.rateLimitTimestamps.get(method) || [];
      const validTimestamps = timestamps.filter((t) => now - t < windowMs);

      if (validTimestamps.length >= maxCalls) {
        const oldest = validTimestamps[0];
        const waitSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
        throw new SalesDocRateLimitError(
          `Rate limit reached for method '${method}' (${maxCalls} req per ${windowMs / 1000}s). Please wait ${waitSeconds}s.`,
          429,
          { method, waitSeconds }
        );
      }

      validTimestamps.push(now);
      this.rateLimitTimestamps.set(method, validTimestamps);
    }
  }
}
