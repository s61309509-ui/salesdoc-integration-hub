import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Settings,
  Code,
  Sliders,
  Sparkles,
  Info,
  Clock,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface SheetRowData {
  date: string;
  isoDate: string;
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

interface AgentSheetTable {
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

interface GoogleSheetsConfig {
  spreadsheetId?: string;
  webhookUrl?: string;
  autoSyncEnabled: boolean;
  autoIntervalSeconds?: number;
  lastSyncedAt?: string;
  lastSyncedDate?: string;
  lastDataRefreshedAt?: string;
}

interface GoogleSheetsTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function GoogleSheetsTab({ onShowToast }: GoogleSheetsTabProps) {
  const [sheets, setSheets] = useState<AgentSheetTable[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('d0_1');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [config, setConfig] = useState<GoogleSheetsConfig>({ autoSyncEnabled: true });
  const [scriptSnippet, setScriptSnippet] = useState<string>('');

  // Config form state
  const [editWebhookUrl, setEditWebhookUrl] = useState('');
  const [editSpreadsheetId, setEditSpreadsheetId] = useState('');
  const [editAutoSync, setEditAutoSync] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState('2026-09-04');
  const [catchupStartDate, setCatchupStartDate] = useState('2026-09-04');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Load sheets report
  const loadSheetsReport = async (forceRefresh: boolean = false, silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const url = `/api/salesdoc/sheets/report?startDate=${startDate}&endDate=${endDate}&forceRefresh=${forceRefresh}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setSheets(json.data.sheets || []);
        if (json.data.googleSheetsConfig) {
          setConfig(json.data.googleSheetsConfig);
          if (!silent) {
            setEditWebhookUrl(json.data.googleSheetsConfig.webhookUrl || '');
            setEditSpreadsheetId(json.data.googleSheetsConfig.spreadsheetId || '');
            setEditAutoSync(json.data.googleSheetsConfig.autoSyncEnabled ?? true);
          }
        }
      } else {
        throw new Error(json.error || 'Google Sheets hisobotini yuklab bo\'lmadi');
      }
    } catch (err: any) {
      if (!silent) onShowToast(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Load script snippet
  const loadScriptSnippet = async () => {
    try {
      const res = await fetch('/api/salesdoc/sheets/script-snippet');
      const json = await res.json();
      if (json.success && json.data?.snippet) {
        setScriptSnippet(json.data.snippet);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadSheetsReport();
    loadScriptSnippet();
  }, []);

  // Automatically refresh incoming data and Google Sheets preview every 1 minute (60s)
  useEffect(() => {
    const timer = setInterval(() => {
      loadSheetsReport(false, true);
    }, 60000);
    return () => clearInterval(timer);
  }, [startDate, endDate]);

  // Test webhook
  const handleTestWebhook = async () => {
    const urlToTest = editWebhookUrl.trim();
    if (!urlToTest) {
      onShowToast('Avval Webhook URL manzilini kiriting', 'error');
      return;
    }
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch('/api/salesdoc/sheets/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: urlToTest })
      });
      const json = await res.json();
      if (json.success && json.data?.success) {
        setWebhookTestResult({ success: true, message: json.data.message });
        onShowToast(json.data.message, 'success');
      } else {
        const msg = json.data?.message || json.error || 'Webhook javob bermadi';
        setWebhookTestResult({ success: false, message: msg });
        onShowToast(msg, 'error');
      }
    } catch (err: any) {
      setWebhookTestResult({ success: false, message: err.message });
      onShowToast(`Xatolik: ${err.message}`, 'error');
    } finally {
      setTestingWebhook(false);
    }
  };

  // Save config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/salesdoc/sheets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: editWebhookUrl.trim(),
          spreadsheetId: editSpreadsheetId.trim(),
          autoSyncEnabled: editAutoSync
        })
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setShowConfigModal(false);
        onShowToast('Google Sheets sozlamalari muvaffaqiyatli saqlandi!', 'success');
      } else {
        throw new Error(json.error || 'Saqlab bo\'lmadi');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // "Kelgan joyidan to'ldirib borish" (Catchup sync)
  const handleCatchupSync = async (customStart?: string) => {
    const fromDate = customStart || catchupStartDate || '2026-09-04';
    if (!config.webhookUrl) {
      setShowConfigModal(true);
      onShowToast('⚠️ Webhook URL hali saqlanmagan! Iltimos, Apps Script bergan Webhook URL manzilini pastdagi maydonga qo\'ying va Saqlash tugmasini bosing.', 'info');
      return;
    }

    setCatchingUp(true);
    try {
      const res = await fetch('/api/salesdoc/sheets/catchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: fromDate,
          endDate
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        onShowToast(`✅ ${json.data.message}`, 'success');
        await loadSheetsReport(true);
      } else {
        const errorMsg = json.data?.message || json.error || 'To\'ldirishda xatolik yuz berdi';
        onShowToast(errorMsg, 'error');
        if (!config.webhookUrl) {
          setShowConfigModal(true);
        }
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setCatchingUp(false);
    }
  };

  // Sync today or single date
  const handleSyncToday = async () => {
    if (!config.webhookUrl) {
      setShowConfigModal(true);
      onShowToast('Avval Google Sheets Webhook URL ni kiriting', 'info');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/salesdoc/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: endDate })
      });
      const json = await res.json();
      if (json.success) {
        onShowToast(`✅ ${json.data.message}`, 'success');
        await loadSheetsReport(true);
      } else {
        throw new Error(json.data?.message || json.error || 'Sinxronlashda xatolik');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Copy active agent TSV
  const handleCopyTsv = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    onShowToast("TSV nusxalandi! Google Sheets ga o'tib A ustundan Ctrl+V bosing.", 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  // Copy Apps Script snippet
  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptSnippet);
    setCopiedScript(true);
    onShowToast("Apps Script kodi nusxalandi! Google Sheets -> Extensions -> Apps Script ga qo'ying.", 'success');
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const currentSheet = sheets.find((s) => s.agentId === selectedAgentId) || sheets[0];

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Title & Description */}
          <div className="flex items-start space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Google Sheets Avtomatik Sinxronizatsiyasi
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/80 rounded-full uppercase">
                  1 & 2-Komanda
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800/80 rounded-full">
                  Kelgan joyidan to'ldirish
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Har bir agent varag'ida birinchi jadval <b>1-Komanda</b>, ikkinchisi <b>2-Komanda</b>.
                Ishlangan kunlarda <b>Возврат</b> va <b>Територия</b> to'liq to'ldiriladi. Ishlanmagan ochiq kunlarga umuman tegilmaydi!
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Catch-up Missing Spots from 4th September */}
            <button
              id="sheets-catchup-btn"
              onClick={() => handleCatchupSync(catchupStartDate)}
              disabled={catchingUp || loading}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/50 border border-emerald-400/30 transition disabled:opacity-50"
              title="4-sentabrdan boshlab bugungacha bo'sh qolgan joylarni to'ldiradi"
            >
              <Sparkles className={`w-4 h-4 ${catchingUp ? 'animate-spin' : 'text-emerald-200'}`} />
              <span>{catchingUp ? "To'ldirilmoqda..." : "4-sentabrdan boshlab to'ldirish"}</span>
            </button>

            {/* Alternative: from 31.08 */}
            <button
              id="sheets-catchup-all-btn"
              onClick={() => handleCatchupSync('2026-08-31')}
              disabled={catchingUp || loading}
              className="px-2.5 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-medium border border-slate-700 transition disabled:opacity-50"
              title="31.08 dan boshlab to'ldirish"
            >
              31.08 dan boshlab
            </button>

            {/* Sync Today */}
            <button
              id="sheets-sync-today-btn"
              onClick={handleSyncToday}
              disabled={syncing || loading}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-xl text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              title="Bugungi kun qatorini Google Sheets ga yuborish"
            >
              <Send className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
              <span>{syncing ? 'Yuborilmoqda...' : 'Kunlik Webhook'}</span>
            </button>

            {/* Refresh Live */}
            <button
              id="sheets-refresh-btn"
              onClick={() => loadSheetsReport(true)}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
              title="Qayta yuklash"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Apps Script Snippet Code */}
            <button
              id="sheets-code-btn"
              onClick={() => setShowScriptModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition"
              title="Google Sheets uchun Apps Script kodi"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>Apps Script Kodi</span>
            </button>

            {/* Settings */}
            <button
              id="sheets-settings-btn"
              onClick={() => setShowConfigModal(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
              title="Google Sheets Webhook Sozlamalari"
            >
              <Settings className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Sync Status Info Strip */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Webhook holati:</span>
              <span className={`font-medium ${config.webhookUrl ? 'text-emerald-400' : 'text-amber-400'}`}>
                {config.webhookUrl ? 'Ulangan' : 'URL kiritilmagan'}
              </span>
            </div>

            <div className="hidden sm:flex items-center space-x-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Avto-yangilanish:</span>
              <span className="text-emerald-300 font-medium">
                {config.autoSyncEnabled ? 'Har 1 daqiqada faol (Sheets + Ma\'lumotlar)' : "Faqat ma'lumotlar har 1 daqiqada"}
              </span>
            </div>

            {config.lastDataRefreshedAt && (
              <div className="hidden md:flex items-center space-x-1.5 text-slate-400">
                <RefreshCw className="w-3 h-3 text-blue-400" />
                <span>Ma'lumot yangilangan:</span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {new Date(config.lastDataRefreshedAt).toLocaleTimeString('uz-UZ')}
                </span>
              </div>
            )}

            {config.lastSyncedAt && (
              <div className="hidden md:flex items-center space-x-1.5 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sheets sinxron:</span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {new Date(config.lastSyncedAt).toLocaleTimeString('uz-UZ')}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <span className="inline-block px-2 py-0.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 rounded">
              ✅ Ishlangan kunlar to'liq to'ldiriladi
            </span>
            <span className="inline-block px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-400 rounded">
              🛡️ Ishlanmagan ochiq kunlarga tegilmaydi
            </span>
          </div>
        </div>
      </div>

      {/* Agent Selection Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 overflow-x-auto">
        <div className="flex items-center space-x-1 sm:space-x-2">
          {sheets.map((s) => {
            const isSelected = s.agentId === selectedAgentId;
            return (
              <button
                key={s.agentId}
                id={`tab-sheet-${s.agentId}`}
                onClick={() => setSelectedAgentId(s.agentId)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>{s.sheetTitle}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {s.totals?.activeDays || 0} kun
                </span>
              </button>
            );
          })}
        </div>

        {/* Copy 1-Click TSV */}
        {currentSheet && (
          <button
            id="copy-agent-tsv-btn"
            onClick={() => handleCopyTsv(currentSheet.tsvContent)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition shrink-0 ml-2"
            title="Ushbu varaqning barcha qatorlarini TSV formatida nusxalash (Google Sheets ga to'g'ridan-to'g'ri qo'yish mumkin)"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Nusxalandi!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Varaqni nusxalash (Ctrl+V)</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Sheet Summary Cards */}
      {currentSheet && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400">Agent Profili</span>
            <div className="text-sm font-bold text-white mt-0.5 truncate" title={currentSheet.agentName}>
              {currentSheet.sheetTitle}
            </div>
            <span className="text-[10px] text-emerald-400">SalesDoc {currentSheet.agentId}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400">Ishlangan Faol Kunlar</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              {currentSheet.totals.activeDays} kun
            </div>
            <span className="text-[10px] text-slate-500">
              Jami {currentSheet.rows.length} kundan
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-amber-400 font-medium">1-Komanda Savdosi</span>
            <div className="text-sm font-bold text-slate-100 mt-0.5">
              {Math.round(currentSheet.totals.team1Sales).toLocaleString('uz-UZ')} so'm
            </div>
            <span className="text-[10px] text-slate-400">AKB: {currentSheet.totals.team1AkbTotal}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-indigo-400 font-medium">2-Komanda Savdosi</span>
            <div className="text-sm font-bold text-slate-100 mt-0.5">
              {Math.round(currentSheet.totals.team2Sales).toLocaleString('uz-UZ')} so'm
            </div>
            <span className="text-[10px] text-slate-400">AKB: {currentSheet.totals.team2AkbTotal}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-emerald-400 font-medium">Jami Umumiy Savdo</span>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              {Math.round(currentSheet.totals.totalSales).toLocaleString('uz-UZ')} so'm
            </div>
            <span className="text-[10px] text-slate-400">Vizit: {currentSheet.totals.visitedTotal}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400">Google Sheets Varaq</span>
            <div className="text-xs font-bold text-slate-200 mt-0.5 flex items-center space-x-1">
              <span>{currentSheet.sheetTitle}</span>
              <span className="text-[9px] px-1 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
                A1:S40
              </span>
            </div>
            <span className="text-[10px] text-slate-500">2 ta parallel jadval</span>
          </div>
        </div>
      )}

      {/* Main Dual Table Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="text-xs font-semibold text-slate-200">
              Varaq: <span className="text-emerald-400">{currentSheet?.sheetTitle}</span> (2026-08-31 dan bugungacha)
            </div>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-800/60 text-amber-300 rounded-full font-medium">
                1-Komanda (A-I ustunlar)
              </span>
              <span className="px-2 py-0.5 bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 rounded-full font-medium">
                2-Komanda (K-S ustunlar)
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <span>Bo'sh (ishlanmagan) kunlar:</span>
            <span className="font-mono text-slate-300">
              {currentSheet ? currentSheet.rows.filter((r) => !r.worked).length : 0} ta
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[620px] scrollbar-thin scrollbar-thumb-slate-700">
          <table className="w-full text-[11px] text-left border-collapse">
            {/* Super Header */}
            <thead className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800 text-slate-300 uppercase tracking-wider text-[10px]">
              <tr>
                {/* 1-Komanda Header */}
                <th colSpan={9} className="py-2.5 px-3 bg-amber-950/40 text-amber-300 border-r border-slate-800 text-center font-bold">
                  1 - KOMANDA JADVALI (Ustunlar A - I)
                </th>
                {/* Blank separator */}
                <th className="w-4 bg-slate-950 border-r border-slate-800"></th>
                {/* 2-Komanda Header */}
                <th colSpan={9} className="py-2.5 px-3 bg-indigo-950/40 text-indigo-300 text-center font-bold">
                  2 - KOMANDA JADVALI (Ustunlar K - S)
                </th>
              </tr>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400">
                {/* 1-Komanda columns */}
                <th className="py-2 px-2.5">Сана</th>
                <th className="py-2 px-2.5">Територия</th>
                <th className="py-2 px-2 text-right">ОКБ</th>
                <th className="py-2 px-2 text-right">ВИЗИТ</th>
                <th className="py-2 px-2 text-right">АКБ</th>
                <th className="py-2 px-2 text-right">Отказ</th>
                <th className="py-2 px-3 text-right">Сум</th>
                <th className="py-2 px-2.5 text-right font-bold text-amber-400">Возрат</th>
                <th className="py-2 px-2 text-right border-r border-slate-800">Кирилмади</th>

                {/* Gap */}
                <th className="w-4 bg-slate-950 border-r border-slate-800"></th>

                {/* 2-Komanda columns */}
                <th className="py-2 px-2.5">Сана</th>
                <th className="py-2 px-2.5">Територия</th>
                <th className="py-2 px-2 text-right">ОКБ</th>
                <th className="py-2 px-2 text-right">ВИЗИТ</th>
                <th className="py-2 px-2 text-right">АКБ</th>
                <th className="py-2 px-2 text-right">Отказ</th>
                <th className="py-2 px-3 text-right">Сум</th>
                <th className="py-2 px-2.5 text-right font-bold text-indigo-400">Возрат</th>
                <th className="py-2 px-2 text-right">Кирилмади</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono">
              {currentSheet?.rows.map((row, idx) => {
                if (!row.worked) {
                  // Unworked day: Leave completely untouched!
                  return (
                    <tr
                      key={idx}
                      className="bg-slate-950/40 hover:bg-slate-900/30 text-slate-600 transition-colors"
                    >
                      <td className="py-1.5 px-2.5 font-medium text-slate-500">{row.date}</td>
                      <td colSpan={8} className="py-1.5 px-2 text-slate-600 italic border-r border-slate-800">
                        Ishlanmagan kun — ochiq qoldiriladi (tegilmaydi)
                      </td>
                      <td className="w-4 bg-slate-950 border-r border-slate-800"></td>
                      <td className="py-1.5 px-2.5 font-medium text-slate-500">{row.date}</td>
                      <td colSpan={8} className="py-1.5 px-2 text-slate-600 italic">
                        Ishlanmagan kun — ochiq qoldiriladi (tegilmaydi)
                      </td>
                    </tr>
                  );
                }

                // Worked day: Real values
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/50 transition-colors text-slate-200"
                  >
                    {/* 1-Komanda */}
                    <td className="py-1.5 px-2.5 font-medium text-slate-300">{row.date}</td>
                    <td className="py-1.5 px-2.5 text-slate-200 font-sans truncate max-w-[140px]" title={row.territory}>
                      {row.territory || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{row.okb}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">{row.visited}</td>
                    <td className="py-1.5 px-2 text-right text-amber-300 font-semibold">{row.team1.akb}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{row.team1.rejects}</td>
                    <td className="py-1.5 px-3 text-right font-medium text-white">
                      {row.team1.sales > 0 ? row.team1.sales.toLocaleString('en-US') : '0'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-amber-400">
                      {row.team1.returns > 0 ? (
                        <span className="px-1.5 py-0.5 bg-amber-500/10 rounded">
                          {row.team1.returns.toLocaleString('en-US')}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-500 border-r border-slate-800">
                      {row.unvisited}
                    </td>

                    {/* Gap */}
                    <td className="w-4 bg-slate-950 border-r border-slate-800"></td>

                    {/* 2-Komanda */}
                    <td className="py-1.5 px-2.5 font-medium text-slate-300">{row.date}</td>
                    <td className="py-1.5 px-2.5 text-slate-200 font-sans truncate max-w-[140px]" title={row.territory}>
                      {row.territory || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{row.okb}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">{row.visited}</td>
                    <td className="py-1.5 px-2 text-right text-indigo-300 font-semibold">{row.team2.akb}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{row.team2.rejects}</td>
                    <td className="py-1.5 px-3 text-right font-medium text-white">
                      {row.team2.sales > 0 ? row.team2.sales.toLocaleString('en-US') : '0'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-400">
                      {row.team2.returns > 0 ? (
                        <span className="px-1.5 py-0.5 bg-indigo-500/10 rounded">
                          {row.team2.returns.toLocaleString('en-US')}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-500">
                      {row.unvisited}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Webhook & Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">Google Sheets Sozlamalari</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Google Apps Script Webhook URL
                </label>
                <input
                  type="text"
                  value={editWebhookUrl}
                  onChange={(e) => setEditWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-slate-500">
                    Google Sheets -&gt; Extensions -&gt; Apps Script bo'limidagi Web App URL manzili.
                  </p>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook || !editWebhookUrl.trim()}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-medium transition disabled:opacity-40"
                  >
                    {testingWebhook ? 'Tekshirilmoqda...' : 'Ulanishni tekshirish'}
                  </button>
                </div>

                {webhookTestResult && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl border text-[11px] flex items-start space-x-2 ${
                      webhookTestResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {webhookTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{webhookTestResult.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Spreadsheet ID (Ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={editSpreadsheetId}
                  onChange={(e) => setEditSpreadsheetId(e.target.value)}
                  placeholder="1kX9..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Har 1 Daqiqada Avto-Sinxronizatsiya</div>
                  <div className="text-[11px] text-slate-400">Har 1 daqiqada (60 soniyada) kiruvchi ma'lumotlar va Google Sheets avtomatik yangilanadi</div>
                </div>
                <input
                  type="checkbox"
                  checked={editAutoSync}
                  onChange={(e) => setEditAutoSync(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowConfigModal(false);
                  setShowScriptModal(true);
                }}
                className="text-[11px] text-amber-400 hover:underline flex items-center space-x-1"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Apps Script kodini olish</span>
              </button>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
                >
                  {savingConfig ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Apps Script Snippet Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-2.5">
                <Code className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Google Apps Script Webhook Kodi</h3>
                  <p className="text-[11px] text-slate-400">Ushbu kodni Google Sheets ga qo'yib Web App qilib e'lon qiling</p>
                </div>
              </div>
              <button
                onClick={() => setShowScriptModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="my-4 p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-xs text-amber-200 space-y-1 shrink-0">
              <div className="font-semibold flex items-center space-x-1.5">
                <Info className="w-4 h-4 text-amber-400" />
                <span>Qanday o'rnatish kerak:</span>
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-300/90 pl-1">
                <li>Google Sheets jadvalingizni oching</li>
                <li>Yuqoridagi menyudan <b>Extensions -&gt; Apps Script</b> bo'limiga kiring</li>
                <li>U yerdagi kod o'rniga quyidagi kodni to'liq qo'ying</li>
                <li>O'ng tomondan <b>Deploy -&gt; New deployment -&gt; Web app</b> ni tanlang</li>
                <li><b>Who has access: Anyone</b> qilib <b>Deploy</b> tugmasini bosing</li>
                <li>Berilgan Web App URL manzilini yuqoridagi Sozlamalar bo'limiga kiriting!</li>
              </ol>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <button
                onClick={handleCopyScript}
                className="absolute top-3 right-3 z-10 flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg border border-slate-700 shadow-md transition"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Nusxalandi!' : 'Kodni nusxalash'}</span>
              </button>
              <pre className="p-4 text-[11px] font-mono text-emerald-300 overflow-y-auto max-h-[340px] leading-relaxed select-all">
                {scriptSnippet}
              </pre>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
