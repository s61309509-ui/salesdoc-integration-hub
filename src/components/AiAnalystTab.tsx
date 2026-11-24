import { useEffect, useRef, useState, FormEvent } from 'react';
import {
  Sparkles,
  Send,
  AlertTriangle,
  CheckCircle2,
  Camera,
  RefreshCw,
  Database,
  ShieldCheck,
  Terminal,
  Trash2,
  Bot,
  User
} from 'lucide-react';
import { AiServiceStatus } from '../types';

interface AiAnalystTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  toolsUsed?: string[];
  timestamp: string;
  error?: boolean;
}

interface BatchAuditResult {
  analyzedCount: number;
  skippedCachedCount: number;
  failedCount: number;
  totalVisitsScanned: number;
  errors: Array<{ photoUrl: string; error: string }>;
}

const QUICK_PROMPTS = [
  "Agentlarni to'liq nazorat hisobotini chiqar (faollik, savdo, soxta rasmlar, 2-qurilma)",
  "Bugun 'do'kon ichi' deb yuklangan soxta yoki mos kelmaydigan rasmlarni tekshir",
  "Bugungi kunlik savdo, OKB/AKB va vozvrat holatini tahlil qil",
  "Bugun qaysi agentlarda vizit yoki rasm muammosi bor?",
  "Ikki qurilmadan (2-qurilma) zakaz urayotgan agentlarni tekshir",
  "Qarzdor mijozlar va d0_12 farqlarini ko'rsat",
  "Sklad qoldiqlari va oxirgi zakazlar holatini ko'rsat"
];

