import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Users,
  ShieldCheck,
  Bot,
  Hash,
  ExternalLink,
  Info,
  Sparkles,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Plus,
  Layers
} from 'lucide-react';

export interface AgentTeamGroup {
  agentId: string;
  agentName: string;
  team1ChatId: string;
  team1TopicId?: string;
  team2ChatId: string;
  team2TopicId?: string;
  isCombinedWorker?: boolean;
  teamMode?: 'single' | 'dual';
}

interface DetectedChat {
  id: string;
  title: string;
  type: string;
  lastMessageDate?: number;
}

interface TelegramTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function TelegramTeamsModal({ isOpen, onClose, onShowToast }: TelegramTeamsModalProps) {
  const [botToken, setBotToken] = useState('');
  const [defaultChatId, setDefaultChatId] = useState('');
  const [teamConfigs, setTeamConfigs] = useState<Record<string, AgentTeamGroup>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  // Auto detect chats
  const [detecting, setDetecting] = useState(false);
  const [detectedChats, setDetectedChats] = useState<DetectedChat[]>([]);
  const [botInfo, setBotInfo] = useState<{ username?: string; firstName?: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadConfigs();
    }
  }, [isOpen]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/salesdoc/telegram/teams-config');
      const json = await res.json();
      if (json.success) {
        setBotToken(json.data.botToken || '');
        setDefaultChatId(json.data.defaultChatId || '');
        setTeamConfigs(json.data.teamConfigs || {});
      }
    } catch (err: any) {
      onShowToast("Sozlamalarni yuklab bo'lmadi: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDetectChats = async () => {
    if (!botToken.trim()) {
      onShowToast("Avval Telegram Bot Tokenni kiriting!", 'error');
      return;
    }
    setDetecting(true);
    try {
      const res = await fetch('/api/salesdoc/telegram/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken })
      });
      const json = await res.json();
      if (json.success) {
        setDetectedChats(json.chats || []);
        if (json.bot) {
          setBotInfo(json.bot);
        }
        if (json.chats && json.chats.length > 0) {
          onShowToast(`Topildi: ${json.chats.length} ta Telegram chat/guruh!`, 'success');
        } else {
          onShowToast(`Bot tekshirildi (@${json.bot?.username || 'bot'}), lekin hali guruhlarda yangi xabarlar yo'q. Guruhga botni admin qilib qo'shing va guruhda 'salom' deb yozing, so'ng yana bosing.`, 'info');
        }
      } else {
        throw new Error(json.error || 'Guruhlarni aniqlab bo\'lmadi');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sanitizedConfigs: Record<string, any> = {};
      for (const [id, cfg] of Object.entries(teamConfigs) as [string, AgentTeamGroup][]) {
        const isSingle = cfg.teamMode === 'single' || cfg.isCombinedWorker === true;
        sanitizedConfigs[id] = {
          ...cfg,
          teamMode: isSingle ? 'single' : 'dual',
          isCombinedWorker: isSingle
        };
      }

      const res = await fetch('/api/salesdoc/telegram/teams-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken,
          defaultChatId,
          teamConfigs: sanitizedConfigs
        })
      });
      const json = await res.json();
      if (json.success) {
        if (json.data?.teamConfigs) {
          setTeamConfigs(json.data.teamConfigs);
        }
        onShowToast("Barcha agent va komandalar Telegram sozlamalari muvaffaqiyatli saqlandi!", 'success');
        onClose();
      } else {
        throw new Error(json.error || 'Saqlashda xatolik');
      }
    } catch (err: any) {
      onShowToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const setAgentMode = (agentId: string, mode: 'single' | 'dual') => {
    setTeamConfigs(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        teamMode: mode,
        isCombinedWorker: mode === 'single'
      }
    }));
  };

  const setAllAgentsMode = (mode: 'single' | 'dual') => {
    setTeamConfigs(prev => {
      const updated: Record<string, AgentTeamGroup> = { ...prev };
      for (const id of Object.keys(updated)) {
        updated[id] = {
          ...updated[id],
          teamMode: mode,
          isCombinedWorker: mode === 'single'
        };
      }
      return updated;
    });
    onShowToast(
      mode === 'single'
        ? "Barcha agentlar 1-Komanda (Birlik komanda) rejimiga o'tkazildi. Saqlash uchun 'Barchasini Saqlash' tugmasini bosing."
        : "Barcha agentlar 2-Komanda rejimiga o'tkazildi. Saqlash uchun 'Barchasini Saqlash' tugmasini bosing.",
      'info'
    );
  };

  const handleTestTeam = async (agentId: string, teamName: '1-Komanda' | '2-Komanda', chatId: string, topicId?: string) => {
    if (!botToken) {
      onShowToast("Iltimos, avval Telegram Bot Tokenni kiriting!", 'error');
      return;
    }
    if (!chatId) {
      onShowToast(`Iltimos, ${teamName} uchun Telegram Chat ID kiriting!`, 'error');
      return;
    }

    const testKey = `${agentId}-${teamName}`;
    setTestingKey(testKey);

    try {
      const agent = teamConfigs[agentId];
      const res = await fetch('/api/salesdoc/telegram/test-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentName: agent?.agentName || agentId,
          teamName,
          chatId,
          topicId,
          botToken
        })
      });

      const json = await res.json();
      if (json.success) {
        onShowToast(`✅ ${agent?.agentName || agentId} (${teamName}) guruhiga test xabari muvaffaqiyatli bordi!`, 'success');
      } else {
        throw new Error(json.error || 'Xabar yuborib bo\'lmadi');
      }
    } catch (err: any) {
      onShowToast(`Xatolik: ${err.message}`, 'error');
    } finally {
      setTestingKey(null);
    }
  };

  const updateTeamField = (agentId: string, field: keyof AgentTeamGroup, value: any) => {
    setTeamConfigs(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value
      }
    }));
  };

  const assignDetectedChat = (chatId: string, agentId: string, teamKey: 'team1ChatId' | 'team2ChatId') => {
    updateTeamField(agentId, teamKey, chatId);
    const agent = teamConfigs[agentId];
    const teamLabel = teamKey === 'team1ChatId' ? '1-Komanda' : '2-Komanda';
    onShowToast(`Chat ID (${chatId}) -> ${agent?.agentName || agentId} ning ${teamLabel}siga qo'yildi!`, 'info');
  };

  if (!isOpen) return null;

  const agentIds = Object.keys(teamConfigs).sort();

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>Telegram Guruhlarni Ulash (6 ta Agent x 2 Komanda)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Har bir agentning 1-Komanda va 2-Komandasi uchun alohida Telegram guruhlarini biriktirish
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* STEP BY STEP TUTORIAL BANNER */}
          <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowInstructions(!showInstructions)}>
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-100 text-sm">
                  Guruhlarni qanday ulash kerak? (Oddiy 3 ta qadam)
                </span>
              </div>
              <button className="text-slate-400 hover:text-slate-200 p-1">
                {showInstructions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {showInstructions && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-[11px] text-slate-300">
                {/* Step 1 */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-bold text-indigo-400">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[10px]">1</span>
                    <span>Bot ochish va Token olish</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Telegramda <b>@BotFather</b> ga kiring, <code>/newbot</code> deb yozing, nom bering va u bergan <b>Bot Token</b>ni nusxalab quyidagi maydonga qo'ying.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-bold text-emerald-400">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px]">2</span>
                    <span>Botni Guruhga Qo'shish (Admin bo'lishi shart emas!)</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Guruhga kirib, botingizni <b>oddiy a'zo</b> sifatida qo'shing. <b>Admin qilish shart emas!</b> Telegramda oddiy a'zo bot ham bemalol xabar va hisobotlarni yuboraveradi.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-bold text-indigo-400">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[10px]">3</span>
                    <span>Guruh Chat ID sini aniqlash</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Guruhda <code>/start</code> yoki <code>@botingiz_nomi</code> deb yozing, so'ngra pastdagi <b>"🔍 Guruhlarni avtomatik aniqlash"</b> tugmasini bosing (yoki <code>-100...</code> ID ni qo'lda yozing).
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bot Token & Auto Detection Section */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Bot className="w-4 h-4 text-indigo-400" />
                <span>Umumiy Telegram Bot Token</span>
                {botInfo && (
                  <span className="text-xs text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    @{botInfo.username} ({botInfo.firstName})
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={detecting || !botToken.trim()}
                onClick={handleDetectChats}
                className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition self-start sm:self-auto disabled:opacity-50"
              >
                {detecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Guruhlar qidirilmoqda...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>🔍 Guruhlarni avtomatik aniqlash</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Masalan: 7123456789:AAH... (BotFather'dan olingan token)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={defaultChatId}
                  onChange={(e) => setDefaultChatId(e.target.value)}
                  placeholder="Standart Chat ID (zaxira)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
              </div>
            </div>

            {/* Auto Detected Chats Display */}
            {detectedChats.length > 0 && (
              <div className="mt-3 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-indigo-200 text-xs flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Bot a'zo bo'lgan guruhlar ({detectedChats.length} ta topildi):</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Kerakli agent qatoriga biriktiring</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {detectedChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="p-2 bg-slate-900/90 border border-slate-800 rounded-md flex items-center justify-between gap-2 hover:border-indigo-500/40 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-200 text-xs truncate">
                          {chat.title}
                        </div>
                        <div className="text-[10px] font-mono text-indigo-300 flex items-center space-x-1">
                          <span>ID: {chat.id}</span>
                          <span className="text-slate-500">({chat.type})</span>
                        </div>
                      </div>

                      {/* Quick Assign Dropdown / Buttons */}
                      <div className="flex items-center space-x-1 shrink-0">
                        <select
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const [agId, teamKey] = e.target.value.split(':');
                            assignDetectedChat(chat.id, agId, teamKey as any);
                            e.target.value = '';
                          }}
                          className="bg-slate-950 border border-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">+ Biriktirish...</option>
                          {agentIds.map((agId) => {
                            const ag = teamConfigs[agId];
                            const label = ag?.agentName?.split(' ')[0] || agId;
                            return (
                              <React.Fragment key={agId}>
                                <option value={`${agId}:team1ChatId`}>{label} -&gt; 1-Komanda</option>
                                <option value={`${agId}:team2ChatId`}>{label} -&gt; 2-Komanda</option>
                              </React.Fragment>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Batch Mode Controls */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <div className="text-xs font-bold text-slate-200">Komandalar Ish Rejimi (Barcha Agentlar uchun):</div>
              <div className="text-[11px] text-slate-400">Agentlarni 1 ta umumiy komandaga yoki 2 ta alohida komandaga tezkor o'tkazish</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllAgentsMode('single')}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Barchasini 1-Komandaga o'tkazish</span>
              </button>
              <button
                type="button"
                onClick={() => setAllAgentsMode('dual')}
                className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Barchasini 2-Komandaga o'tkazish</span>
              </button>
            </div>
          </div>

          {/* 6 Agent Profiles Cards */}
          <div className="space-y-4">
            <div className="font-semibold text-slate-200 text-sm flex items-center justify-between">
              <span>Agent Profillari va Komandalar Sozlamalari:</span>
              <span className="text-xs text-slate-400 font-normal">Har bir agent uchun alohida rejim va guruhlarni belgilashingiz mumkin</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Yuklanmoqda...</div>
            ) : (
              agentIds.map((agId) => {
                const conf = teamConfigs[agId];
                const isSingle = conf.teamMode === 'single' || conf.isCombinedWorker === true;

                return (
                  <div
                    key={agId}
                    className={`p-4 rounded-xl space-y-3 transition shadow-xs border ${
                      isSingle
                        ? 'bg-emerald-950/20 border-emerald-800/60 hover:border-emerald-700/80'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono font-bold rounded border border-indigo-500/30 text-[11px]">
                          {agId}
                        </span>
                        <span className="font-bold text-slate-200 text-sm">
                          {conf.agentName}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                            isSingle
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {isSingle ? '🟢 1-Komanda' : '🔵 2-Komanda'}
                        </span>
                      </div>

                      {/* Mode switch buttons for this specific agent */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAgentMode(agId, 'single')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                            isSingle
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>1-Komanda (Birlik)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAgentMode(agId, 'dual')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                            !isSingle
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <Layers className="w-3 h-3" />
                          <span>2-Komanda (Alohida)</span>
                        </button>
                      </div>
                    </div>

                    {isSingle && (
                      <div className="text-[11px] text-emerald-300/90 bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span><b>Birlik komanda rejimi:</b> barcha toifalar yagona hisobot qilinadi va bitta Telegram guruhga yuboriladi.</span>
                      </div>
                    )}

                    {/* Team 1 and Team 2 Rows */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                      {/* 1-Komanda */}
                      <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 font-bold text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span>{isSingle ? 'Asosiy Telegram Guruhi' : '1-Komanda Guruhi'}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {isSingle ? 'Barcha brendlar / umumiy hisobot' : 'TikTok, Semichka, Sladunitsa...'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={conf.team1ChatId || ''}
                            onChange={(e) => updateTeamField(agId, 'team1ChatId', e.target.value)}
                            placeholder="Telegram Guruh Chat ID (masalan: -100...)"
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            disabled={testingKey === `${agId}-1-Komanda`}
                            onClick={() => handleTestTeam(agId, '1-Komanda', conf.team1ChatId, conf.team1TopicId)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium flex items-center space-x-1 transition shrink-0 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3 text-emerald-400" />
                            <span>Test</span>
                          </button>
                        </div>
                      </div>

                      {/* 2-Komanda */}
                      <div className={`p-3 bg-slate-900/80 border rounded-lg space-y-2 ${isSingle ? 'border-slate-800/60 opacity-80' : 'border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 font-bold text-sky-400">
                            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                            <span>2-Komanda Guruhi</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {isSingle ? '(1-Komandada xabarlar yuqoriga boradi)' : 'Vafli, LacoooL, ANATA, Suv...'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={conf.team2ChatId || ''}
                            onChange={(e) => updateTeamField(agId, 'team2ChatId', e.target.value)}
                            placeholder={isSingle ? "Ixtiyoriy zaxira ID" : "Telegram Guruh Chat ID (masalan: -100...)"}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            disabled={testingKey === `${agId}-2-Komanda`}
                            onClick={() => handleTestTeam(agId, '2-Komanda', conf.team2ChatId, conf.team2TopicId)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium flex items-center space-x-1 transition shrink-0 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3 text-sky-400" />
                            <span>Test</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="text-[11px] text-slate-400">
            Chat ID lar kiritilgach <b>"Barchasini Saqlash"</b> tugmasini bosing.
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
            >
              Yopish
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saqlanmoqda..." : "Barchasini Saqlash"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
