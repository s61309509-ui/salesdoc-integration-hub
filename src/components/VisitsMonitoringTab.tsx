import { useState, useEffect, FormEvent } from 'react';
import {
  Camera,
  CameraOff,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Send,
  RefreshCw,
  Sliders,
  Settings,
  PlusCircle,
  Eye,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  MessageSquare,
  Sparkles,
  Search,
  Filter,
  Clock,
  Building2,
  User,
  ShoppingBag,
  Info,
  Upload,
  Key,
  FileText,
  Database,
  Calendar,
  Trash2,
  Users
} from 'lucide-react';
import { TelegramTeamsModal } from './TelegramTeamsModal';
import { DailyReportModal } from './DailyReportModal';
import { PhotoAiAnalysisRecord } from '../types';

export interface PhotoInfo {
  id: string;
  url: string;
  cat_id: string;
  cat_name: string;
  date: string;
  claimed_polka?: boolean;
  is_polka: boolean;
  is_outside: boolean;
  is_distant_shot?: boolean;
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
  category_name?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  planned?: number;
  visited?: number;
  gps_visit?: number;
  distance_meters: number | null;
  distance_source?: 'exact' | 'gps_flag_only' | 'unknown';
  is_distant: boolean;
  has_order?: number;
  order_summa?: number;
  photos: PhotoInfo[];
  photo_categories: string;
  photo_dates: string;
  has_polka_photo: boolean;
  has_outside_photo: boolean;
  has_covered_camera_photo?: boolean;
  has_fake_polka_photo?: boolean;
  equipment?: string;
  last_order_date?: string;
  last_order_categories?: string;
  last_order_summa?: string;
  status: 'valid' | 'valid_polka_exception' | 'violation_distant_no_polka' | 'violation_no_photos' | 'violation_missing_polka' | 'violation_covered_camera' | 'violation_fake_polka';
  status_label: string;
  violation_type: 'none' | 'distant_no_polka' | 'no_photos' | 'missing_polka' | 'covered_camera' | 'fake_polka';
  should_alert: boolean;
  alert_title: string;
  alert_reason: string;
  telegram_sent?: boolean;
  telegram_sent_at?: string;
  target_chat_id?: string;
}

export interface VisitMonitorSummary {
  totalVisits: number;
  visitedCount: number;
  withPhotosCount: number;
  distantVisitsCount: number;
  polkaExceptionsCount: number;
  violationsDistantNoPolkaCount: number;
  violationsCoveredCameraCount?: number;
  violationsFakePolkaCount?: number;
  violationsNoPhotosCount: number;
  violationsMissingPolkaCount: number;
  aiAuditedPhotosCount?: number;
  totalViolationsCount: number;
  telegramSentCount: number;
}

interface TelegramConfig {
  botToken: string;
  botTokenMasked?: string;
  defaultChatId: string;
  agentChatIds: Record<string, string>;
  autoSendAlerts: boolean;
}