export function AiAnalystTab({ onShowToast }: AiAnalystTabProps) {
  const [aiStatus, setAiStatus] = useState<AiServiceStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Vision batch audit state
  const tashkentToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const [auditDateFrom, setAuditDateFrom] = useState(tashkentToday);
  const [auditDateTo, setAuditDateTo] = useState(tashkentToday);
  const [auditAgentId, setAuditAgentId] = useState('all');
  const [auditingPhotos, setAuditingPhotos] = useState(false);
  const [lastAuditResult, setLastAuditResult] = useState<BatchAuditResult | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/salesdoc/ai/status').then((r) => r.json());
      if (res.success && res.data) {
        setAiStatus(res.data);
      }
    } catch (err: any) {
      console.error('AI status fetch error:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `U_${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const historyPayload = messages
        .filter((m) => !m.error)
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/salesdoc/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload
        })
      });
      const json = await res.json();

      if (json.success && json.data) {
        setMessages((prev) => [
          ...prev,
          {
            id: `M_${Date.now()}`,
            role: 'model',
            text: json.data.answer || "Ma'lumot qaytarilmadi.",
            toolsUsed: json.data.toolsUsed || [],
            timestamp: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        const errText = json.error || "AI tahlilchi javob qaytara olmadi";
        setMessages((prev) => [
          ...prev,
          {
            id: `E_${Date.now()}`,
            role: 'model',
            text: `Xatolik: ${errText}`,
            timestamp: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
            error: true
          }
        ]);
        onShowToast(errText, 'error');
      }
    } catch (err: any) {
      const errText = err.message || 'Tarmoq xatoligi';
      setMessages((prev) => [
        ...prev,
        {
          id: `E_${Date.now()}`,
          role: 'model',
          text: `Server bilan aloqa xatosi: ${errText}`,
          timestamp: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
          error: true
        }
      ]);
      onShowToast(errText, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const handleBatchPhotoAudit = async () => {
    setAuditingPhotos(true);
    try {
      const res = await fetch('/api/salesdoc/ai/analyze-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom: auditDateFrom,
          dateTo: auditDateTo,
          agentId: auditAgentId,
          maxPhotos: 15
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        setLastAuditResult(json.data);
        onShowToast(
          `AI Foto Auditi yakunlandi: ${json.data.analyzedCount} ta yangi rasm tekshirildi (${json.data.skippedCachedCount ?? 0} ta keshdan).`,
          'success'
        );
      } else {
        onShowToast(json.error || 'AI Foto auditida xatolik', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Server xatoligi', 'error');
    } finally {
      setAuditingPhotos(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status & Deployment Architecture Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-xl shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  AI Biznes Tahlilchi & Vision Nazorati
                </h2>
                {loadingStatus ? (
                  <span className="px-2 py-0.5 text-[11px] rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Tekshirilmoqda...
                  </span>
                ) : aiStatus?.configured ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Tayyor ({aiStatus.model})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    <span>GEMINI_API_KEY ulanmagan</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {aiStatus?.message ||
                  "Faqat real SalesDoc API va mahalliy baza ma'lumotlariga tayangan holda savdo, vizit, rasm va qarzdorliklarni tahlil qiladi."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchStatus}
            disabled={loadingStatus}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Holatni Yangilash</span>
          </button>
        </div>

        {!loadingStatus && aiStatus && !aiStatus.configured && (
          <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>AI xizmatini serverda faollashtirish tartibi</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Xavfsizlik qoidalariga muvofiq API kaliti brauzerda kiritilmaydi. Dastur tashqi serverga chiqarilganda server ildizidagi{' '}
              <code className="px-1.5 py-0.5 bg-slate-950 rounded text-amber-300 font-mono">.env</code> fayliga{' '}
              <code className="px-1.5 py-0.5 bg-slate-950 rounded text-emerald-300 font-mono">GEMINI_API_KEY=...</code>{' '}
              o'zgaruvchisini kiriting va serverni qayta ishga tushiring (AI Studio ichida esa Settings &rarr; Secrets bo'limidan qo'shiladi).
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200">0% To'qima Ma'lumot</div>
              <div className="text-slate-400 mt-0.5">
                AI har bir javobni real SalesDoc funksiyalarini chaqirib oladi; ma'lumot topilmasa ochiqchasiga aytadi.
              </div>
            </div>
          </div>
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start space-x-2.5">
            <Camera className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200">Gemini Vision Foto Auditi</div>
              <div className="text-slate-400 mt-0.5">
                Agent yuklagan rasmlarni ko'rib haqiqiy polka, tashqi ko'rinish yoki qora/to'silgan kamerani ajratadi.
              </div>
            </div>
          </div>
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start space-x-2.5">
            <Database className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200">Tashqi Serverga Tayyor</div>
              <div className="text-slate-400 mt-0.5">
                Server <code className="text-slate-300 font-mono">.env</code> dan kalitni o'qiydi va barcha endpointlar bilan mustaqil ishlaydi.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Analyst Chat + Batch Photo Vision Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Grounded Business Analyst Chat */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[640px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-slate-100">SalesDoc AI Tahlilchi Suxbati</span>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="text-xs text-slate-400 hover:text-rose-300 flex items-center space-x-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Tarixni tozalash</span>
              </button>
            )}
          </div>

          {/* Quick prompts */}
          <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending || !aiStatus?.configured}
                onClick={() => sendQuestion(q)}
                className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-indigo-600/20 hover:text-indigo-200 hover:border-indigo-500/40 text-slate-300 border border-slate-700 transition text-left disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Real Ma'lumotlar Bo'yicha Savol Bering</h3>
                  <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
                    AI tahlilchi to'g'ridan-to'g'ri SalesDoc hisobotlari, tashriflar, foto-hisobotlar, agent qurilmalari, qarzdor mijozlar va sklad qoldiqlaridan real raqamlarni tekshirib javob beradi.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                      msg.role === 'user'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : msg.error
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed border ${
                      msg.role === 'user'
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-slate-100'
                        : msg.error
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                          : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>

                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-indigo-400" />
                          <span>Tekshirilgan manbalar:</span>
                        </span>
                        {msg.toolsUsed.map((tool) => (
                          <span
                            key={tool}
                            className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 font-mono text-[10px]"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 mt-1.5 text-right">{msg.timestamp}</div>
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-center space-x-2 text-xs text-indigo-300 bg-indigo-950/30 border border-indigo-500/20 px-3.5 py-2.5 rounded-xl w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Real SalesDoc ma'lumotlari yuklanib, AI tahlil qilmoqda...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <form onSubmit={handleFormSubmit} className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || !aiStatus?.configured}
              placeholder={
                aiStatus?.configured
                  ? "Savolingizni yozing (masalan: Bugun qaysi agentlarda vozvrat ko'p?)"
                  : "GEMINI_API_KEY sozlanmaguncha suhbat o'chirilgan"
              }
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || !aiStatus?.configured}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Yuborish</span>
            </button>
          </form>
        </div>

        {/* Right col: Gemini Vision Batch Photo Audit */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 h-fit">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-lg">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">AI Foto Auditi (Gemini Vision)</h3>
              <p className="text-[11px] text-slate-400">Rasmlarni haqiqiy kontentiga qarab avtomatik ajratish</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Boshlanish sanasi</label>
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Tugash sanasi</label>
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Agent bo'yicha filtr</label>
              <select
                value={auditAgentId}
                onChange={(e) => setAuditAgentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">Barcha Agentlar</option>
                <option value="d0_1">ТП1</option>
                <option value="d0_2">ТП2</option>
                <option value="d0_3">ТП3</option>
                <option value="d0_4">ТП4</option>
                <option value="d0_5">ТП5</option>
                <option value="d0_6">ТП6</option>
              </select>
            </div>

            <button
              type="button"
              disabled={auditingPhotos || !aiStatus?.configured}
              onClick={handleBatchPhotoAudit}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-sm"
            >
              <Sparkles className={`w-4 h-4 ${auditingPhotos ? 'animate-spin' : ''}`} />
              <span>
                {auditingPhotos
                  ? 'Rasmlar AI Vision bilan tekshirilmoqda...'
                  : 'Bugungi rasmlarni AI Vision bilan tekshirish'}
              </span>
            </button>
          </div>

          {lastAuditResult && (
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="font-semibold text-slate-200">Oxirgi Audit Natijasi</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400">Tashriflar</div>
                  <div className="text-sm font-bold text-slate-100">{lastAuditResult.totalVisitsScanned}</div>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-emerald-400">Yangi Tahlil</div>
                  <div className="text-sm font-bold text-emerald-300">{lastAuditResult.analyzedCount}</div>
                </div>
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-indigo-400">Keshdan</div>
                  <div className="text-sm font-bold text-indigo-300">{lastAuditResult.skippedCachedCount ?? 0}</div>
                </div>
              </div>

              {lastAuditResult.errors && lastAuditResult.errors.length > 0 && (
                <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg text-[11px] text-rose-300 space-y-1 max-h-32 overflow-y-auto">
                  <div className="font-semibold">Xatoliklar ({lastAuditResult.errors.length}):</div>
                  {lastAuditResult.errors.map((err, i) => (
                    <div key={i}>• {err.error || String(err)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">Tekshiruv klassifikatsiyasi (Do'kon ichi mosligi):</div>
            <div>• <span className="text-purple-300 font-semibold">polka_inside</span> — do'kon ichidagi haqiqiy mahsulot polkasi</div>
            <div>• <span className="text-blue-300 font-semibold">store_front</span> — do'kon tashqi ko'rinishi (ichki deb yuklansa soxta sanaladi)</div>
            <div>• <span className="text-fuchsia-300 font-semibold">screen_or_rephoto</span> — monitor/telefon ekrani yoki boshqa rasmdan qayta olingan</div>
            <div>• <span className="text-rose-300 font-semibold">covered_or_dark</span> — kamera barmoq/qorong'u bilan to'silgan</div>
            <div>• <span className="text-amber-300 font-semibold">unclear_or_irrelevant</span> — do'konga aloqasiz yoki noaniq rasm</div>
          </div>
        </div>
      </div>
    </div>
  );
}
