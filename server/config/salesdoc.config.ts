import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export interface SalesDocConfig {
  baseUrl: string;
  token: string;
  userId: string;
  filialId: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  dryRun: boolean;
  userAgent: string;
  savedLogin?: string;
  savedPassword?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  lastTokenRefreshAt?: string;
}

export function getSalesDocConfig(): SalesDocConfig {
  // 1. First check dedicated persistent config file: data/salesdoc_config.json
  const dataDir = path.join(process.cwd(), 'data');
  const configPath = path.join(dataDir, 'salesdoc_config.json');
  let fileConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.warn('[SalesDocConfig] Error parsing salesdoc_config.json:', e);
    }
  }

  // 2. Check persistent local database file: data/salesdoc_database.json
  let storedAuth: any = undefined;
  try {
    const dbPath = path.join(dataDir, 'salesdoc_database.json');
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      storedAuth = parsed.salesDocAuth;
    }
  } catch (e) {
    // ignore
  }

  // Priority: salesdoc_config.json > salesdoc_database.json (storedAuth) > process.env
  const rawToken = (fileConfig.token || storedAuth?.token || process.env.SALESDOC_TOKEN || '').trim();
  let token = rawToken;
  let userId = (fileConfig.userId || storedAuth?.userId || process.env.SALESDOC_USER_ID || '').trim();

  // If token is in "userId:token" format (common pattern e.g. "d0_67:432fef..."), split safely
  if (rawToken.includes(':') && !userId) {
    const parts = rawToken.split(':');
    userId = parts[0].trim();
    token = parts.slice(1).join(':').trim();
  }

  const savedLogin = (fileConfig.savedLogin || storedAuth?.savedLogin || process.env.SALESDOC_LOGIN || '').trim();
  const savedPassword = (fileConfig.savedPassword || storedAuth?.savedPassword || process.env.SALESDOC_PASSWORD || '').trim();

  // If userId is still empty but savedLogin looks like a userId (e.g. d0_67), use it
  if (!userId && savedLogin && /^d\d+_\d+$/i.test(savedLogin)) {
    userId = savedLogin;
  }

  const baseUrl = (fileConfig.baseUrl || storedAuth?.baseUrl || process.env.SALESDOC_BASE_URL || 'https://namdistribution.salesdoc.io/api/v2').trim();
  const filialId = (fileConfig.filialId !== undefined ? fileConfig.filialId : (storedAuth?.filialId ?? (process.env.SALESDOC_FILIAL_ID || ''))).trim();
  const timeoutMs = parseInt(String(fileConfig.timeoutMs || process.env.SALESDOC_TIMEOUT_MS || '30000'), 10);
  const dryRun = fileConfig.dryRun !== undefined ? Boolean(fileConfig.dryRun) : (process.env.SALESDOC_DRY_RUN === 'true');

  return {
    baseUrl: baseUrl || 'https://namdistribution.salesdoc.io/api/v2',
    token,
    userId,
    filialId,
    timeoutMs: isNaN(timeoutMs) ? 30000 : timeoutMs,
    maxRetries: 3,
    retryDelayMs: 1000,
    dryRun,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    savedLogin: savedLogin || undefined,
    savedPassword: savedPassword || undefined,
    updatedAt: fileConfig.updatedAt || storedAuth?.updatedAt,
    lastLoginAt: fileConfig.lastLoginAt || storedAuth?.lastLoginAt,
    lastTokenRefreshAt: fileConfig.lastTokenRefreshAt || storedAuth?.lastTokenRefreshAt
  };
}

/**
 * Persist credentials to disk permanently in:
 * 1. data/salesdoc_config.json (Dedicated JSON config file)
 * 2. data/salesdoc_database.json (LocalDb database schema)
 * 3. .env (Environment file)
 * 4. in-memory process.env
 */