interface VisitsMonitoringTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function VisitsMonitoringTab({ onShowToast }: VisitsMonitoringTabProps) {
  const [items, setItems] = useState<VisitAnalysisItem[]>([]);
  const [summary, setSummary] = useState<VisitMonitorSummary | null>(null);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [autoBatchSending, setAutoBatchSending] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiAnalyzingPhoto, setAiAnalyzingPhoto] = useState<Record<string, boolean>>({});

  // Background monitor status
  const [monitorStatus, setMonitorStatus] = useState<{
    isRunning: boolean;
    autoAiAudit?: boolean;
    intervalSeconds: number;
    lastRunAt?: string;
    totalRuns: number;
  }>({
    isRunning: true,
    autoAiAudit: true,
    intervalSeconds: 60,
    totalRuns: 0
  });

  // Date range filters (Asia/Tashkent UTC+5)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  // SalesDoc API status
  const [apiStatus, setApiStatus] = useState<{
    connected: boolean;
    hasToken: boolean;
    error?: string;
    totalApiVisits: number;
    totalApiPhotos: number;
    dateFrom: string;
    dateTo: string;
  } | null>(null);

  // Import SalesDoc Report Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // SalesDoc Token / Login Modal
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [updatingToken, setUpdatingToken] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  // Filters
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Modals
  const [previewPhoto, setPreviewPhoto] = useState<{
    id?: string;
    url: string;
    title: string;
    meta?: string;
    clientName?: string;
    agentName?: string;
    catName?: string;
    is_covered_camera?: boolean;
    is_distant_photo?: boolean;
    ai_analysis?: PhotoAiAnalysisRecord;
  } | null>(null);
  const [previewTelegramItem, setPreviewTelegramItem] = useState<VisitAnalysisItem | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [showTeamsModal, setShowTeamsModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);

  // Incoming / Test Visit Form State
  const [simAgentId, setSimAgentId] = useState('d0_1');
  const [simClientName, setSimClientName] = useState('');
  const [simDistance, setSimDistance] = useState<number>(165);
  const [simHasOutsidePhoto, setSimHasOutsidePhoto] = useState(true);
  const [simHasPolkaPhoto, setSimHasPolkaPhoto] = useState(false);
  const [simOutsideUrl, setSimOutsideUrl] = useState('');
  const [simPolkaUrl, setSimPolkaUrl] = useState('');
  const [simOrderSum, setSimOrderSum] = useState<number>(0);
  const [simSubmitting, setSimSubmitting] = useState(false);

  // Config modal state
  const [configBotToken, setConfigBotToken] = useState('');
  const [configDefaultChatId, setConfigDefaultChatId] = useState('');
  const [configAgentChatIds, setConfigAgentChatIds] = useState<Record<string, string>>({});
  const [configAutoSend, setConfigAutoSend] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [testingBot, setTestingBot] = useState(false);

  // Fetch monitoring data
  const fetchData = async (silent = false, customFrom?: string, customTo?: string) => {
    if (!silent) setLoading(true);
    try {
      const qFrom = customFrom !== undefined ? customFrom : dateFrom;
      const qTo = customTo !== undefined ? customTo : dateTo;
      const params = new URLSearchParams();
      if (selectedAgent && selectedAgent !== 'all') params.set('agentId', selectedAgent);
      if (qFrom) params.set('dateFrom', qFrom);
      if (qTo) params.set('dateTo', qTo);

      if (silent) {
        // Fast background poll: only fetch monitoring data
        const visitsRes = await fetch(`/api/salesdoc/visits/monitoring?${params.toString()}`).then((r) => r.json());
        if (visitsRes.success && visitsRes.data) {
          setItems(visitsRes.data.items || []);
          setSummary(visitsRes.data.summary || null);
          if (visitsRes.data.apiStatus) setApiStatus(visitsRes.data.apiStatus);
          if (visitsRes.data.telegramConfig) setTelegramConfig(visitsRes.data.telegramConfig);
        }
      } else {
        const [visitsRes, configRes, monitorRes] = await Promise.all([
          fetch(`/api/salesdoc/visits/monitoring?${params.toString()}`).then((r) => r.json()),
          fetch('/api/salesdoc/telegram/config').then((r) => r.json()),
          fetch('/api/salesdoc/visits/monitor-status').then((r) => r.json())
        ]);

        if (visitsRes.success && visitsRes.data) {
          setItems(visitsRes.data.items || []);
          setSummary(visitsRes.data.summary || null);
          if (visitsRes.data.apiStatus) {
            setApiStatus(visitsRes.data.apiStatus);
          }
          if (visitsRes.data.telegramConfig) {
            setTelegramConfig(visitsRes.data.telegramConfig);
          }
        }

        if (configRes.success && configRes.data) {
          setTelegramConfig(configRes.data);
          setConfigBotToken(configRes.data.botToken || '');
          setConfigDefaultChatId(configRes.data.defaultChatId || '');
          setConfigAgentChatIds(configRes.data.agentChatIds || {});
          setConfigAutoSend(configRes.data.autoSendAlerts ?? false);
        }

        if (monitorRes.success && monitorRes.data) {
          setMonitorStatus(monitorRes.data);
        }
      }
    } catch (err: any) {
      console.error('Failed to load visit monitoring data:', err);
      if (!silent) onShowToast(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedAgent, dateFrom, dateTo]);

  // Periodic poll only if background monitoring is actively running
  useEffect(() => {
    if (!monitorStatus?.isRunning) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [monitorStatus?.isRunning, selectedAgent, dateFrom, dateTo]);

  // Send single visit to Telegram
  const handleSendToTelegram = async (item: VisitAnalysisItem) => {
    setSendingId(item.visitKey);
    try {
      const res = await fetch('/api/salesdoc/visits/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitKey: item.visitKey, item })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`Xabar Telegram guruhga muvaffaqiyatli yuborildi! (Chat: ${data.data.chatId})`, 'success');
        fetchData(true);
      } else {
        onShowToast(data.error || 'Telegramga yuborishda xatolik yuz berdi', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSendingId(null);
    }
  };

  // Auto-send all pending violations
  const handleBatchAutoSend = async () => {
    setAutoBatchSending(true);
    try {
      const res = await fetch('/api/salesdoc/visits/auto-send-violations', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const { sentCount, failedCount } = data.data;
        if (sentCount > 0) {
          onShowToast(`${sentCount} ta tashrif nazorati xabari agentlar guruhiga yuborildi!`, 'success');
        } else {
          onShowToast("Yangi yuborilmagan ogohlantirishlar mavjud emas (barchasi jo'natilgan yoki istisno)", 'info');
        }
        if (failedCount > 0) {
          onShowToast(`${failedCount} ta xabarni yuborishda xatolik yuz berdi`, 'error');
        }
        fetchData(true);
      } else {
        onShowToast(data.error || 'Batch yuborishda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setAutoBatchSending(false);
    }
  };

  // Immediate scan
  const handleTriggerScan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/salesdoc/visits/scan-now', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast(`Monitoring skanerlash yakunlandi. Jami: ${data.data.scanned} ta tashrif, ${data.data.violationsDetected} ta ogohlantirish`, 'success');
        fetchData(true);
      } else {
        onShowToast(data.error || 'Skanerlashda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Toggle Background Monitoring
  const handleToggleBackgroundMonitor = async (enable: boolean) => {
    try {
      const res = await fetch('/api/salesdoc/visits/monitor-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRunning: enable, intervalSeconds: monitorStatus.intervalSeconds })
      });
      const data = await res.json();
      if (data.success) {
        setMonitorStatus(data.data);
        onShowToast(`Avtomatik monitoring ${enable ? 'FAOL' : 'TO`XTATILDI'}`, 'info');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    }
  };

  // Toggle Automatic AI Vision Photo Audit
  const handleToggleAutoAiAudit = async (enable: boolean) => {
    try {
      const res = await fetch('/api/salesdoc/visits/monitor-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoAiAudit: enable })
      });
      const data = await res.json();
      if (data.success) {
        setMonitorStatus(data.data);
        onShowToast(
          `Avtomatik AI Foto Auditi ${enable ? 'YOQILDI' : "O'CHIRILDI"}`,
          'info'
        );
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    }
  };

  // Save Telegram Config
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/salesdoc/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: configBotToken,
          defaultChatId: configDefaultChatId,
          agentChatIds: configAgentChatIds,
          autoSendAlerts: configAutoSend
        })
      });
      const data = await res.json();
      if (data.success) {
        setTelegramConfig(data.data);
        onShowToast('Telegram bot va guruh sozlamalari muvaffaqiyatli saqlandi!', 'success');
        setShowConfigModal(false);
        fetchData(true);
      } else {
        onShowToast(data.error || 'Sozlamalarni saqlashda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  // Test Telegram Bot
  const handleTestBot = async () => {
    setTestingBot(true);
    try {
      const res = await fetch('/api/salesdoc/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: configBotToken,
          chatId: configDefaultChatId
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        onShowToast(`Bot ulanishi muvaffaqiyatli! (@${data.data.botInfo?.username}). ${data.data.message}`, 'success');
      } else {
        onShowToast(data.error || 'Botga ulanib bo`lmadi', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setTestingBot(false);
    }
  };

  // Submit Incoming Visit
  const handleSimulateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSimSubmitting(true);
    try {
      const photos: any[] = [];
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

      if (simHasOutsidePhoto) {
        photos.push({
          url: simOutsideUrl.trim(),
          cat_id: 'd0_2',
          cat_name: 'Do`kon (Tashqi Tomoni)',
          date: nowStr
        });
      }

      if (simHasPolkaPhoto) {
        photos.push({
          url: simPolkaUrl.trim(),
          cat_id: 'd0_1',
          cat_name: 'Do`kon ichi (Polka )',
          date: nowStr
        });
      }

      const res = await fetch('/api/salesdoc/visits/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: simAgentId,
          client_id: `CLI_IN_${Date.now()}`,
          client_name: simClientName.trim(),
          distance_meters: Number(simDistance),
          photos,
          order_summa: Number(simOrderSum)
        })
      });

      const data = await res.json();
      if (data.success) {
        const item = data.data.item as VisitAnalysisItem;
        if (item.status === 'valid_polka_exception') {
          onShowToast(`Tashrif qabul qilindi: 2-rasmida Polka mavjud bo'lgani sababli guruhga tashlanmadi (Istisno!)`, 'info');
        } else if (item.should_alert) {
          onShowToast(`Ogohlantirish holati (${item.alert_title}). Telegram guruhga uzatildi!`, 'info');
        } else {
          onShowToast(`Tashrif qabul qilindi: To'g'ri me'yordagi tashrif`, 'success');
        }
        setShowSimulateModal(false);
        fetchData(true);
      } else {
        onShowToast(data.error || 'Tashrifni qabul qilishda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSimSubmitting(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Import SalesDoc Report (From "Отчет по визитам" & "GPS 2" or Google Sheets)
  const handleImportSubmit = async (customContent?: string) => {
    const raw = customContent !== undefined ? customContent : importText;
    if (!raw.trim()) {
      onShowToast("Iltimos, SalesDoc hisobotidan nusxalangan qatorlarni kiriting", 'error');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/salesdoc/visits/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`${data.data.importedCount} ta tashrif muvaffaqiyatli import qilindi va tahlil qilindi!`, 'success');
        setShowImportModal(false);
        setImportText('');
        fetchData(false);
      } else {
        onShowToast(data.error || 'Import qilishda xatolik yuz berdi', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  // Clear custom/imported visits
  const handleClearCustom = async () => {
    if (!window.confirm("Barcha import qilingan va qo'shilgan tashriflarni tozalashni xohlaysizmi?")) return;
    try {
      const res = await fetch('/api/salesdoc/visits/clear-custom', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast("Tashriflar tozalandi", 'info');
        fetchData(false);
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    }
  };

  // Update SalesDoc API token
  const handleSaveToken = async () => {
    if (!tokenInput.trim()) {
      onShowToast("Iltimos, tokenni kiriting", 'error');
      return;
    }
    setUpdatingToken(true);
    try {
      let rawTok = tokenInput.trim();
      let userIdVal: string | undefined = undefined;
      if (rawTok.includes(':')) {
        const parts = rawTok.split(':');
        userIdVal = parts[0];
        rawTok = parts.slice(1).join(':');
      }

      const res = await fetch('/api/salesdoc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawTok, userId: userIdVal })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast("SalesDoc API tokeni diskda doimiy saqlandi va ulandi!", 'success');
        setShowTokenModal(false);
        setTokenInput('');
        fetchData(false);
      } else {
        onShowToast(data.error || 'Tokenni saqlashda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setUpdatingToken(false);
    }
  };

  // Login to SalesDoc
  const handleSalesDocLogin = async () => {
    if (!loginInput.trim() || !passwordInput.trim()) {
      onShowToast("Login va parolni kiriting", 'error');
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch('/api/salesdoc/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput.trim(), password: passwordInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast("SalesDoc tizimiga muvaffaqiyatli ulandi! Login va token diskda doimiy saqlandi.", 'success');
        setShowTokenModal(false);
        setPasswordInput('');
        fetchData(false);
      } else {
        onShowToast(data.error || 'SalesDoc tizimiga kirib bo`lmadi', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  // Open token modal with prefetched login
  const handleOpenTokenModal = async () => {
    try {
      const res = await fetch('/api/salesdoc/status').then((r) => r.json());
      if (res.success && res.data) {
        if (res.data.savedLogin) setLoginInput(res.data.savedLogin);
      }
    } catch (e) {}
    setShowTokenModal(true);
  };

  // Toggle photo flags (covered camera or distant photo)
  const handleTogglePhotoFlag = async (photoIdOrUrl: string, flag: 'covered_camera' | 'distant_photo', reason?: string) => {
    try {
      const res = await fetch('/api/salesdoc/visits/toggle-photo-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIdOrUrl, flag, reason })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(
          flag === 'covered_camera'
            ? "Kamera yopilganlik holati yangilandi"
            : "Masofa (uzoqdan rasm) holati yangilandi",
          'success'
        );
        if (previewPhoto && (previewPhoto.id === photoIdOrUrl || previewPhoto.url === photoIdOrUrl)) {
          setPreviewPhoto((prev) => prev ? {
            ...prev,
            is_covered_camera: flag === 'covered_camera' ? !prev.is_covered_camera : prev.is_covered_camera,
            is_distant_photo: flag === 'distant_photo' ? !prev.is_distant_photo : prev.is_distant_photo
          } : null);
        }
        await fetchData(true);
      }
    } catch (err: any) {
      onShowToast(err.message || 'Xatolik yuz berdi', 'error');
    }
  };

  // AI Vision batch photo audit across filtered visits
  const handleAiAnalyzeBatch = async () => {
    setAiBatchLoading(true);
    try {
      const res = await fetch('/api/salesdoc/ai/analyze-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          agentId: selectedAgent,
          maxPhotos: 15
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        onShowToast(
          `AI Foto Auditi: ${json.data.analyzedCount} ta yangi rasm tekshirildi (${json.data.skippedCachedCount ?? 0} ta keshdan).`,
          'success'
        );
        await fetchData(true);
      } else {
        onShowToast(json.error || 'AI Foto auditida xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Server xatoligi', 'error');
    } finally {
      setAiBatchLoading(false);
    }
  };

  // AI Vision audit for a single photo
  const handleAiAnalyzeSinglePhoto = async (opts: {
    photoId?: string;
    photoUrl: string;
    clientName?: string;
    agentName?: string;
    catName?: string;
    forceRefresh?: boolean;
  }) => {
    const key = opts.photoId || opts.photoUrl;
    setAiAnalyzingPhoto((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/salesdoc/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });
      const json = await res.json();
      if (json.success && json.data) {
        const analysis = json.data as PhotoAiAnalysisRecord;
        onShowToast(`AI Natija: ${analysis.verdict} — ${analysis.summaryUz}`, 'info');
        if (previewPhoto && (previewPhoto.id === opts.photoId || previewPhoto.url === opts.photoUrl)) {
          setPreviewPhoto((prev) => (prev ? { ...prev, ai_analysis: analysis } : null));
        }
        await fetchData(true);
      } else {
        onShowToast(json.error || 'Rasmni AI bilan tekshirishda xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Tarmoq xatoligi', 'error');
    } finally {
      setAiAnalyzingPhoto((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    // Status filter
    if (statusFilter === 'violations' && !item.should_alert) return false;
    if (statusFilter === 'fake_polka' && item.status !== 'violation_fake_polka' && !item.photos.some((p) => p.is_category_mismatch || p.is_screen_or_rephoto)) return false;
    if (statusFilter === 'covered_camera' && item.status !== 'violation_covered_camera' && !item.photos.some((p) => p.is_covered_camera)) return false;
    if (statusFilter === 'distant_no_polka' && item.status !== 'violation_distant_no_polka') return false;
    if (statusFilter === 'polka_exception' && item.status !== 'valid_polka_exception') return false;
    if (statusFilter === 'valid' && item.status !== 'valid') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.client_name.toLowerCase().includes(q);
      const matchAgent = item.agent_name.toLowerCase().includes(q);
      const matchReason = (item.alert_reason || '').toLowerCase().includes(q);
      if (!matchName && !matchAgent && !matchReason) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Center */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-slate-100">
                    Agent Tashriflari & Polka Foto Nazorati
                  </h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      monitorStatus.isRunning
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-700 text-slate-300 border-slate-600'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        monitorStatus.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {monitorStatus.isRunning ? 'Jonli Monitoring Faol' : 'To`xtatilgan'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  100m dan uzoqda vizit qilingan, polka rasmi olinmagan do'konlar aniqlanib agent guruhiga yuboriladi. 2-rasmida Polka bo'lsa istisno qilinadi.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-import-salesdoc-report"
              onClick={() => setShowImportModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Hisobotni Import Qilish</span>
            </button>

            <button
              id="btn-salesdoc-token"
              onClick={handleOpenTokenModal}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>SalesDoc Sozlamalari</span>
            </button>

            <button
              id="btn-simulate-visit"
              onClick={() => setShowSimulateModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <PlusCircle className="w-4 h-4 text-indigo-400" />
              <span>Sinov Tashrifi</span>
            </button>

            <button
              id="btn-auto-batch-send"
              disabled={autoBatchSending}
              onClick={handleBatchAutoSend}
              className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${autoBatchSending ? 'animate-bounce' : ''}`} />
              <span>Guruhga Yuborish</span>
            </button>

            <button
              id="btn-open-teams-config"
              onClick={() => setShowTeamsModal(true)}
              className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs"
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>6 Agent Guruhlari</span>
            </button>

            <button
              id="btn-ai-photo-audit"
              disabled={aiBatchLoading}
              onClick={handleAiAnalyzeBatch}
              className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-purple-400 ${aiBatchLoading ? 'animate-spin' : ''}`} />
              <span>{aiBatchLoading ? 'AI Tekshirmoqda...' : 'AI Foto Auditi'}</span>
            </button>

            <button
              id="btn-toggle-auto-ai-audit"
              type="button"
              onClick={() => handleToggleAutoAiAudit(monitorStatus.autoAiAudit === false)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition ${
                monitorStatus.autoAiAudit !== false
                  ? 'bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-300 border-fuchsia-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title="Yangi tashriflar kelganda Gemini Vision rasmlarni avtomatik tekshiradi"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Avto AI Audit: {monitorStatus.autoAiAudit !== false ? 'Yoqilgan' : "O'chirilgan"}
              </span>
            </button>

            <button
              id="btn-open-daily-report"
              onClick={() => setShowDailyReportModal(true)}
              className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs"
            >
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>22:30 Kunlik Hisobot</span>
            </button>

            <button
              id="btn-trigger-scan"
              disabled={loading}
              onClick={handleTriggerScan}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
              title="Hozir yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="btn-open-telegram-config"
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Telegram Sozlamalari</span>
            </button>

            <button
              id="btn-clear-custom"
              onClick={handleClearCustom}
              className="p-2 bg-slate-800/80 hover:bg-red-950/40 hover:text-red-300 text-slate-400 border border-slate-700/60 rounded-lg transition"
              title="Import qilingan tashriflarni tozalash"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telegram Groups & Daily Report Prominent Action Banner */}
        <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-100 text-sm">
                  Telegram Guruhlarni Ulash (6 ta Agent x 2 Komanda)
                </span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded text-[10px] border border-emerald-500/30">
                  Faol
                </span>
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Har bir agentning <b>1-Komandasi</b> (TikTok, Semichka...) va <b>2-Komandasi</b> (Vafli, LacoooL...) o'zining Telegram guruhiga ulanadi. Tashrif nazorati va 22:30 dagi hisobot faqat o'z guruhiga boradi.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-start md:self-auto">
            <button
              onClick={() => setShowTeamsModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition text-xs cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Guruhlarni Ulash & Sozlash</span>
            </button>

            <button
              onClick={() => setShowDailyReportModal(true)}
              className="px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 font-semibold rounded-lg flex items-center space-x-1.5 transition text-xs cursor-pointer"
            >
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>22:30 Hisobotini Ko'rish</span>
            </button>
          </div>
        </div>

        {/* Live SalesDoc API Status Banner */}
        {apiStatus && (
          <div className="pt-2">
            {apiStatus.error ? (
              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-amber-300">SalesDoc API: {apiStatus.error}</span>
                    <p className="text-slate-400 mt-0.5">
                      SalesDoc-dagi jonli 'Отчет по визитам' va 'GPS 2' ma'lumotlarini yuklash uchun yangi API token kiriting yoki hisobotingizdan qatorlarni import qiling.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium flex items-center space-x-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Hisobotni Import Qilish</span>
                  </button>
                  <button
                    onClick={handleOpenTokenModal}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md font-medium flex items-center space-x-1"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sozlamalar & Token</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 rounded-lg flex items-center justify-between text-xs text-emerald-400">
                <div className="flex items-center space-x-2 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SalesDoc API ulangan: {apiStatus.totalApiVisits} ta tashrif, {apiStatus.totalApiPhotos} ta foto-hisobot olindi</span>
                </div>
                <span className="text-slate-400 text-[11px]">Sana oralig'i: {apiStatus.dateFrom} &rarr; {apiStatus.dateTo}</span>
              </div>
            )}
          </div>
        )}

        {/* System Rules Definition Callout */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
            <div className="flex items-center space-x-2 font-semibold text-red-400 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>1. Uzoqda & Polka Yo'q</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              100m dan uzoqda vizit qilinib, polka olinmagan bo'lsa &rarr; <b className="text-red-300">"❓ Nega tashrif uzoqda qilingan?"</b> deb guruhga yuboriladi.
            </p>
          </div>

          <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-lg">
            <div className="flex items-center space-x-2 font-semibold text-purple-300 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>2. Istisno: Haqiqiy Polka</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Uzoqdan olingan bo'lsa ham, AI Vision tomonidan <b className="text-purple-300">haqiqiy ichki Polka</b> tasdiqlansa &rarr; Guruhga <b className="text-emerald-400">tashlanmaydi</b>.
            </p>
          </div>

          <div className="p-3 bg-fuchsia-950/30 border border-fuchsia-500/40 rounded-lg">
            <div className="flex items-center space-x-2 font-semibold text-fuchsia-300 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>3. Soxta "Do'kon ichi" (AI)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Agent "Do'kon ichi" deb tashqi fasad, ekran/qayta rasm yoki begona rasm yuklasa, AI aniqlab <b className="text-fuchsia-300">soxta rasm</b> sifatida guruhga yuboradi.
            </p>
          </div>

          <div className="p-3 bg-rose-950/30 border border-rose-500/40 rounded-lg">
            <div className="flex items-center space-x-2 font-semibold text-rose-300 mb-1">
              <CameraOff className="w-3.5 h-3.5 text-rose-400" />
              <span>4. Kamera Yopilgan / Qora</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Barmoq yoki qorong'u bilan yopilgan rasmlar <b className="text-rose-300">to'sib olingan rasm</b> sifatida darhol guruhga yetkaziladi.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Jami Tashriflar</div>
          <div className="text-xl font-bold text-slate-100 mt-1">{summary?.totalVisits ?? items.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">AI ko'rgan: {summary?.aiAuditedPhotosCount ?? 0} ta rasm</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-red-400 uppercase tracking-wider">&gt;100m Uzoqda</div>
          <div className="text-xl font-bold text-red-400 mt-1">{summary?.distantVisitsCount ?? 0}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">GPS me'yordan oshgan</div>
        </div>

        <div className="bg-slate-900 border border-fuchsia-500/30 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-fuchsia-300 uppercase tracking-wider">Soxta Polka (AI)</div>
          <div className="text-xl font-bold text-fuchsia-300 mt-1">{summary?.violationsFakePolkaCount ?? 0}</div>
          <div className="text-[10px] text-fuchsia-400/80 mt-0.5">Kategoriya mos emas / ekran</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Kamera Yopiq</div>
          <div className="text-xl font-bold text-rose-400 mt-1">{summary?.violationsCoveredCameraCount ?? 0}</div>
          <div className="text-[10px] text-rose-500/80 mt-0.5">Yopiq/qora soxta rasmlar</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Polka Istisnolari</div>
          <div className="text-xl font-bold text-purple-300 mt-1">{summary?.polkaExceptionsCount ?? 0}</div>
          <div className="text-[10px] text-emerald-500 mt-0.5">Haqiqiy Polka (Tashlanmaydi)</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Nazorat Xabarlari</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{summary?.totalViolationsCount ?? 0}</div>
          <div className="text-[10px] text-amber-500 mt-0.5">Guruhga yuborilishi lozim</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Guruhga Yuborilgan</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{summary?.telegramSentCount ?? 0}</div>
          <div className="text-[10px] text-emerald-500 mt-0.5">Telegramga yetkazildi</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Agent Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              id="filter-agent-select"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Barcha Agentlar</option>
              <option value="d0_1">ТП1(Супервайзер 99-362-31-33)</option>
              <option value="d0_2">ТП2 (Супервайзер) 99-362-31-33</option>
              <option value="d0_3">ТП3(Супервайзер 99-362-31-33)</option>
              <option value="d0_4">ТП4 (Супервайзер 99-362-31-33)</option>
              <option value="d0_5">ТП5 (Супервайзер 99-362-31-33)</option>
              <option value="d0_6">ТП6 (Супервайзер 99-362-31-33)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              id="filter-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Barcha Holatlar ({items.length})</option>
              <option value="violations">Faqat Nazorat / Ogohlantirishlar ({summary?.totalViolationsCount ?? 0})</option>
              <option value="fake_polka">🎭 Soxta "Do'kon Ichi" / Mos Emas ({summary?.violationsFakePolkaCount ?? 0})</option>
              <option value="covered_camera">🚫 Kamerani Yopib Olingan ({summary?.violationsCoveredCameraCount ?? 0})</option>
              <option value="distant_no_polka">&gt;100m Uzoqda (Polka Yo'q) ({summary?.violationsDistantNoPolkaCount ?? 0})</option>
              <option value="polka_exception">🛡️ Polka Istisnolari (Guruhga Tashlanmaydi) ({summary?.polkaExceptionsCount ?? 0})</option>
              <option value="valid">✅ To'g'ri Me'yordagi Tashriflar</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
              title="Boshlanish sanasi"
            />
            <span className="text-slate-500">&ndash;</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
              title="Tugash sanasi"
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Do'kon yoki agent qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      {/* Visits List */}
      <div className="space-y-3">
        {loading && items.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
            <div className="text-sm font-medium text-slate-200">Tashriflar va foto-hisobotlar tahlil qilinmoqda...</div>
            <div className="text-xs text-slate-400 mt-1">SalesDoc getVisit, getPhotoReport va getOrder tekshirilmoqda</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-200">
                Tanlangan parametrlar bo'yicha tashriflar mavjud emas
              </div>
              <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1 leading-relaxed">
                SalesDoctor API orqali yangi tashriflarni yuklash uchun tokenni yangilang yoki o'zingizning "Отчет по визитам" va "GPS 2" hisobotingizdan nusxalab import qiling.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>Hisobotni Nusxalab Import Qilish</span>
              </button>

              <button
                onClick={() => setShowTokenModal(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
              >
                <Key className="w-4 h-4 text-amber-400" />
                <span>SalesDoc Token Kiritish</span>
              </button>
            </div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = !!expandedCards[item.visitKey];
            const isSending = sendingId === item.visitKey;

            return (
              <div
                key={item.visitKey}
                id={`visit-card-${item.visitKey}`}
                className={`bg-slate-900 border rounded-xl transition overflow-hidden ${
                  item.status === 'violation_fake_polka'
                    ? 'border-fuchsia-500/50 bg-fuchsia-950/15'
                    : item.status === 'violation_covered_camera'
                    ? 'border-rose-500/50 bg-rose-950/15'
                    : item.status === 'violation_distant_no_polka'
                    ? 'border-red-500/40 bg-red-950/10'
                    : item.status === 'valid_polka_exception'
                    ? 'border-purple-500/40 bg-purple-950/10'
                    : item.should_alert
                    ? 'border-amber-500/40 bg-amber-950/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Client & Agent Info */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-slate-100 flex items-center space-x-1.5">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span>{item.client_name}</span>
                        </span>
                        <span className="text-[11px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                          {item.category_name || 'MM-Mini Market'}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded-md border border-indigo-500/20 font-medium">
                          👤 {item.agent_name}
                        </span>
                      </div>

                      {/* Status / Alert Banner */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {item.status === 'violation_fake_polka' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-fuchsia-500/20 border border-fuchsia-500/40 rounded-lg text-fuchsia-200 font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-fuchsia-300" />
                            <span>🎭 Soxta "Do'kon ichi" rasmi — AI aniqladi!</span>
                          </div>
                        )}

                        {item.status === 'violation_covered_camera' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 rounded-lg text-rose-200 font-medium">
                            <CameraOff className="w-3.5 h-3.5 text-rose-300" />
                            <span>🚫 Kamera yopib olingan / Qora rasm!</span>
                          </div>
                        )}

                        {item.status === 'violation_distant_no_polka' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>❓ Nega tashrif uzoqda qilingan? (Guruhga yuborilishi shart)</span>
                          </div>
                        )}

                        {item.status === 'valid_polka_exception' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg text-purple-200 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
                            <span>🛡️ To'g'ri (Istisno: Haqiqiy Polka tasdiqlangan — guruhga tashlanmaydi!)</span>
                          </div>
                        )}

                        {item.status === 'violation_missing_polka' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>⚠️ Polka rasmi olinmagan</span>
                          </div>
                        )}

                        {item.status === 'violation_no_photos' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 font-medium">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>
                              {item.visited === 0
                                ? "📋 Hali kirilmagan (22:30 hisobotdan keyin ro'yxatda boradi)"
                                : "📋 Foto olinmagan (22:30 hisobotda ko'rinadi)"}
                            </span>
                          </div>
                        )}

                        {item.status === 'valid' && (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>✅ To'g'ri tashrif (Polka va tashqi ko'rinish rasmlari mavjud)</span>
                          </div>
                        )}

                        {/* Distance Badge */}
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md font-mono font-medium ${
                            item.is_distant
                              ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                              : item.distance_meters === null
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          <MapPin className="w-3 h-3" />
                          <span>
                            {item.distance_meters !== null && item.distance_meters !== undefined
                              ? `${item.distance_meters} metr ${item.is_distant ? "(100m me'yordan ortiq!)" : "(me'yorda)"}`
                              : item.is_distant
                                ? "100m dan uzoqda (GPS flag: 0)"
                                : "Masofa aniqlanmagan"}
                          </span>
                        </span>

                        {item.date && (
                          <span className="text-slate-400 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{item.date}</span>
                          </span>
                        )}
                      </div>

                      {/* Reason Description if violation */}
                      {item.alert_reason && (
                        <p className="text-xs text-slate-300 bg-slate-950/40 p-2 rounded-lg border border-slate-800/80">
                          <span className="font-semibold text-slate-200">Sabab: </span>
                          {item.alert_reason}
                        </p>
                      )}
                    </div>

                    {/* Right: Telegram Status & Actions */}
                    <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center space-x-2">
                        {item.telegram_sent ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Guruhga yetkazilgan</span>
                          </span>
                        ) : item.status === 'valid_polka_exception' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-800 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium">
                            <span>Istisno (tashlanmaydi)</span>
                          </span>
                        ) : item.should_alert ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium">
                            <span>Guruhga kutilmoqda</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-800 text-slate-400 rounded-lg text-xs">
                            <span>Me'yorda</span>
                          </span>
                        )}

                        <button
                          onClick={() => setPreviewTelegramItem(item)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs flex items-center space-x-1 transition"
                          title="Telegram xabarini ko'rish"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">Ko'rinish</span>
                        </button>

                        {item.status === 'violation_no_photos' && !item.should_alert ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800/80 text-slate-400 border border-slate-700 rounded-lg text-xs">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>22:30 da ro'yxatda boradi</span>
                          </span>
                        ) : (
                          <button
                            disabled={isSending}
                            onClick={() => handleSendToTelegram(item)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition ${
                              item.should_alert && !item.telegram_sent
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                            <span>{item.telegram_sent ? 'Qayta Yuborish' : 'Guruhga Yuborish'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => toggleExpand(item.visitKey)}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 transition"
                      >
                        <span>{isExpanded ? "Qisqartirish" : "To'liq tafsilotlar"}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Photos Grid preview */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                        <Camera className="w-3.5 h-3.5 text-slate-400" />
                        <span>Yuklangan Fotolar ({item.photos.length} ta)</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.photo_categories || "Foto hisobot mavjud emas"}
                      </span>
                    </div>

                    {item.photos.length === 0 ? (
                      <div className="p-3.5 bg-slate-950/50 rounded-lg border border-dashed border-slate-700 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-2.5">
                          <Clock className="w-5 h-5 text-indigo-400 shrink-0" />
                          <div>
                            <div className="font-semibold text-slate-200">
                              {item.visited === 0
                                ? "Agent hali bu do'konga yetib bormagan (Rejadagi do'kon)"
                                : "Do'konga tashrif qilingan, foto-hisobot yuklanmagan"}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {item.visited === 0
                                ? "Kirmagan do'konlar kunduzi guruhga yuborilmaydi — faqat 22:30 dagi kunlik hisobotdan keyin ro'yxat sifatida tashlanadi."
                                : "Uzoqda vizit bo'lmagan holatlarda kunduzi alohida rasm xabari yuborilmaydi."}
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-indigo-500/15 text-indigo-300 font-semibold rounded border border-indigo-500/30 text-[11px] shrink-0 self-start sm:self-center">
                          ⏰ 22:30 hisobotdan keyin
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {item.photos.map((p, idx) => {
                          const pKey = p.id || p.url || `idx_${idx}`;
                          const isAiBusy = !!aiAnalyzingPhoto[pKey];
                          const verdict = p.ai_analysis?.verdict;
                          return (
                            <div
                              key={p.id || idx}
                              className="group relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden hover:border-indigo-500/50 transition flex flex-col"
                            >
                              <div
                                onClick={() =>
                                  p.url &&
                                  setPreviewPhoto({
                                    id: p.id,
                                    url: p.url,
                                    title: `${idx + 1}-Rasm: ${p.cat_name}`,
                                    meta: `${item.client_name} • ${p.date}`,
                                    clientName: item.client_name,
                                    agentName: item.agent_name,
                                    catName: p.cat_name,
                                    is_covered_camera: p.is_covered_camera,
                                    is_distant_photo: p.is_distant_photo,
                                    ai_analysis: p.ai_analysis
                                  })
                                }
                                className={`aspect-video relative overflow-hidden bg-slate-950 ${p.url ? 'cursor-pointer' : ''}`}
                              >
                                {p.url ? (
                                  <>
                                    <img
                                      src={p.url}
                                      alt={p.cat_name}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                      <Eye className="w-5 h-5 text-white drop-shadow" />
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-2 text-center">
                                    <CameraOff className="w-5 h-5 mb-1 opacity-60" />
                                    <span>Rasm URL kiritilmagan</span>
                                  </div>
                                )}

                                {/* Index & Category tag */}
                                <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-xs px-1.5 py-0.5 rounded text-[10px] font-mono text-white font-bold">
                                  #{idx + 1}
                                </div>

                                {p.is_covered_camera ? (
                                  <div className="absolute top-1.5 right-1.5 bg-rose-600/90 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    Yopiq
                                  </div>
                                ) : p.is_category_mismatch || p.is_screen_or_rephoto ? (
                                  <div className="absolute top-1.5 right-1.5 bg-fuchsia-600/95 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    Soxta / Mos emas
                                  </div>
                                ) : p.is_polka ? (
                                  <div className="absolute top-1.5 right-1.5 bg-purple-600/90 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    Polka
                                  </div>
                                ) : p.is_outside ? (
                                  <div className="absolute top-1.5 right-1.5 bg-blue-600/90 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    Tashqi
                                  </div>
                                ) : null}

                                {verdict && (
                                  <div
                                    className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                      verdict === 'polka_inside'
                                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                                        : verdict === 'covered_or_dark'
                                          ? 'bg-rose-950/90 text-rose-300 border-rose-500/40'
                                          : verdict === 'screen_or_rephoto'
                                            ? 'bg-fuchsia-950/90 text-fuchsia-200 border-fuchsia-500/40'
                                            : verdict === 'store_front'
                                              ? 'bg-blue-950/90 text-blue-300 border-blue-500/40'
                                              : 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                                    }`}
                                  >
                                    AI: {verdict === 'polka_inside'
                                      ? 'Polka'
                                      : verdict === 'store_front'
                                        ? 'Tashqi'
                                        : verdict === 'covered_or_dark'
                                          ? 'Yopiq/Qora'
                                          : verdict === 'screen_or_rephoto'
                                            ? 'Ekran/Qayta rasm'
                                            : verdict === 'unclear_or_irrelevant'
                                              ? 'Noaniq'
                                              : "O'qilmadi"}
                                  </div>
                                )}
                              </div>

                              <div className="p-2 text-[11px] flex-1 flex flex-col justify-between gap-1.5">
                                <div>
                                  <div className="font-medium text-slate-200 truncate">{p.cat_name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{p.date || '—'}</div>
                                  {(p.mismatch_reason || p.ai_analysis?.mismatchReasonUz) && (
                                    <div className="text-[10px] text-fuchsia-300 font-semibold mt-1 line-clamp-2">
                                      ⚠ {p.mismatch_reason || p.ai_analysis?.mismatchReasonUz}
                                    </div>
                                  )}
                                  {p.ai_analysis?.summaryUz && (
                                    <div className="text-[10px] text-purple-300 mt-1 line-clamp-2">{p.ai_analysis.summaryUz}</div>
                                  )}
                                </div>
                                {p.url && (
                                  <button
                                    type="button"
                                    disabled={isAiBusy}
                                    onClick={() =>
                                      handleAiAnalyzeSinglePhoto({
                                        photoId: p.id,
                                        photoUrl: p.url,
                                        clientName: item.client_name,
                                        agentName: item.agent_name,
                                        catName: p.cat_name,
                                        forceRefresh: Boolean(p.ai_analysis)
                                      })
                                    }
                                    className="w-full py-1 px-2 rounded bg-slate-900 hover:bg-purple-600/20 text-purple-300 border border-purple-500/30 text-[10px] font-medium flex items-center justify-center space-x-1 transition disabled:opacity-50"
                                  >
                                    <Sparkles className={`w-3 h-3 ${isAiBusy ? 'animate-spin' : ''}`} />
                                    <span>{isAiBusy ? 'Tekshirilmoqda...' : p.ai_analysis ? 'AI Qayta Tekshirish' : 'AI Tekshirish'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expanded Visit Details Drawer */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3 rounded-lg">
                      <div>
                        <div className="text-slate-400 font-medium">Uskuna / Inventar:</div>
                        <div className="text-slate-200 mt-0.5">{item.equipment || 'Нет'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Oxirgi buyurtma sanasi:</div>
                        <div className="text-slate-200 mt-0.5">{item.last_order_date || '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Oxirgi buyurtma tovarlari:</div>
                        <div className="text-slate-200 mt-0.5 truncate">{item.last_order_categories || '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Oxirgi buyurtma summasi:</div>
                        <div className="text-emerald-400 font-semibold mt-0.5">
                          {item.last_order_summa ? `${item.last_order_summa} so'm` : '0'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Tashrif kaliti (Key):</div>
                        <div className="text-slate-400 font-mono text-[10px] mt-0.5 truncate">{item.visitKey}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Mo'ljaldagi Telegram guruh:</div>
                        <div className="text-indigo-300 font-mono text-[10px] mt-0.5">
                          {item.target_chat_id || "Sozlanmagan (Standart guruhga yuboriladi)"}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">GPS Holati:</div>
                        <div className="text-slate-200 mt-0.5">
                          {item.distance_meters !== null && item.distance_meters !== undefined
                            ? `${item.gps_visit === 1 ? "Do'kon ichida" : "Masofada"} (${item.distance_meters}m)`
                            : item.gps_visit === 1
                              ? "Do'kon ichida (GPS tasdiqlangan)"
                              : item.gps_visit === 0
                                ? "100m dan uzoqda (GPS flag: 0)"
                                : "GPS ma'lumoti kiritilmagan"}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-medium">Tashrif rejalashtirilganligi:</div>
                        <div className="text-slate-200 mt-0.5">
                          {item.planned === 1 ? 'Rejali tashrif' : 'Rejasiz vizit'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Telegram Message Preview */}
      {previewTelegramItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100">Telegram Xabari Ko'rinishi</h3>
              </div>
              <button
                onClick={() => setPreviewTelegramItem(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-xs text-slate-400">
                Agent guruhiga quyidagi formatda va ilova qilingan rasmlar bilan xabar yetkaziladi:
              </div>

              {/* Telegram bubble mock */}
              <div className="bg-[#182533] text-slate-200 rounded-xl p-4 text-xs font-sans border border-[#2b3c4f] shadow-inner space-y-2">
                {/* Simulated photo header */}
                {previewTelegramItem.photos.some((p) => p.url) && (
                  <div className="grid grid-cols-2 gap-1.5 rounded-lg overflow-hidden mb-2">
                    {previewTelegramItem.photos.filter((p) => p.url).slice(0, 2).map((p, i) => (
                      <div key={i} className="aspect-video bg-black/40 overflow-hidden relative">
                        <img src={p.url} alt="Telegram photo preview" className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[9px] text-white">
                          {p.cat_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="font-bold text-sm text-white">🏪 {previewTelegramItem.client_name}</div>
                <div>Категория клиента: {previewTelegramItem.category_name || "Ko'rsatilmagan"}</div>
                <div>Категория фото-отчёта: {previewTelegramItem.photo_categories}</div>
                <div>Дата и время фото: {previewTelegramItem.photo_dates || '—'}</div>
                <div>Оборудование/инвентарь: {previewTelegramItem.equipment || "Yo'q"}</div>
                <div>Дата последнего заказа: {previewTelegramItem.last_order_date || '—'}</div>
                <div>Категории последнего заказа: {previewTelegramItem.last_order_categories || '—'}</div>
                <div>Сумма последнего заказа: {previewTelegramItem.last_order_summa || '0'}</div>
                <div>Агент: {previewTelegramItem.agent_name}</div>

                {previewTelegramItem.should_alert && (
                  <div className="pt-2 border-t border-red-500/30 text-red-300 font-medium">
                    {previewTelegramItem.status === 'violation_fake_polka' ? (
                      <div className="text-fuchsia-300 font-bold text-sm mb-1">
                        🎭 SOXTA "DO&apos;KON ICHI (POLKA)" / MOS EMAS RASM!
                      </div>
                    ) : previewTelegramItem.status === 'violation_covered_camera' ? (
                      <div className="text-rose-300 font-bold text-sm mb-1">
                        🚫 KAMERANI YOPIB / TO&apos;SIB OLINGAN RASM!
                      </div>
                    ) : previewTelegramItem.violation_type === 'distant_no_polka' ? (
                      <div className="text-amber-300 font-bold text-sm mb-1">❓ Nega tashrif uzoqda qilingan?</div>
                    ) : (
                      <div className="text-amber-300 font-bold text-sm mb-1">⚠️ {previewTelegramItem.alert_title}</div>
                    )}
                    {previewTelegramItem.status !== 'violation_fake_polka' && (
                      <div>
                        📍 <b>Masofa:</b>{' '}
                        {previewTelegramItem.distance_meters !== null && previewTelegramItem.distance_meters !== undefined
                          ? `${previewTelegramItem.distance_meters} metr (100m me'yordan ortiq)`
                          : "100m dan uzoqda (GPS flag: 0)"}
                      </div>
                    )}
                    <div>📸 <b>Sabab:</b> {previewTelegramItem.alert_reason}</div>
                  </div>
                )}

                {previewTelegramItem.status === 'valid_polka_exception' && (
                  <div className="pt-2 border-t border-purple-500/30 text-purple-300">
                    🛡️ <b>Istisno:</b> Do'kon uzoqdan olingan bo'lsa-da, haqiqiy Polka rasmi AI tomonidan tasdiqlangani sababli guruhga tashlanmaydi.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end space-x-2">
              <button
                onClick={() => setPreviewTelegramItem(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Yopish
              </button>
              <button
                onClick={() => {
                  handleSendToTelegram(previewTelegramItem);
                  setPreviewTelegramItem(null);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Hozir Yuborish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Fullscreen Photo Preview + AI Vision Inspection */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-xs">
          <div className="max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-100">{previewPhoto.title}</h4>
                {previewPhoto.meta && <p className="text-xs text-slate-400">{previewPhoto.meta}</p>}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={!!aiAnalyzingPhoto[previewPhoto.id || previewPhoto.url]}
                  onClick={() =>
                    handleAiAnalyzeSinglePhoto({
                      photoId: previewPhoto.id,
                      photoUrl: previewPhoto.url,
                      clientName: previewPhoto.clientName,
                      agentName: previewPhoto.agentName,
                      catName: previewPhoto.catName,
                      forceRefresh: true
                    })
                  }
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${aiAnalyzingPhoto[previewPhoto.id || previewPhoto.url] ? 'animate-spin' : ''}`} />
                  <span>AI Vision bilan tekshirish</span>
                </button>
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="text-slate-400 hover:text-slate-200 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-2 bg-black flex items-center justify-center max-h-[65vh] overflow-hidden">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                referrerPolicy="no-referrer"
                className="max-h-[62vh] w-auto object-contain rounded"
              />
            </div>
            {previewPhoto.ai_analysis && (
              <div className="p-3 border-t border-slate-800 bg-slate-950/90 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-purple-300">AI Xulosasi ({previewPhoto.ai_analysis.verdict}):</span>
                    <span className="text-[11px] font-mono text-slate-400">Ishonchlilik: {previewPhoto.ai_analysis.confidence}%</span>
                    {previewPhoto.ai_analysis.matchesClaimedCategory === false && (
                      <span className="px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 text-[10px] font-bold">
                        Kategoriya Mos Emas!
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200">{previewPhoto.ai_analysis.summaryUz}</p>
                  {previewPhoto.ai_analysis.mismatchReasonUz && (
                    <p className="text-fuchsia-300 font-medium">⚠️ {previewPhoto.ai_analysis.mismatchReasonUz}</p>
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  {previewPhoto.ai_analysis.model}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Simulate Incoming Visit */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100">Yangi Tashrif Simulyatsiyasi (Jonli Tekshiruv)</h3>
              </div>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="p-4 space-y-4 text-xs">
              <p className="text-slate-400">
                Agent mobil ilovadan tashrif va foto yuborgan holatni simulyatsiya qilib, qoidalar qanday ishlashini darhol tekshirishingiz mumkin.
              </p>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Agent:</label>
                <select
                  value={simAgentId}
                  onChange={(e) => setSimAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="d0_1">ТП1 (Toshkent Markaz)</option>
                  <option value="d0_2">ТП2 (Chilonzor & Sergeli)</option>
                  <option value="d0_3">ТП3 (Mirzo Ulugbek)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Do'kon / Mijoz nomi:</label>
                <input
                  type="text"
                  value={simClientName}
                  onChange={(e) => setSimClientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Masofa: <span className="text-indigo-400 font-mono font-bold">{simDistance} metr</span>{' '}
                  {simDistance > 100 ? (
                    <span className="text-red-400">(100m dan uzoqda!)</span>
                  ) : (
                    <span className="text-emerald-400">(100m ichida)</span>
                  )}
                </label>
                <input
                  type="range"
                  min="5"
                  max="400"
                  step="5"
                  value={simDistance}
                  onChange={(e) => setSimDistance(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>5m (Do'konda)</span>
                  <span>100m (Chegara)</span>
                  <span>400m (Uzoqda)</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2.5">
                <div className="font-semibold text-slate-300">Olingan Rasmlar (ixtiyoriy haqiqiy URL):</div>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simHasOutsidePhoto}
                    onChange={(e) => setSimHasOutsidePhoto(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-200">1-Rasm: Do'kon tashqi ko'rinishi</span>
                </label>
                {simHasOutsidePhoto && (
                  <input
                    type="url"
                    value={simOutsideUrl}
                    onChange={(e) => setSimOutsideUrl(e.target.value)}
                    placeholder="https://... (tashqi rasm URL, ixtiyoriy)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-[11px] text-slate-200 font-mono"
                  />
                )}

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simHasPolkaPhoto}
                    onChange={(e) => setSimHasPolkaPhoto(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-200">
                    2-Rasm: Do'kon ichi (Polka rasmi){' '}
                    <span className="text-purple-400 font-medium">(2-rasmda Polka bo'lsa istisno qilinadi)</span>
                  </span>
                </label>
                {simHasPolkaPhoto && (
                  <input
                    type="url"
                    value={simPolkaUrl}
                    onChange={(e) => setSimPolkaUrl(e.target.value)}
                    placeholder="https://... (polka rasm URL, ixtiyoriy)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-[11px] text-slate-200 font-mono"
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Buyurtma summasi (so'm):</label>
                <input
                  type="number"
                  value={simOrderSum}
                  onChange={(e) => setSimOrderSum(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3 rounded-lg text-[11px] border bg-slate-950/80 border-slate-800">
                <div className="font-semibold text-slate-300 mb-1">Kutilayotgan Natija:</div>
                {simDistance > 100 && !simHasPolkaPhoto ? (
                  <div className="text-red-400">
                    📍 <b>Uzoqda vizit qilingan:</b> 100m dan uzoqda ({simDistance}m) va Polka olinmagan! Agent guruhiga: <i>"❓ Nega tashrif uzoqda qilingan?"</i> deb yuboriladi.
                  </div>
                ) : simDistance > 100 && simHasPolkaPhoto ? (
                  <div className="text-purple-300">
                    🛡️ <b>Istisno:</b> 100m dan uzoqda bo'lsa-da, 2-rasmida Polka mavjud! Guruhga tashlanmaydi.
                  </div>
                ) : !simHasPolkaPhoto && simHasOutsidePhoto ? (
                  <div className="text-amber-400">
                    ⚠️ <b>Polka rasmi olinmagan:</b> Guruhga to'liq ma'lumoti bilan yuboriladi.
                  </div>
                ) : !simHasPolkaPhoto && !simHasOutsidePhoto ? (
                  <div className="text-rose-400">
                    📋 <b>Foto-hisobot yo'q:</b> Kechki ro'yxatda kiritiladi.
                  </div>
                ) : (
                  <div className="text-emerald-400">
                    ✅ <b>To'g'ri tashrif:</b> Me'yorda.
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSimulateModal(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={simSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <PlusCircle className={`w-3.5 h-3.5 ${simSubmitting ? 'animate-spin' : ''}`} />
                  <span>Tashrifni Qabul Qilish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Telegram Bot & Agent Groups Config */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-100">Telegram Bot & Agent Guruhlarni Sozlash</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto text-xs">
              <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-lg text-indigo-300 leading-relaxed">
                Qoidabuzarliklar to'g'ridan-to'g'ri tegishli agentning Telegram guruhiga tashlanishi uchun bot token va har bir agent guruhining Chat ID sini kiriting.
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Telegram Bot Token (@BotFather):</label>
                <div className="flex space-x-2">
                  <input
                    type="password"
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                    value={configBotToken}
                    onChange={(e) => setConfigBotToken(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingBot || !configBotToken}
                    onClick={handleTestBot}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {testingBot ? 'Tekshirilmoqda...' : 'Sinash'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Standart Guruh / Rahbariyat Chat ID (Fallback):</label>
                <input
                  type="text"
                  placeholder="-1001234567890"
                  value={configDefaultChatId}
                  onChange={(e) => setConfigDefaultChatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Agar agent uchun alohida guruh kiritilmagan bo'lsa, xabarlar shu guruhga yuboriladi.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <div className="font-semibold text-slate-200 mb-2">Har Bir Agent Uchun Alohida Guruh Chat ID:</div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">ТП1 (Toshkent Markaz) guruhi Chat ID:</label>
                    <input
                      type="text"
                      placeholder="-100..."
                      value={configAgentChatIds['d0_1'] || ''}
                      onChange={(e) =>
                        setConfigAgentChatIds({ ...configAgentChatIds, d0_1: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-0.5">ТП2 (Chilonzor & Sergeli) guruhi Chat ID:</label>
                    <input
                      type="text"
                      placeholder="-100..."
                      value={configAgentChatIds['d0_2'] || ''}
                      onChange={(e) =>
                        setConfigAgentChatIds({ ...configAgentChatIds, d0_2: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-0.5">ТП3 (Mirzo Ulugbek) guruhi Chat ID:</label>
                    <input
                      type="text"
                      placeholder="-100..."
                      value={configAgentChatIds['d0_3'] || ''}
                      onChange={(e) =>
                        setConfigAgentChatIds({ ...configAgentChatIds, d0_3: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configAutoSend}
                    onChange={(e) => setConfigAutoSend(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <div className="font-medium text-slate-200">Avtomatik Guruhga Yuborish (Background Auto-Dispatch)</div>
                    <div className="text-[10px] text-slate-400">
                      Yangi tashrif kelganda agar qoidabuzarlik aniqlansa (va istisnoga tushmasa), darhol avtomatik agent guruhiga yuboriladi.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Yopish
              </button>
              <button
                type="button"
                disabled={configSaving}
                onClick={handleSaveConfig}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {configSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SalesDoc Report Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    SalesDoc Hisobotini Import Qilish (Отчет по визитам & GPS 2)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    SalesDoctor yoki Google Sheets jadvalidagi qatorlarni nusxalab bu yerga tashlang
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-lg space-y-1.5 text-slate-300">
                <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
                  <Info className="w-4 h-4" />
                  <span>Qanday formatda nusxalash kerak?</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  SalesDoctor tizimidagi <b>Отчет по визитам</b> va <b>GPS 2</b> hisobotingizdan qatorlarni to'g'ridan-to'g'ri nusxalab (Ctrl+C & Ctrl+V) tashlashingiz mumkin.
                  Tizim avtomatik ravishda agent, do'kon nomi, masofa (masalan: <i>145 m (Вне радиуса)</i>), polka va tashqi fotosuratlarni aniqlaydi va qoidalar bo'yicha tahlil qiladi.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-200">
                    Jadval matni (Tab yoki vergul bilan ajratilgan qatorlar):
                  </label>
                </div>
                <textarea
                  rows={10}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Агент\tКлиент\tДата\tДистанция\tФотоотчет\tПолка\tСумма\nSalesDoc jadvalidan ko'chirib olingan haqiqiy qatorlarni shu yerga qo'ying...`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Qoidalar bo'yicha tahlil:</div>
                <div>• Masofa &gt; 100m bo'lib, polka rasmi yo'q bo'lsa &rarr; <span className="text-red-400 font-semibold">"Nega tashrif uzoqda qilingan?"</span> qoidabuzarligi aniqlanadi.</div>
                <div>• Masofa &gt; 100m bo'lsa-da, 2-rasmida Polka mavjud bo'lsa &rarr; <span className="text-purple-300 font-semibold">Istisno</span> qilinadi (guruhga tashlanmaydi).</div>
                <div>• Polka rasmi yoki umuman rasm bo'lmasa &rarr; <span className="text-amber-400 font-semibold">Xato rasm / foto yo'q</span> deb belgilanadi.</div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={importing || !importText.trim()}
                onClick={() => handleImportSubmit()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Upload className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />
                <span>{importing ? 'Import qilinmoqda...' : 'Import Qilish va Tahlil Qilish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SalesDoc Token & Login Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    SalesDoctor API Bog'lanishi & Token
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    https://namdistribution.salesdoc.io/api/v2
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* Permanent storage reassurance banner */}
              <div className="p-3 bg-emerald-950/40 border border-emerald-700/60 rounded-xl text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center space-x-1.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Markaziy va Doimiy Saqlash Faol</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Bu yerda yoki yuqori menyuda kiritilgan login yoki token <strong>server diskida doimiy saqlanadi</strong>. Har bir bo'limda alohida so'ralmaydi va admin o'zgartirmaguncha o'chmaydi. Token eskirsa, tizim uni avtomatik yangilaydi.
                </p>
              </div>

              {/* Option A: Paste Token */}
              <div className="space-y-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Variant 1: Yangi Tokenni Qo'lda Kiritish</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  SalesDoctor API tokenini (yoki userId:token formatida) kiriting. Diskda doimiy saqlanadi:
                </p>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="SalesDoctor API tokenini kiriting..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={updatingToken || !tokenInput.trim()}
                    onClick={handleSaveToken}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {updatingToken ? 'Saqlanmoqda...' : 'Tokenni Doimiy Saqlash'}
                  </button>
                </div>
              </div>

              {/* Option B: Login & Password */}
              <div className="space-y-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Variant 2: Login & Parol orqali Kirish (Tavsiya etiladi)</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Login va parolni 1 marta kiritsangiz, tizim avtomatik token oladi va keyinchalik token eskirganda ham avtomatik o'zi yangilab oladi:
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    placeholder="Login / Foydalanuvchi nomi..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Parol..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={loggingIn || !loginInput.trim() || !passwordInput.trim()}
                    onClick={handleSalesDocLogin}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {loggingIn ? 'Bog`lanmoqda...' : 'Kirish & Doimiy Saqlash'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6 Agent Profiles x 2 Teams Telegram Config Modal */}
      <TelegramTeamsModal
        isOpen={showTeamsModal}
        onClose={() => setShowTeamsModal(false)}
        onShowToast={onShowToast}
      />

      {/* 22:30 Daily Report Modal */}
      <DailyReportModal
        isOpen={showDailyReportModal}
        onClose={() => setShowDailyReportModal(false)}
        onShowToast={onShowToast}
      />
    </div>
  );
}
