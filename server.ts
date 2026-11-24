import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { salesDocRouter } from './server/routes/salesdoc.routes.js';
import { SalesDocVisitMonitorService } from './server/services/SalesDocVisitMonitorService.js';

const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

interface KeepAliveState {
  enabled: boolean;
  intervalMinutes: number;
  targetUrl: string | null;
  startedAt: string;
  lastPingAt: string | null;
  lastStatus: number | string | null;
  totalPings: number;
  lastError: string | null;
}

const keepAliveState: KeepAliveState = {
  enabled: false,
  intervalMinutes: 14,
  targetUrl: null,
  startedAt: new Date().toISOString(),
  lastPingAt: null,
  lastStatus: null,
  totalPings: 0,
  lastError: null
};

function resolveKeepAliveHealthUrl(): string | null {
  const candidates = [
    process.env.KEEP_ALIVE_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.NODE_ENV === 'production' && process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : ''
  ];

  for (const raw of candidates) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      const base = parsed.origin + parsed.pathname.replace(/\/+$/, '');
      return base.endsWith('/api/health') ? base : `${base}/api/health`;
    } catch {
      // skip invalid URL
    }
  }
  return null;
}

function startKeepAliveScheduler(): void {
  const targetUrl = resolveKeepAliveHealthUrl();
  if (!targetUrl) {
    console.log(
      'ℹ️ Keep-Alive URL topilmadi (RENDER_EXTERNAL_URL yoki KEEP_ALIVE_URL belgilanganda har 14 daqiqada avtomatik uyg\'otish yoqiladi).'
    );
    return;
  }

  keepAliveState.enabled = true;
  keepAliveState.targetUrl = targetUrl;

  const ping = async () => {
    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'salesdoc-keepalive/1.0' },
        signal: AbortSignal.timeout(15000)
      });
      keepAliveState.lastPingAt = new Date().toISOString();
      keepAliveState.lastStatus = res.status;
      keepAliveState.totalPings += 1;
      keepAliveState.lastError = res.ok ? null : `HTTP ${res.status}`;
      console.log(`⏰ [Keep-Alive] ${targetUrl} -> HTTP ${res.status} (jami: ${keepAliveState.totalPings})`);
    } catch (err: any) {
      keepAliveState.lastPingAt = new Date().toISOString();
      keepAliveState.lastStatus = 'error';
      keepAliveState.lastError = err?.message || 'Unknown fetch error';
      console.warn(`⚠️ [Keep-Alive] Ping xatoligi (${targetUrl}): ${keepAliveState.lastError}`);
    }
  };

  console.log(`⏰ [Keep-Alive] Yoqildi: har 14 daqiqada ${targetUrl} uyg'otib turiladi.`);
  setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // API health & keep-alive status routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'salesdoc-integration',
      uptimeSeconds: Math.round(process.uptime()),
      keepAlive: keepAliveState,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/keep-alive', (req, res) => {
    res.json({ success: true, data: keepAliveState });
  });

  // SalesDoc Integration API Router
  app.use('/api/salesdoc', salesDocRouter);

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use((req, res, next) => {
      if (req.path === '/server.cjs' || req.path === '/server.cjs.map') {
        return res.status(404).end();
      }
      next();
    });
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SalesDoc Integration Hub server running on port ${PORT}`);
    try {
      SalesDocVisitMonitorService.getInstance().startBackgroundMonitoring(45);
    } catch (e: any) {
      console.warn('Could not auto-start visit monitoring:', e.message);
    }
    startKeepAliveScheduler();
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