export function saveSalesDocCredentialsToDisk(auth: {
  baseUrl?: string;
  token?: string;
  userId?: string;
  filialId?: string;
  savedLogin?: string;
  savedPassword?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  lastLoginAt?: string;
  lastTokenRefreshAt?: string;
}): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const now = new Date().toISOString();

    // 1. Update data/salesdoc_config.json
    const configPath = path.join(dataDir, 'salesdoc_config.json');
    let configData: any = {};
    if (fs.existsSync(configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        configData = {};
      }
    }

    const mergedConfig = {
      baseUrl: auth.baseUrl ?? configData.baseUrl ?? 'https://namdistribution.salesdoc.io/api/v2',
      token: auth.token !== undefined ? auth.token : (configData.token || ''),
      userId: auth.userId !== undefined ? auth.userId : (configData.userId || ''),
      filialId: auth.filialId !== undefined ? auth.filialId : (configData.filialId || ''),
      savedLogin: auth.savedLogin !== undefined ? auth.savedLogin : (configData.savedLogin || ''),
      savedPassword: auth.savedPassword !== undefined ? auth.savedPassword : (configData.savedPassword || ''),
      timeoutMs: auth.timeoutMs !== undefined ? auth.timeoutMs : (configData.timeoutMs || 30000),
      maxRetries: 3,
      retryDelayMs: 1000,
      dryRun: auth.dryRun !== undefined ? auth.dryRun : (configData.dryRun || false),
      updatedAt: now,
      lastLoginAt: auth.lastLoginAt || configData.lastLoginAt,
      lastTokenRefreshAt: auth.lastTokenRefreshAt || configData.lastTokenRefreshAt
    };

    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

    // 2. Update data/salesdoc_database.json
    const dbPath = path.join(dataDir, 'salesdoc_database.json');
    if (fs.existsSync(dbPath)) {
      try {
        const rawDb = fs.readFileSync(dbPath, 'utf-8');
        const dbData = JSON.parse(rawDb);
        dbData.salesDocAuth = {
          baseUrl: mergedConfig.baseUrl,
          token: mergedConfig.token,
          userId: mergedConfig.userId,
          filialId: mergedConfig.filialId,
          savedLogin: mergedConfig.savedLogin,
          savedPassword: mergedConfig.savedPassword,
          lastLoginAt: mergedConfig.lastLoginAt,
          lastTokenRefreshAt: mergedConfig.lastTokenRefreshAt,
          updatedAt: now
        };
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[SalesDocConfig] Error syncing salesdoc_database.json:', e);
      }
    }

    // 3. Update in-memory process.env
    if (mergedConfig.token) process.env.SALESDOC_TOKEN = mergedConfig.token;
    if (mergedConfig.userId) process.env.SALESDOC_USER_ID = mergedConfig.userId;
    if (mergedConfig.baseUrl) process.env.SALESDOC_BASE_URL = mergedConfig.baseUrl;
    if (mergedConfig.filialId !== undefined) process.env.SALESDOC_FILIAL_ID = mergedConfig.filialId;
    if (mergedConfig.savedLogin) process.env.SALESDOC_LOGIN = mergedConfig.savedLogin;
    if (mergedConfig.savedPassword) process.env.SALESDOC_PASSWORD = mergedConfig.savedPassword;

    // 4. Update .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const updateEnvKey = (key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    if (mergedConfig.baseUrl) updateEnvKey('SALESDOC_BASE_URL', mergedConfig.baseUrl);
    if (mergedConfig.token) updateEnvKey('SALESDOC_TOKEN', mergedConfig.token);
    if (mergedConfig.userId) updateEnvKey('SALESDOC_USER_ID', mergedConfig.userId);
    if (mergedConfig.filialId !== undefined) updateEnvKey('SALESDOC_FILIAL_ID', mergedConfig.filialId);
    if (mergedConfig.savedLogin) updateEnvKey('SALESDOC_LOGIN', mergedConfig.savedLogin);
    if (mergedConfig.savedPassword) updateEnvKey('SALESDOC_PASSWORD', mergedConfig.savedPassword);

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    console.log('[SalesDocConfig] Successfully saved credentials permanently to disk.');
  } catch (err) {
    console.warn('[SalesDocConfig] Failed to persist credentials to disk:', err);
  }
}

/**
 * Clear credentials completely from disk when requested by admin
 */
export function clearSalesDocCredentialsFromDisk(): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const configPath = path.join(dataDir, 'salesdoc_config.json');
    if (fs.existsSync(configPath)) {
      const freshConfig = {
        baseUrl: 'https://namdistribution.salesdoc.io/api/v2',
        token: '',
        userId: '',
        filialId: '',
        savedLogin: '',
        savedPassword: '',
        timeoutMs: 30000,
        maxRetries: 3,
        retryDelayMs: 1000,
        dryRun: false,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(configPath, JSON.stringify(freshConfig, null, 2), 'utf-8');
    }

    const dbPath = path.join(dataDir, 'salesdoc_database.json');
    if (fs.existsSync(dbPath)) {
      try {
        const rawDb = fs.readFileSync(dbPath, 'utf-8');
        const dbData = JSON.parse(rawDb);
        delete dbData.salesDocAuth;
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
      } catch (e) {}
    }

    process.env.SALESDOC_TOKEN = '';
    process.env.SALESDOC_USER_ID = '';
    process.env.SALESDOC_LOGIN = '';
    process.env.SALESDOC_PASSWORD = '';

    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf-8');
      envContent = envContent.replace(/^SALESDOC_TOKEN=.*$/m, 'SALESDOC_TOKEN=');
      envContent = envContent.replace(/^SALESDOC_USER_ID=.*$/m, 'SALESDOC_USER_ID=');
      envContent = envContent.replace(/^SALESDOC_LOGIN=.*$/m, 'SALESDOC_LOGIN=');
      envContent = envContent.replace(/^SALESDOC_PASSWORD=.*$/m, 'SALESDOC_PASSWORD=');
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    }
  } catch (err) {
    console.warn('[SalesDocConfig] Failed to clear credentials:', err);
  }
}

/**
 * Mask sensitive string (tokens, passwords) for safe logging and UI display.
 * Never expose raw tokens in logs or API responses.
 */
export function maskSensitiveString(value?: string | null): string {
  if (!value) return '***not-configured***';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

/**
 * Sanitize object recursively to remove or mask sensitive fields
 */
export function sanitizeForLogging(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLogging);
  }

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = ['token', 'password', 'secret', 'auth', 'authorization', 'cookie', 'session'];

  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.includes(lowerKey)) {
      if (typeof val === 'string') {
        sanitized[key] = maskSensitiveString(val);
      } else if (typeof val === 'object' && val !== null) {
        // If it's the auth object { userId, token }
        sanitized[key] = {
          ...val,
          token: maskSensitiveString((val as any).token),
          password: maskSensitiveString((val as any).password)
        };
      } else {
        sanitized[key] = '***masked***';
      }
    } else {
      sanitized[key] = sanitizeForLogging(val);
    }
  }

  return sanitized;
}
