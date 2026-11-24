import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Users,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Store,
  DollarSign,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  UserCheck,
  TrendingUp,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  ExternalLink,
  MessageSquare,
  MapPin,
  Camera,
  RotateCcw,
  Lock,
  Unlock,
  Info,
  ShieldCheck
} from 'lucide-react';
import { AgentDeviceAnalysisResult, AgentDeviceProfile, AgentManagementItem } from '../types';

interface AgentsTabProps {
  onSelectAgentFilter?: (agentId: string, deviceKey?: 'dev_1' | 'dev_2') => void;
}

export const AgentsTab: React.FC<AgentsTabProps> = ({ onSelectAgentFilter }) => {
  const [activeSubTab, setActiveSubTab] = useState<'teams' | 'live-sync' | 'devices'>('teams');

  // --- 1. Team Management & Account Control State ---
  const [agentsList, setAgentsList] = useState<AgentManagementItem[]>([]);
  const [loadingTeams, setLoadingTeams] = useState<boolean>(true);
  const [savingModeId, setSavingModeId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [confirmAgentToggle, setConfirmAgentToggle] = useState<{ agent: AgentManagementItem; targetActive: boolean } | null>(null);
  const [confirmBatchMode, setConfirmBatchMode] = useState<'single' | 'dual' | null>(null);
  const [teamActionFeedback, setTeamActionFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [editingAgentConfig, setEditingAgentConfig] = useState<AgentManagementItem | null>(null);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // --- 2. Live Sync & Violation Monitoring State ---
  const [scanningSync, setScanningSync] = useState<boolean>(false);
  const [syncScanResult, setSyncScanResult] = useState<any | null>(null);
  const [violationsList, setViolationsList] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [sendingAlertKey, setSendingAlertKey] = useState<string | null>(null);
  const [alertFeedback, setAlertFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // --- 3. Device & Collision Analysis State ---
  const [deviceData, setDeviceData] = useState<AgentDeviceAnalysisResult | null>(null);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(false);
  const [errorDevices, setErrorDevices] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [filterDualOnly, setFilterDualOnly] = useState<boolean>(false);
  const [editingDevice, setEditingDevice] = useState<{ agentId: string; deviceKey: 'dev_1' | 'dev_2'; currentName: string } | null>(null);
  const [newAliasName, setNewAliasName] = useState<string>('');
  const [savingAlias, setSavingAlias] = useState<boolean>(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // --- Load Team Management Data ---
  const fetchTeamsData = async () => {
    try {
      setLoadingTeams(true);
      const res = await fetch('/api/salesdoc/agents/management');
      const json = await res.json();
      if (json.success && json.data?.agents) {
        // Ensure every agent has a unique id and deduplicate
        const seen = new Set<string>();
        const sanitized = json.data.agents.map((ag: any, i: number) => {
          let cleanId = ag.id || ag.agentId || `agent_${i + 1}`;
          if (seen.has(cleanId)) {
            cleanId = `${cleanId}_${i}`;
          }
          seen.add(cleanId);
          return { ...ag, id: cleanId };
        });
        setAgentsList(sanitized);
      }
    } catch (err: any) {
      console.error('Error fetching agent teams:', err);
    } finally {
      setLoadingTeams(false);
    }
  };

  // --- Load Live Sync & Violations Data ---
  const fetchLiveSyncData = async (triggerScan: boolean = false) => {
    try {
      setScanningSync(true);
      setAlertFeedback(null);
      const url = triggerScan ? '/api/salesdoc/monitor/trigger-sync-and-alert' : '/api/salesdoc/visits/monitoring';
      const method = triggerScan ? 'POST' : 'GET';
      const res = await fetch(url, { method });
      const json = await res.json();
      if (json.success) {
        if (triggerScan && json.data?.cycleResult) {
          setSyncScanResult(json.data.cycleResult);
          setViolationsList(json.data.violations || []);
          setRecentVisits(json.data.recentVisits || []);
          setAlertFeedback({
            msg: `Sinxronizatsiya tekshirildi: ${json.data.cycleResult.violationsDetected} ta holat aniqlandi, ${json.data.cycleResult.newAlertsSent} ta yangi xabar Telegram guruhlarga yuborildi.`,
            type: 'success'
          });
        } else if (json.data) {
          const items = json.data.items || [];
          setViolationsList(items.filter((i: any) => i.should_alert));
          setRecentVisits(items.slice(0, 20));
        }
      }
    } catch (err: any) {
      setAlertFeedback({ msg: 'Sinxron tekshiruvida xatolik: ' + err.message, type: 'error' });
    } finally {
      setScanningSync(false);
    }
  };

  // --- Load Device & Collision Analysis Data ---
  const fetchDeviceAnalysis = async (refresh: boolean = false) => {
    try {
      setLoadingDevices(true);
      setErrorDevices(null);
      const res = await fetch(`/api/salesdoc/agents/device-analysis${refresh ? '?refresh=true' : ''}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Maʼlumotlarni yuklab boʻlmadi');
      setDeviceData(json.data);
      if (!selectedAgentId && json.data.agents.length > 0) {
        const dual = json.data.agents.find((a: AgentDeviceProfile) => a.isDualDevice);
        setSelectedAgentId(dual ? dual.agentId : json.data.agents[0].agentId);
      }
    } catch (err: any) {
      setErrorDevices(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchTeamsData();
    fetchLiveSyncData(false);
    fetchDeviceAnalysis(false);
  }, []);

  // --- Handle Toggle Mode for Single Agent ---
  const handleToggleAgentMode = async (agentId: string, currentMode: 'single' | 'dual') => {
    const newMode: 'single' | 'dual' = currentMode === 'single' ? 'dual' : 'single';
    try {
      setSavingModeId(agentId);
      setTeamActionFeedback(null);
      const res = await fetch('/api/salesdoc/agents/set-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, teamMode: newMode })
      });
      const json = await res.json();
      if (json.success) {
        setAgentsList((prev) =>
          prev.map((ag) => (ag.id === agentId ? { ...ag, teamMode: newMode, isCombinedWorker: newMode === 'single' } : ag))
        );
        setTeamActionFeedback({
          msg: `Agent komanda rejimi "${newMode === 'single' ? '1 ta Umumiy Komanda' : '2 ta Alohida Komanda'}" ga o'zgartirildi.`,
          type: 'success'
        });
      } else {
        setTeamActionFeedback({ msg: json.error || 'Rejimni oʻzgartirib boʻlmadi', type: 'error' });
      }
    } catch (err: any) {
      setTeamActionFeedback({ msg: err.message || 'Tarmoq xatoligi', type: 'error' });
    } finally {
      setSavingModeId(null);
    }
  };

  // --- Handle Toggle SalesDoc Agent Account Active / Blocked ---
  const handleToggleAgentActive = async (ag: AgentManagementItem, targetActive: boolean) => {
    try {
      setTogglingActiveId(ag.id);
      setTeamActionFeedback(null);
      const res = await fetch('/api/salesdoc/agents/set-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: ag.id,
          active: targetActive,
          name: ag.name,
          code_1C: ag.code1c
        })
      });
      const json = await res.json();
      if (json.success) {
        setAgentsList((prev) =>
          prev.map((item) => (item.id === ag.id ? { ...item, active: targetActive } : item))
        );
        setTeamActionFeedback({
          msg: `${ag.name} (${ag.id}) SalesDoc hisobi ${targetActive ? 'FAOLLASHTIRILDI' : 'BLOKLANDI'}${json.dryRun ? ' (Dry-Run sinov rejimi)' : ''}.`,
          type: 'success'
        });
        setConfirmAgentToggle(null);
      } else {
        setTeamActionFeedback({ msg: json.error || 'SalesDoc holatini yangilab boʻlmadi', type: 'error' });
      }
    } catch (err: any) {
      setTeamActionFeedback({ msg: err.message || 'Server bilan aloqa xatosi', type: 'error' });
    } finally {
      setTogglingActiveId(null);
    }
  };

  // --- Handle Batch Mode Toggle (All to single / All to dual) ---
  const handleBatchMode = async (mode: 'single' | 'dual') => {
    try {
      setLoadingTeams(true);
      setTeamActionFeedback(null);
      const res = await fetch('/api/salesdoc/agents/set-all-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMode: mode })
      });
      const json = await res.json();
      if (json.success) {
        await fetchTeamsData();
        setTeamActionFeedback({
          msg: `Barcha agentlar "${mode === 'single' ? '1 ta Umumiy Komanda' : '2 ta Alohida Komanda'}" rejimiga o'tkazildi.`,
          type: 'success'
        });
      } else {
        setTeamActionFeedback({ msg: json.error || 'Xatolik yuz berdi', type: 'error' });
      }
    } catch (err: any) {
      setTeamActionFeedback({ msg: err.message || 'Xatolik yuz berdi', type: 'error' });
    } finally {
      setLoadingTeams(false);
      setConfirmBatchMode(null);
    }
  };

  // --- Handle Save Agent Full Config ---
  const handleSaveAgentConfig = async () => {
    if (!editingAgentConfig) return;
    try {
      setSavingConfig(true);
      const agentId = editingAgentConfig.agentId || editingAgentConfig.id;
      const payload = {
        ...editingAgentConfig,
        agentId,
        id: agentId,
        agentName: editingAgentConfig.agentName || editingAgentConfig.name,
        teamMode: editingAgentConfig.teamMode,
        isCombinedWorker: editingAgentConfig.teamMode === 'single'
      };

      const res = await fetch('/api/salesdoc/agents/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setAgentsList((prev) =>
          prev.map((ag) =>
            ag.id === agentId
              ? {
                  ...ag,
                  teamMode: editingAgentConfig.teamMode,
                  isCombinedWorker: editingAgentConfig.teamMode === 'single',
                  team1ChatId: editingAgentConfig.team1ChatId,
                  team1TopicId: editingAgentConfig.team1TopicId,
                  team2ChatId: editingAgentConfig.team2ChatId,
                  team2TopicId: editingAgentConfig.team2TopicId,
                  notes: editingAgentConfig.notes
                }
              : ag
          )
        );
        await fetchTeamsData();
        setEditingAgentConfig(null);
        setTeamActionFeedback({ msg: `${editingAgentConfig.name} sozlamalari saqlandi.`, type: 'success' });
      } else {
        setTeamActionFeedback({ msg: json.error || 'Saqlashda xatolik', type: 'error' });
      }
    } catch (err: any) {
      setTeamActionFeedback({ msg: err.message || 'Saqlashda xatolik', type: 'error' });
    } finally {
      setSavingConfig(false);
    }
  };

  // --- Handle Dispatch Single Alert to Telegram ---
  const handleSendSingleAlert = async (visitKey: string, item: any) => {
    try {
      setSendingAlertKey(visitKey);
      const res = await fetch('/api/salesdoc/visits/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitKey, item })
      });
      const json = await res.json();
      if (json.success) {
        setAlertFeedback({ msg: 'Ogohlantirish guruhi muvaffaqiyatli jo\'natildi!', type: 'success' });
        setViolationsList((prev) =>
          prev.map((v) => (v.visitKey === visitKey ? { ...v, telegram_sent: true, telegram_sent_at: new Date().toISOString() } : v))
        );
      } else {
        setAlertFeedback({ msg: 'Xatolik: ' + json.error, type: 'error' });
      }
    } catch (err: any) {
      setAlertFeedback({ msg: 'Xatolik: ' + err.message, type: 'error' });
    } finally {
      setSendingAlertKey(null);
    }
  };

  // --- Handle Save Device Alias ---
  const handleSaveAlias = async () => {
    if (!editingDevice) return;
    try {
      setSavingAlias(true);
      const res = await fetch('/api/salesdoc/agents/device-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: editingDevice.agentId,
          deviceKey: editingDevice.deviceKey,
          alias: newAliasName.trim()
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Nomni saqlab boʻlmadi');
      if (json.data?.analysis) {
        setDeviceData(json.data.analysis);
      } else {
        await fetchDeviceAnalysis(true);
      }
      setEditingDevice(null);
      setTeamActionFeedback({ msg: 'Qurilma nomi saqlandi.', type: 'success' });
    } catch (err: any) {
      setErrorDevices(err.message || 'Nomni saqlashda xatolik');
    } finally {
      setSavingAlias(false);
    }
  };

  const currentDeviceAgent = deviceData?.agents.find((a) => a.agentId === selectedAgentId);
  const filteredDeviceAgents = (deviceData?.agents || []).filter((ag) => {
    if (filterDualOnly) return ag.isDualDevice;
    return true;
  });

  return (
    <div className="space-y-6" id="agents-hub-container">
      {/* Top Header with Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Agentlar va Komandalar Boshqaruvi</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Agentlarni 1 ta yoki 2 ta komandaga biriktirish, umumiy hisobotlar va real-vaqtda qoidabuzarlik monitoringi
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (activeSubTab === 'teams') fetchTeamsData();
                else if (activeSubTab === 'live-sync') fetchLiveSyncData(true);
                else fetchDeviceAnalysis(true);
              }}
              disabled={loadingTeams || scanningSync || loadingDevices}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              id="refresh-agents-tab-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTeams || scanningSync || loadingDevices ? 'animate-spin' : ''}`} />
              Yangilash
            </button>
          </div>
        </div>

        {/* Sub-Tab Selector Navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100 overflow-x-auto">
          <button
            id="subtab-teams-btn"
            onClick={() => setActiveSubTab('teams')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeSubTab === 'teams'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1 / 2 Komanda Boshqaruvi</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeSubTab === 'teams' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {agentsList.length} ta
            </span>
          </button>

          <button
            id="subtab-live-sync-btn"
            onClick={() => setActiveSubTab('live-sync')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeSubTab === 'live-sync'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Jonli Sinxronizatsiya & Qoidabuzarliklar</span>
            {violationsList.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${activeSubTab === 'live-sync' ? 'bg-amber-800 text-white' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                {violationsList.length} ta holat
              </span>
            )}
          </button>

          <button
            id="subtab-devices-btn"
            onClick={() => setActiveSubTab('devices')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeSubTab === 'devices'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Qurilmalar & Seanslar Tahlili</span>
            {deviceData?.summary.dualDeviceProfilesCount ? (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeSubTab === 'devices' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-800'}`}>
                {deviceData.summary.dualDeviceProfilesCount} ta 2-qurilma
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* =========================================================================
          SUB-TAB 1: KOMANDALAR BOSHQARUVI (1 yoki 2 Komanda Qilish)
          ========================================================================= */}
      {activeSubTab === 'teams' && (
        <div className="space-y-6">
          {/* Header Action Banner */}
          <div className="bg-linear-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-xl p-6 text-white shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-700/60 border border-indigo-400/30 rounded-full text-xs font-medium text-indigo-100 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Komandalar Integratsiyasi & Avtomatizatsiya</span>
                </div>
                <h3 className="text-lg font-bold text-white">Agentlarni 1 yoki 2 Komandaga Ajratish Qoidasi</h3>
                <p className="text-xs text-indigo-100/80 mt-1 max-w-2xl leading-relaxed">
                  <b>1 ta Komanda qilib qo'yilgan agentlar:</b> Barcha hisobotlari (savdo, qisman/to'liq vozvratlar va AKB) <b>yagona umumiy hisobot</b> sifatida hisoblanadi va bitta Telegram guruhiga chiqadi.
                  <br />
                  <b>2 ta Komanda qilib qo'yilgan agentlar:</b> Tovarlar toifasi bo'yicha 1-Komanda va 2-Komandaga ajratilib, alohida hisobotlar olinadi.
                </p>
              </div>

              {/* Batch Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setConfirmBatchMode('single')}
                  disabled={loadingTeams}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Barchasini 1 ta Komanda qilish
                </button>
                <button
                  onClick={() => setConfirmBatchMode('dual')}
                  disabled={loadingTeams}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Barchasini 2 ta Komanda qilish
                </button>
              </div>
            </div>
          </div>

          {teamActionFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                teamActionFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{teamActionFeedback.msg}</span>
              <button onClick={() => setTeamActionFeedback(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Agents Grid */}
          {loadingTeams ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600 font-medium">Agentlar maʼlumotlari yuklanmoqda...</p>
            </div>
          ) : agentsList.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-600">SalesDoc agentlari topilmadi</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentsList.map((ag, index) => {
                const isSingle = ag.teamMode === 'single' || ag.isCombinedWorker;
                const stats = ag.todayStats;

                return (
                  <div
                    key={ag.id ? `agent-${ag.id}` : `agent-idx-${index}`}
                    className={`rounded-xl border transition-all p-5 flex flex-col justify-between ${
                      isSingle
                        ? 'bg-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                        : 'bg-slate-900 border-slate-800 hover:border-indigo-500/50 shadow-lg shadow-slate-950/40'
                    }`}
                  >
                    <div>
                      {/* Top row: Agent Name, SalesDoc Active Status & Team Mode Badge */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-bold px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                              {ag.id}
                            </span>
                            <h4 className="text-sm font-bold text-slate-100 line-clamp-1">{ag.name}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                ag.active !== false
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}
                            >
                              {ag.active !== false ? 'Faol' : 'Bloklangan'}
                            </span>
                          </div>
                          {ag.phone && <p className="text-[11px] text-slate-400 mt-0.5">📞 {ag.phone}</p>}
                        </div>

                        {/* Team Mode Badge */}
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold shrink-0 inline-flex items-center gap-1 ${
                            isSingle
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          }`}
                        >
                          {isSingle ? '🟢 1 ta Umumiy Komanda' : '🔵 2 ta Alohida Komanda'}
                        </span>
                      </div>

                      {/* Today's Violations & Device Summary Badges */}
                      {((ag.todayViolationsCount ?? 0) > 0 || ag.deviceSummary?.isDualDevice) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          {(ag.todayViolationsCount ?? 0) > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              ⚠ Bugun {ag.todayViolationsCount} ta nazorat holati
                            </span>
                          )}
                          {(ag.todayFakePolkaCount ?? 0) > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                              🎭 {ag.todayFakePolkaCount} ta soxta polka
                            </span>
                          )}
                          {(ag.todayCoveredCameraCount ?? 0) > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600/20 text-rose-200 border border-rose-500/40">
                              🚫 {ag.todayCoveredCameraCount} ta yopiq kamera
                            </span>
                          )}
                          {ag.deviceSummary?.isDualDevice && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              📱 2 ta qurilma ({ag.deviceSummary.totalOrders} zakaz)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Explanation box */}
                      <div className={`p-3 rounded-lg text-xs mb-3 ${isSingle ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-500/30' : 'bg-slate-950/60 text-slate-300 border border-slate-800'}`}>
                        {isSingle ? (
                          <p>
                            <b className="text-emerald-300">Yagona hisobot rejimi:</b> 1- va 2-komandaga tegishli barcha toifalar bitta guruhda birlashgan holda yuboriladi.
                          </p>
                        ) : (
                          <p>
                            <b className="text-indigo-300">Alohida 2 komanda:</b> 1-Komanda va 2-Komandaga biriktirilgan toifalar alohida guruhlarga hisobot qilinadi.
                          </p>
                        )}
                      </div>

                      {/* Category Breakdown according to mode */}
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 mb-3 space-y-2">
                        <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                          <span>📦 Biriktirilgan toifalar:</span>
                          <span className="text-[10px] text-slate-400">{isSingle ? 'Birlashgan' : '2 guruhga taqsimlangan'}</span>
                        </div>
                        {isSingle ? (
                          <div className="space-y-1.5 text-[11px]">
                            <div className="p-1.5 rounded bg-emerald-950/30 border border-emerald-500/20 text-slate-300">
                              <span className="font-semibold text-emerald-400">1-Komanda: </span>
                              TikTok kurt, Semichka, Chubara, Abubakr, Kofe (Barista/Expos/Top), Solomka, Nutella, Gajjak, Sladunitsa, Magiz, Pista
                            </div>
                            <div className="p-1.5 rounded bg-sky-950/30 border border-sky-500/20 text-slate-300">
                              <span className="font-semibold text-sky-400">2-Komanda: </span>
                              Machos, Vella, Vafli, Ichimliklar (Limonariy, Mojito, Bruji, Lara, Suv), Brando, Baretto, Saule, Sweets, M&M, Otto
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                            <div className="p-1.5 rounded bg-emerald-950/30 border border-emerald-500/20 text-slate-300">
                              <span className="font-semibold text-emerald-400 block">🟢 1-Komanda:</span>
                              TikTok, Semichka, Chubara, Abubakr, Kofe, Solomka, Nutella, Gajjak, Sladunitsa
                            </div>
                            <div className="p-1.5 rounded bg-sky-950/30 border border-sky-500/20 text-slate-300">
                              <span className="font-semibold text-sky-400 block">🔵 2-Komanda:</span>
                              Machos, Vella, Vafli, Ichimliklar, Brando, Baretto, Saule, Sweets, M&M, Otto
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Today's Quick Stats (if available) */}
                      {stats && (
                        <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-950/70 rounded-lg border border-slate-800 mb-3 text-center">
                          <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Tashrif / OKB</div>
                            <div className="text-xs font-bold text-slate-200 mt-0.5">
                              {stats.visitedCount} / {stats.okbTotal}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">AKB (Zakaz)</div>
                            <div className="text-xs font-bold text-indigo-400 mt-0.5">{stats.akb} ta</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase">Savdo</div>
                            <div className="text-xs font-bold text-emerald-400 mt-0.5 truncate">
                              {Math.round(stats.totalSales).toLocaleString()} so'm
                            </div>
                          </div>
                          {stats.totalReturns > 0 && (
                            <div className="col-span-3 pt-1 border-t border-slate-800/80 text-[11px] text-rose-400 font-medium flex items-center justify-center gap-1">
                              <RotateCcw className="w-3 h-3 text-rose-400" />
                              <span>Vozvrat: {Math.round(stats.totalReturns).toLocaleString()} so'm</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Configured Chat IDs status */}
                      <div className="space-y-1 text-xs text-slate-400 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">1-Komanda Guruhi:</span>
                          <span className="font-mono text-slate-200 text-[11px]">
                            {ag.team1ChatId ? `${ag.team1ChatId.slice(0, 8)}...` : <span className="text-amber-400 font-sans">Ulanmagan</span>}
                          </span>
                        </div>
                        {!isSingle && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">2-Komanda Guruhi:</span>
                            <span className="font-mono text-slate-200 text-[11px]">
                              {ag.team2ChatId ? `${ag.team2ChatId.slice(0, 8)}...` : <span className="text-amber-400 font-sans">Ulanmagan</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons: Switch mode, SalesDoc Block/Activate & Edit Config */}
                    <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAgentMode(ag.id, ag.teamMode)}
                        disabled={savingModeId === ag.id}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          isSingle
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950'
                        }`}
                      >
                        {savingModeId === ag.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : isSingle ? (
                          <>
                            <Layers className="w-3.5 h-3.5 text-indigo-400" />
                            2 ta Komandaga
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            1 ta Komandaga
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={togglingActiveId === ag.id}
                        onClick={() => setConfirmAgentToggle({ agent: ag, targetActive: ag.active === false })}
                        className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition flex items-center gap-1 shrink-0 ${
                          ag.active !== false
                            ? 'bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border-rose-500/40'
                            : 'bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300 border-emerald-500/40'
                        }`}
                        title={
                          ag.active !== false
                            ? 'SalesDoc hisobini bloklash (setAgent active=false)'
                            : 'SalesDoc hisobini faollashtirish (setAgent active=true)'
                        }
                      >
                        {togglingActiveId === ag.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : ag.active !== false ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Bloklash</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Faollashtirish</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setEditingAgentConfig({ ...ag, agentId: ag.id, agentName: ag.name })}
                        className="p-2 text-slate-300 hover:text-indigo-400 hover:bg-slate-800 rounded-lg border border-slate-700 transition"
                        title="Telegram guruh ID va sozlamalarni tahrirlash"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SUB-TAB 2: JONLI SINXRONIZATSIYA & QOIDABUZARLIKLAR (GURUHGA TASHLASH)
          ========================================================================= */}
      {activeSubTab === 'live-sync' && (
        <div className="space-y-6">
          {/* Main Action Banner */}
          <div className="bg-linear-to-r from-amber-900 via-slate-900 to-indigo-950 rounded-xl p-6 text-white shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-400/30 rounded-full text-xs font-medium text-amber-300 mb-2">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Avtomatik Qoidabuzarlik Nazorati</span>
                </div>
                <h3 className="text-lg font-bold text-white">Agent Sinxronizatsiyasi & Guruhga Tashlash</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Agentlar telefonida vizit qilib sinxronizatsiya berganda SalesDoc ga tushgan ma'lumotlar avtomatik tekshiriladi:
                  <b> 100 metrdan uzoqda qilingan vizitlar (polkasiz), kamerasi yopib olingan soxta rasmlar</b> yoki <b>foto-hisobotsiz vizitlar</b> darhol aniqlanib, o'rnida Telegram guruhiga rasm va dalillar bilan yuboriladi.
                </p>
              </div>

              {/* Instant trigger button */}
              <button
                id="trigger-sync-and-alert-btn"
                onClick={() => fetchLiveSyncData(true)}
                disabled={scanningSync}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 rounded-xl text-sm font-extrabold transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${scanningSync ? 'animate-spin text-slate-950' : 'text-slate-950'}`} />
                {scanningSync ? 'Sinxron tekshirilmoqda...' : '⚡️ Sinxronni Tahlil Qilish & Guruhga Tashlash'}
              </button>
            </div>
          </div>

          {/* Feedback message */}
          {alertFeedback && (
            <div
              className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                alertFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{alertFeedback.msg}</span>
              <button onClick={() => setAlertFeedback(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Violations List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h4 className="text-base font-bold text-slate-900">
                  Aniqlangan Nazorat Xabarlari ({violationsList.length} ta)
                </h4>
              </div>
              <span className="text-xs text-slate-500">
                Faqat guruhga tashlanadigan uzoq yoki qorong'i foto xabarlar ro'yxati
              </span>
            </div>

            {violationsList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-800">Nazorat holatlari mavjud emas!</p>
                <p className="text-xs text-slate-500 mt-1">Barcha tashriflar GPS va foto-hisobot standartlariga to'g'ri keladi.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {violationsList.map((item, vIdx) => (
                  <div
                    key={item.visitKey ? `viol-${item.visitKey}` : `viol-idx-${vIdx}`}
                    className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50/70 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{item.agent_name}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-800">{item.client_name}</span>
                        <span className="text-[11px] font-mono text-slate-500">({item.date})</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                          {item.status_label}
                        </span>
                        {item.distance_meters !== null && item.distance_meters !== undefined && item.distance_meters > 0 ? (
                          <span className="text-xs font-mono text-rose-700 font-semibold flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500" />
                            {item.distance_meters}m uzoqda
                          </span>
                        ) : item.is_distant ? (
                          <span className="text-xs font-mono text-rose-700 font-semibold flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500" />
                            Uzoqda (GPS: 0)
                          </span>
                        ) : null}
                        <span className="text-xs text-slate-600">
                          Rasmlar: <b>{item.photos?.length || 0} ta</b> ({item.has_polka_photo ? '✅ Polka bor' : '❌ Polka yo\'q'})
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 italic mt-1">
                        Sabab: {item.alert_reason}
                      </p>
                    </div>

                    {/* Action & Status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.telegram_sent ? (
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Guruhga Tashlangan</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSendSingleAlert(item.visitKey, item)}
                          disabled={sendingAlertKey === item.visitKey}
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                        >
                          {sendingAlertKey === item.visitKey ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Guruhga Tashlash</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Visits Log */}
          {recentVisits.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>SalesDoc ga Tushgan Oxirgi Sinxron Vizitlar</span>
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="pb-2">Agent</th>
                      <th className="pb-2">Mijoz</th>
                      <th className="pb-2">Sana / Vaqt</th>
                      <th className="pb-2">Masofa</th>
                      <th className="pb-2">Foto-hisobot</th>
                      <th className="pb-2">Holat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentVisits.map((v, rIdx) => (
                      <tr key={v.visitKey ? `recent-${v.visitKey}` : `recent-idx-${rIdx}`} className="hover:bg-slate-50">
                        <td className="py-2.5 font-medium text-slate-900">{v.agent_name}</td>
                        <td className="py-2.5 text-slate-800">{v.client_name}</td>
                        <td className="py-2.5 font-mono text-slate-500">{v.date}</td>
                        <td className="py-2.5 font-mono">
                          {v.distance_meters === null || v.distance_meters === undefined ? (
                            <span className="text-slate-500">{v.is_distant ? 'Uzoqda (GPS: 0)' : "Masofa noma'lum"}</span>
                          ) : v.distance_meters > 100 ? (
                            <span className="text-rose-600 font-bold">{v.distance_meters}m</span>
                          ) : (
                            <span className="text-emerald-600 font-semibold">{v.distance_meters}m</span>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {v.photos?.length ? `${v.photos.length} ta (${v.has_polka_photo ? 'Polka' : 'Tashqi'})` : 'Yo\'q'}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              v.should_alert
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {v.status_label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SUB-TAB 3: QURILMALAR & SEANSLAR TAHLILI (AVVALGI 2-QURILMA TAHLILI)
          ========================================================================= */}
      {activeSubTab === 'devices' && (
        <div className="space-y-6">
          {/* Top Banner: Metrics */}
          {deviceData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-semibold text-slate-500 uppercase">Jami Agent Profillari</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{deviceData.summary.totalAgents} ta profil</div>
                <div className="text-xs text-slate-500 mt-0.5">SalesDoc rasmiy hisoblari</div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80">
                <div className="text-xs font-semibold text-amber-700 uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  2 ta Agent Ishlatayotganlar
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-900">{deviceData.summary.dualDeviceProfilesCount} ta profil</div>
                <div className="text-xs text-amber-700 mt-0.5">Alohida qurilmalardan kirilgan</div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/80">
                <div className="text-xs font-semibold text-rose-700 uppercase flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-rose-600" />
                  Vaqt Toʻqnashuvlari
                </div>
                <div className="mt-1 text-2xl font-bold text-rose-900">{deviceData.summary.totalCollisionsDetected} ta holat</div>
                <div className="text-xs text-rose-700 mt-0.5">Bir daqiqada turli doʻkonlarda zakaz</div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80">
                <div className="text-xs font-semibold text-emerald-700 uppercase">Tahlil Qilingan Buyurtmalar</div>
                <div className="mt-1 text-2xl font-bold text-emerald-900">{deviceData.summary.totalOrdersAnalyzed} ta</div>
                <div className="text-xs text-emerald-700 mt-0.5">{deviceData.summary.totalRevenue.toLocaleString()} soʻm jami savdo</div>
              </div>
            </div>
          )}

          {/* Honest Device & Account Control Boundaries Info Card */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Boshqaruv Imkoniyatlari va Qurilma Chegaralari (Aniq Texnik Holat)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tizim Bajaradigan Haqiqiy Nazorat:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  • SalesDoc <code className="font-mono text-emerald-300">setAgent</code> orqali agent hisobini faollashtirish yoki bloklash (1-boʻlimda).<br />
                  • 1 ta profildan 2 ta telefon/seans va vaqt toʻqnashuvini aniqlash.<br />
                  • Gemini Vision orqali soxta polka, yopilgan kamera va uzoq vizitlarni Telegramga yuborish.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Texnik Chegara (Telefon OS / MDM):</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  SalesDoc API va veb-server agentning shaxsiy Android telefonini masofadan qulflay olmaydi, GPS/kamera tugmalarini majburiy yoqa olmaydi va telefon xotirasi/IMEI/batareyasini boshqara olmaydi (buning uchun korporativ Android MDM ilovasi kerak).
                </p>
              </div>
            </div>
          </div>

          {errorDevices && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorDevices}</span>
            </div>
          )}

          {/* Main Grid: Profiles List & Detailed Device Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Agent Profile Cards */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Profillar Roʻyxati</h3>
                <button
                  onClick={() => setFilterDualOnly(!filterDualOnly)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    filterDualOnly ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filterDualOnly ? 'Faqat 2 Qurilmalilar' : 'Barcha Profillar'}
                </button>
              </div>

              <div className="space-y-2">
                {filteredDeviceAgents.map((ag, dIdx) => {
                  const isSelected = ag.agentId === selectedAgentId;
                  return (
                    <button
                      key={ag.agentId ? `devag-${ag.agentId}` : `devag-idx-${dIdx}`}
                      onClick={() => setSelectedAgentId(ag.agentId)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-indigo-50/60 border-indigo-500 shadow-xs ring-1 ring-indigo-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {ag.agentId}
                            </span>
                            <span className="text-sm font-bold text-slate-900">{ag.agentName}</span>
                          </div>
                        </div>

                        {ag.isDualDevice ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full flex items-center gap-1 shrink-0">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            2 ta Qurilma
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full shrink-0">
                            1 ta Qurilma
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <span className="text-slate-500">Buyurtmalar:</span>{' '}
                          <span className="font-semibold text-slate-800">{ag.totalOrders} ta</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Savdo:</span>{' '}
                          <span className="font-semibold text-slate-800">{(ag.totalRevenue ?? 0).toLocaleString()} soʻm</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Detailed Device Dashboard */}
            <div className="lg:col-span-8">
              {currentDeviceAgent ? (
                <div className="space-y-6">
                  {/* Selected Agent Header */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md">
                            {currentDeviceAgent.agentId}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{currentDeviceAgent.agentName}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Jami: {currentDeviceAgent.totalOrders} ta buyurtma, {(currentDeviceAgent.totalRevenue ?? 0).toLocaleString()} soʻm
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {onSelectAgentFilter && (
                          <button
                            onClick={() => onSelectAgentFilter(currentDeviceAgent.agentId)}
                            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <span>Buyurtmalarni Koʻrish</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Devices Comparison Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Device 1 */}
                    <div className="bg-white rounded-xl border-2 border-indigo-100 p-5 shadow-xs">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">1-Qurilma (Telefon A)</div>
                            <div className="text-sm font-bold text-slate-900 mt-0.5">{currentDeviceAgent.dev1.displayName}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setEditingDevice({
                              agentId: currentDeviceAgent.agentId,
                              deviceKey: 'dev_1',
                              currentName: currentDeviceAgent.dev1.displayName
                            });
                            setNewAliasName(currentDeviceAgent.dev1.displayName);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="Agent ismini belgilash"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Buyurtmalar soni:</span>
                          <span className="font-bold text-slate-800">{currentDeviceAgent.dev1.ordersCount} ta</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Savdo summasi:</span>
                          <span className="font-bold text-indigo-600">{(currentDeviceAgent.dev1.totalSum ?? 0).toLocaleString()} soʻm</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Mijozlar:</span>
                          <span className="font-semibold text-slate-800">{currentDeviceAgent.dev1.uniqueClientsCount} ta doʻkon</span>
                        </div>
                      </div>
                    </div>

                    {/* Device 2 */}
                    <div className="bg-white rounded-xl border-2 border-amber-100 p-5 shadow-xs">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-600">2-Qurilma (Telefon B)</div>
                            <div className="text-sm font-bold text-slate-900 mt-0.5">{currentDeviceAgent.dev2.displayName}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setEditingDevice({
                              agentId: currentDeviceAgent.agentId,
                              deviceKey: 'dev_2',
                              currentName: currentDeviceAgent.dev2.displayName
                            });
                            setNewAliasName(currentDeviceAgent.dev2.displayName);
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                          title="Agent ismini belgilash"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Buyurtmalar soni:</span>
                          <span className="font-bold text-slate-800">{currentDeviceAgent.dev2.ordersCount} ta</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Savdo summasi:</span>
                          <span className="font-bold text-amber-600">{(currentDeviceAgent.dev2.totalSum ?? 0).toLocaleString()} soʻm</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Mijozlar:</span>
                          <span className="font-semibold text-slate-800">{currentDeviceAgent.dev2.uniqueClientsCount} ta doʻkon</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sessions List */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                    <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      <span>Ajratilgan Ishchi Seanslar ({currentDeviceAgent.sessions.length} ta)</span>
                    </h4>

                    <div className="space-y-3">
                      {currentDeviceAgent.sessions.map((ses, sIdx) => {
                        const isExpanded = expandedSessionId === ses.sessionId;
                        const isDev1 = ses.deviceKey === 'dev_1';

                        return (
                          <div key={ses.sessionId ? `sess-${ses.sessionId}` : `sess-idx-${sIdx}`} className="border border-slate-200 rounded-xl overflow-hidden">
                            <div
                              onClick={() => setExpandedSessionId(isExpanded ? null : ses.sessionId)}
                              className="p-4 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between gap-4 transition"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`text-xs font-bold px-2 py-1 rounded-md ${
                                    isDev1 ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {isDev1 ? '1-Qurilma' : '2-Qurilma'}
                                </span>
                                <div>
                                  <div className="text-xs font-semibold text-slate-800">
                                    Sinxronizatsiya: {ses.syncTime}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Oraliq: {ses.minDraft} — {ses.maxDraft} ({ses.ordersCount} ta buyurtma)
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-900">
                                  {ses.totalSum.toLocaleString()} soʻm
                                </span>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="p-4 bg-white border-t border-slate-200">
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                                      <th className="pb-1.5 font-medium">ID</th>
                                      <th className="pb-1.5 font-medium">Mijoz</th>
                                      <th className="pb-1.5 font-medium">Qoralama Vaqti</th>
                                      <th className="pb-1.5 font-medium">Pozitsiyalar</th>
                                      <th className="pb-1.5 font-medium text-right">Summa</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {ses.orders.map((ord, oIdx) => (
                                      <tr key={ord.id ? `ord-${ord.id}` : `ord-idx-${oIdx}`} className="hover:bg-slate-50/50">
                                        <td className="py-2 font-mono text-slate-700">{ord.id}</td>
                                        <td className="py-2 font-medium text-slate-900">{ord.clientName}</td>
                                        <td className="py-2 text-slate-500">{ord.dateCreate}</td>
                                        <td className="py-2 text-slate-500">{ord.itemsCount} xil tovar</td>
                                        <td className="py-2 text-right font-semibold text-slate-900">
                                          {ord.totalSum.toLocaleString()} soʻm
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  Agent tanlanmagan
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 1: Edit Agent Telegram Group & Topic Config --- */}
      {editingAgentConfig && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Agent Sozlamalari: {editingAgentConfig.name} ({editingAgentConfig.id})
              </h3>
              <button onClick={() => setEditingAgentConfig(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Team Mode Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Hisobot Rejimi (Komandalar Soni)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingAgentConfig({ ...editingAgentConfig, teamMode: 'single', isCombinedWorker: true })}
                    className={`p-3 rounded-lg border text-left transition ${
                      editingAgentConfig.teamMode === 'single'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      1 ta Komanda (Umumiy)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Barcha savdo, vozvratlar va AKB yagona hisobot qilinadi
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingAgentConfig({ ...editingAgentConfig, teamMode: 'dual', isCombinedWorker: false })}
                    className={`p-3 rounded-lg border text-left transition ${
                      editingAgentConfig.teamMode === 'dual'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      2 ta Komanda (Alohida)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      1-Komanda va 2-Komanda hisobotlari alohida olinadi
                    </div>
                  </button>
                </div>
              </div>

              {/* 1-Komanda Telegram Group ID & Topic */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{editingAgentConfig.teamMode === 'single' ? 'Asosiy Telegram Guruhi' : '1-Komanda Guruhi'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Chat ID (masalan: -100...)</label>
                    <input
                      type="text"
                      value={editingAgentConfig.team1ChatId}
                      onChange={(e) => setEditingAgentConfig({ ...editingAgentConfig, team1ChatId: e.target.value })}
                      placeholder="-100123456789"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Topic / Mavzu ID (ixtiyoriy)</label>
                    <input
                      type="text"
                      value={editingAgentConfig.team1TopicId || ''}
                      onChange={(e) => setEditingAgentConfig({ ...editingAgentConfig, team1TopicId: e.target.value })}
                      placeholder="12"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2-Komanda Telegram Group ID & Topic (if dual mode) */}
              {editingAgentConfig.teamMode !== 'single' && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>2-Komanda Guruhi</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Chat ID (masalan: -100...)</label>
                      <input
                        type="text"
                        value={editingAgentConfig.team2ChatId}
                        onChange={(e) => setEditingAgentConfig({ ...editingAgentConfig, team2ChatId: e.target.value })}
                        placeholder="-100123456789"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Topic / Mavzu ID (ixtiyoriy)</label>
                      <input
                        type="text"
                        value={editingAgentConfig.team2TopicId || ''}
                        onChange={(e) => setEditingAgentConfig({ ...editingAgentConfig, team2TopicId: e.target.value })}
                        placeholder="34"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Eslatma / Izoh</label>
                <input
                  type="text"
                  value={editingAgentConfig.notes || ''}
                  onChange={(e) => setEditingAgentConfig({ ...editingAgentConfig, notes: e.target.value })}
                  placeholder="Masalan: Farg'ona filiali, Shahar marshruti"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingAgentConfig(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveAgentConfig}
                disabled={savingConfig}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {savingConfig ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Rename Device Alias --- */}
      {editingDevice && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Qurilma / Agent Ismini Belgilash</h3>
            <p className="text-xs text-slate-500 mt-1">
              Ushbu qurilmani ishlatayotgan aniq agent ismini yozing (masalan: «Akmal» yoki «Jasur»). Tizim ushbu nomni barcha hisobotlarda koʻrsatadi.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Agent Nomi</label>
              <input
                type="text"
                value={newAliasName}
                onChange={(e) => setNewAliasName(e.target.value)}
                placeholder="Masalan: Akmal (1-qurilma)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveAlias}
                disabled={savingAlias}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {savingAlias ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Confirm Agent SalesDoc Account Block / Activate --- */}
      {confirmAgentToggle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  confirmAgentToggle.targetActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {confirmAgentToggle.targetActive ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {confirmAgentToggle.targetActive
                    ? 'Agent SalesDoc Hisobini Faollashtirish'
                    : 'Agent SalesDoc Hisobini Bloklash'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  <b>{confirmAgentToggle.agent.name}</b> ({confirmAgentToggle.agent.id}) agentining SalesDoc hisobini{' '}
                  {confirmAgentToggle.targetActive ? 'qayta faollashtirish' : 'bloklash'}ni tasdiqlaysizmi?
                </p>
                {!confirmAgentToggle.targetActive && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mt-2">
                    Bloklanganda agent SalesDoc mobil ilovasiga kira olmaydi (SalesDoc <code className="font-mono">setAgent</code> orqali <code className="font-mono">active: false</code> yuboriladi). Bu telefonning Android tizimini emas, faqat SalesDoc hisobini oʻchiradi.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAgentToggle(null)}
                disabled={Boolean(togglingActiveId)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={Boolean(togglingActiveId)}
                onClick={() => handleToggleAgentActive(confirmAgentToggle.agent, confirmAgentToggle.targetActive)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-50 ${
                  confirmAgentToggle.targetActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {togglingActiveId ? 'Bajarilmoqda...' : confirmAgentToggle.targetActive ? 'Faollashtirish' : 'Tasdiqlash (Bloklash)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Confirm Batch Team Mode Switch --- */}
      {confirmBatchMode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Barcha Agentlar Rejimini Oʻzgartirish</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Barcha agentlarni{' '}
              <b>{confirmBatchMode === 'single' ? '1 ta Umumiy Komanda' : '2 ta Alohida Komanda'}</b>{' '}
              rejimiga oʻtkazishni tasdiqlaysizmi?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmBatchMode(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => handleBatchMode(confirmBatchMode)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
