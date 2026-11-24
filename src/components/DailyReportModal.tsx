import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Calendar,
  Clock,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  MapPin,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Sliders,
  Sparkles
} from 'lucide-react';

interface AgentDailyTeamReport {
  teamName: '1-Komanda' | '2-Komanda';
  teamKey: 'team1' | 'team2';
  chatId?: string;
  topicId?: string;
  territory: string;
  okbTotal: number;
  visitedCount: number;
  akbCount: number;
  rejectsCount: number;
  totalSalesSum: number;
  unvisitedCount: number;
  unvisitedClients: Array<{
    id: string;
    name: string;
    address: string;
    phone: string;
    territory?: string;
  }>;
}

interface AgentDailyReport {
  agentId: string;
  agentName: string;
  date: string;
  isCombinedWorker: boolean;
  territories: string[];
  okbTotal: number;
  visitedCount: number;
  unvisitedCount: number;
  team1: AgentDailyTeamReport;
  team2: AgentDailyTeamReport;
}

interface DailyReportResponse {
  date: string;
  reports: AgentDailyReport[];
  summary: {
    totalAgents: number;
    totalOkb: number;
    totalVisited: number;
    totalUnvisited: number;
    totalTeam1Sales: number;
    totalTeam2Sales: number;
    totalSales: number;
  };
}

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function DailyReportModal({ isOpen, onClose, onShowToast }: DailyReportModalProps) {
  const [data, setData] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduleTime, setScheduleTime] = useState('22:30');
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadReport(selectedDate);
      loadConfig();
    }
  }, [isOpen, selectedDate]);

  const loadReport = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/salesdoc/daily-report/preview?date=${dateStr}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Hisobotni yuklab bo\'lmadi');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/salesdoc/daily-report/config');
      const json = await res.json();
      if (json.success) {
        setScheduleTime(json.data.scheduledTime || '22:30');
        setAutoSendEnabled(json.data.autoSendEnabled ?? true);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleSaveConfig = async () => {
    try {
      const res = await fetch('/api/salesdoc/daily-report/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledTime: scheduleTime,
          autoSendEnabled
        })
      });
      const json = await res.json();
      if (json.success) {
        onShowToast("22:30 avtomatik yuborish jadvali yangilandi!", 'success');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    }
  };

  const handleSendAll = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/salesdoc/daily-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      });
      const json = await res.json();
      if (json.success) {
        onShowToast(`✅ Kunlik hisobot ${json.data.totalSent} ta guruhga muvaffaqiyatli yuborildi!`, 'success');
      } else {
        throw new Error(json.error || 'Yuborishda xatolik yuz berdi');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSendSingleAgent = async (agentId: string, team?: 'team1' | 'team2') => {
    setSending(true);
    try {
      const res = await fetch('/api/salesdoc/daily-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          agentId,
          team: team || 'both'
        })
      });
      const json = await res.json();
      if (json.success && json.data.totalSent > 0) {
        onShowToast(`✅ Hisobot guruhga muvaffaqiyatli yuborildi!`, 'success');
      } else {
        throw new Error(json.data?.results?.[0]?.error || 'Yuborib bo\'lmadi. Guruh Chat ID sozlanganligini tekshiring.');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleAgentExpand = (agId: string) => {
    setExpandedAgents(prev => ({
      ...prev,
      [agId]: !prev[agId]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  Kunlik 22:30 Yakuniy Hisoboti (OKB, AKB, Savdo, Kirmagan do'konlar)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Avtomatik 22:30
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Har bir agentning 1-Komanda va 2-Komanda Telegram guruhlariga kunlik natijalar va kirmagan do'konlar ro'yxati yuboriladi.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 font-medium">Sana:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => loadReport(selectedDate)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              title="Yangilash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Schedule settings quick tweak */}
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-medium">Jadval:</span>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 font-mono text-xs"
            />
            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => setAutoSendEnabled(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
              />
              <span>Avtomatik faol</span>
            </label>
            <button
              onClick={handleSaveConfig}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
            >
              Saqlash
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSendAll}
              disabled={sending || loading}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Yuborilmoqda...' : 'Hozir Barcha Guruhlarga Yuborish (Test)'}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Summary KPIs */}
          {data?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">Jami OKB (Reja)</div>
                <div className="text-lg font-bold text-slate-100 mt-1">
                  {data.summary.totalOkb} <span className="text-xs font-normal text-slate-400">ta</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">Vizit qilinganlar</div>
                <div className="text-lg font-bold text-emerald-400 mt-1">
                  {data.summary.totalVisited} <span className="text-xs font-normal text-slate-400">ta</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-400 font-medium">Kirmagan do'konlar</div>
                <div className="text-lg font-bold text-rose-400 mt-1">
                  {data.summary.totalUnvisited} <span className="text-xs font-normal text-slate-400">ta</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-emerald-400 font-medium">1-Komanda Savdosi</div>
                <div className="text-sm font-bold text-emerald-300 mt-1 truncate">
                  {Math.round(data.summary.totalTeam1Sales).toLocaleString('uz-UZ')} so'm
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] text-sky-400 font-medium">2-Komanda Savdosi</div>
                <div className="text-sm font-bold text-sky-300 mt-1 truncate">
                  {Math.round(data.summary.totalTeam2Sales).toLocaleString('uz-UZ')} so'm
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-indigo-500/30 rounded-xl bg-indigo-950/20">
                <div className="text-[11px] text-indigo-300 font-medium">Jami Kunlik Savdo</div>
                <div className="text-sm font-bold text-indigo-200 mt-1 truncate">
                  {Math.round(data.summary.totalSales).toLocaleString('uz-UZ')} so'm
                </div>
              </div>
            </div>
          )}

          {/* Agents List */}
          <div className="space-y-4">
            <div className="font-semibold text-slate-200 text-sm flex items-center justify-between">
              <span>6 Agent Profili Bo'yicha Tafsilotlar</span>
              <span className="text-slate-400 font-normal text-xs">
                Sana: {selectedDate}
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <span>SalesDoc'dan kunlik hisobot hisoblanmoqda...</span>
              </div>
            ) : (
              data?.reports.map((report) => {
                const isExpanded = !!expandedAgents[report.agentId];
                const t1 = report.team1;
                const t2 = report.team2;
                const isSingleTeam = report.teamMode === 'single' || Boolean(report.isCombinedWorker);

                return (
                  <div
                    key={report.agentId}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4 hover:border-slate-700 transition"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono font-bold rounded border border-indigo-500/30 text-xs">
                            {report.agentId}
                          </span>
                          <span className="font-bold text-slate-100 text-sm">
                            {report.agentName}
                          </span>
                          {report.isCombinedWorker && (
                            <span className="px-2 py-0.5 bg-amber-500/15 text-amber-300 rounded border border-amber-500/30 text-[10px]">
                              1 ta xodim
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                          <span className="flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                            <span><b>Hududi:</b> {t1.territory || "Hudud ko'rsatilmagan"}</span>
                          </span>
                          <span>•</span>
                          <span><b>OKB:</b> {report.okbTotal} ta</span>
                          <span>•</span>
                          <span className="text-emerald-400"><b>Vizit:</b> {report.visitedCount} ta</span>
                          {report.unvisitedCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-rose-400 font-semibold">
                                <b>Kirmagan:</b> {report.unvisitedCount} ta
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleSendSingleAgent(report.agentId)}
                          disabled={sending}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1 transition"
                        >
                          <Send className="w-3 h-3 text-indigo-400" />
                          <span>Guruhlarga Yuborish</span>
                        </button>
                        <button
                          onClick={() => toggleAgentExpand(report.agentId)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* 1-Komanda vs 2-Komanda or Single Combined View */}
                    {isSingleTeam ? (
                      <div className="p-4 bg-slate-900/90 border border-emerald-500/30 rounded-xl space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 font-bold text-emerald-400 text-sm">
                            <span className="w-3 h-3 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20"></span>
                            <span>Yagona Birlashgan Komanda (1- va 2-Komanda Birlashgan Rejim)</span>
                          </div>
                          <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-full font-mono">
                            Telegram Guruh: {t1.chatId || t2.chatId || <span className="text-amber-400">Ulanmagan</span>}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                          <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Umumiy AKB</div>
                            <div className="text-base font-bold text-emerald-300 mt-0.5">
                              {report.combined?.akbCount ?? t1.akbCount} ta
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">O'tkazlar</div>
                            <div className="text-base font-bold text-amber-300 mt-0.5">
                              {report.combined?.rejectsCount ?? t1.rejectsCount} ta
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Jami Savdo</div>
                            <div className="text-xs font-bold text-slate-100 mt-0.5">
                              {Math.round(report.combined?.totalSalesSum ?? (t1.totalSalesSum + t2.totalSalesSum)).toLocaleString('uz-UZ')} so'm
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                            <div className="text-[10px] text-rose-400 uppercase font-semibold">Vozvrat (Qaytarish)</div>
                            <div className="text-xs font-bold text-rose-300 mt-0.5">
                              {Math.round(report.combined?.totalReturnsSum ?? (t1.totalReturnsSum + t2.totalReturnsSum)).toLocaleString('uz-UZ')} so'm
                            </div>
                          </div>
                        </div>

                        {/* Category breakdown in single team */}
                        <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800 text-xs space-y-2">
                          <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                            <span className="text-emerald-400 font-bold">📦 Biriktirilgan tovar toifalari (barchasi bitta hisobotda):</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 bg-emerald-950/20 border border-emerald-500/20 rounded">
                              <span className="font-bold text-emerald-300">1-Komanda toifalari: </span>
                              <span className="text-slate-300">TikTok kurt, Semichka, Chubara, Abubakr, Kofe (Barista/Expos/Top), Solomka, Nutella, Gajjak, Sladunitsa, Magiz, Pista</span>
                            </div>
                            <div className="p-2 bg-sky-950/20 border border-sky-500/20 rounded">
                              <span className="font-bold text-sky-300">2-Komanda toifalari: </span>
                              <span className="text-slate-300">Machos, Vella, Vafli, Ichimliklar (Limonariy/Mojito/Bruji/Lara/Suv), Brando, Baretto, Saule, Sweets, M&M, Otto</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* 1-Komanda Card */}
                        <div className="p-3.5 bg-slate-900/90 border border-emerald-500/20 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 font-bold text-emerald-400 text-sm">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                              <span>1-Komanda (Komanda A)</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Chat ID: {t1.chatId ? <code className="text-slate-300">{t1.chatId}</code> : <span className="text-amber-400">Ulanmagan</span>}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">AKB (Xarid)</div>
                              <div className="text-sm font-bold text-emerald-300 mt-0.5">{t1.akbCount} ta</div>
                            </div>
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">O'tkazlar</div>
                              <div className="text-sm font-bold text-amber-300 mt-0.5">{t1.rejectsCount} ta</div>
                            </div>
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">Savdo Summasi</div>
                              <div className="text-xs font-bold text-slate-200 mt-0.5 truncate">
                                {Math.round(t1.totalSalesSum).toLocaleString('uz-UZ')} so'm
                              </div>
                            </div>
                          </div>

                          {t1.totalReturnsSum > 0 && (
                            <div className="text-[11px] text-rose-400 flex items-center justify-between px-1">
                              <span>Qaytarish (Vozvrat):</span>
                              <span className="font-bold">-{Math.round(t1.totalReturnsSum).toLocaleString('uz-UZ')} so'm</span>
                            </div>
                          )}

                          <div className="text-[11px] text-slate-300 bg-slate-950/40 p-1.5 rounded border border-slate-800/60">
                            <span className="font-semibold text-emerald-400">1-Komanda toifalari: </span>
                            TikTok, Semichka, Chubara, Abubakr, Kofe, Solomka, Nutella, Gajjak, Sladunitsa, Magiz
                          </div>
                        </div>

                        {/* 2-Komanda Card */}
                        <div className="p-3.5 bg-slate-900/90 border border-sky-500/20 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 font-bold text-sky-400 text-sm">
                              <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                              <span>2-Komanda (Komanda B)</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Chat ID: {t2.chatId ? <code className="text-slate-300">{t2.chatId}</code> : <span className="text-amber-400">Ulanmagan</span>}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">AKB (Xarid)</div>
                              <div className="text-sm font-bold text-sky-300 mt-0.5">{t2.akbCount} ta</div>
                            </div>
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">O'tkazlar</div>
                              <div className="text-sm font-bold text-amber-300 mt-0.5">{t2.rejectsCount} ta</div>
                            </div>
                            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                              <div className="text-[10px] text-slate-400">Savdo Summasi</div>
                              <div className="text-xs font-bold text-slate-200 mt-0.5 truncate">
                                {Math.round(t2.totalSalesSum).toLocaleString('uz-UZ')} so'm
                              </div>
                            </div>
                          </div>

                          {t2.totalReturnsSum > 0 && (
                            <div className="text-[11px] text-rose-400 flex items-center justify-between px-1">
                              <span>Qaytarish (Vozvrat):</span>
                              <span className="font-bold">-{Math.round(t2.totalReturnsSum).toLocaleString('uz-UZ')} so'm</span>
                            </div>
                          )}

                          <div className="text-[11px] text-slate-300 bg-slate-950/40 p-1.5 rounded border border-slate-800/60">
                            <span className="font-semibold text-sky-400">2-Komanda toifalari: </span>
                            Machos, Vella, Vafli, Ichimliklar, Brando, Baretto, Saule, Holly, Sweets, M&M, Otto
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Unvisited Shops List Drawer */}
                    {report.unvisitedCount > 0 ? (
                      <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-rose-300 font-semibold">
                          <div className="flex items-center space-x-1.5">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            <span>Tashrif qilinmagan (kirmagan) do'konlar: {report.unvisitedCount} ta</span>
                          </div>
                          <span className="text-[10px] text-rose-400">
                            22:30 hisobotidan keyin ro'yxat tartib bilan guruhga yuboriladi
                          </span>
                        </div>

                        {/* List preview */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                          {t1.unvisitedClients.slice(0, isExpanded ? 100 : 6).map((c, idx) => (
                            <div
                              key={c.id || idx}
                              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[11px]"
                            >
                              <div className="font-semibold text-slate-200 truncate">
                                {idx + 1}. {c.name}
                              </div>
                              <div className="text-slate-400 text-[10px] truncate mt-0.5">
                                📍 {c.address || "Manzil ko'rsatilmagan"}
                              </div>
                              <div className="text-slate-400 text-[10px] mt-0.5">
                                📞 {c.phone || "Tel yo'q"}
                              </div>
                            </div>
                          ))}
                        </div>

                        {t1.unvisitedClients.length > 6 && !isExpanded && (
                          <button
                            onClick={() => toggleAgentExpand(report.agentId)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium pt-1"
                          >
                            + Yana {t1.unvisitedClients.length - 6} ta kirmagan do'konni ko'rish...
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-emerald-300 flex items-center space-x-2 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Barcha rejalashtirilgan do'konlarga tashrif buyurilgan (kirmagan do'kon yo'q)!</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/80">
          <div className="text-[11px] text-slate-400">
            ⏰ Har kuni soat <b>22:30 da</b> tizim avtomatik ravishda barcha komandalar guruhiga ushbu hisobotni va kirmagan do'konlar ro'yxatini yuboradi.
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
            >
              Yopish
            </button>
            <button
              onClick={handleSendAll}
              disabled={sending || loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Yuborilmoqda...' : 'Hozir Yuborish (Sinash)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
