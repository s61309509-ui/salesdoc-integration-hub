import { useState, useEffect } from 'react';
import { Truck, CheckCircle2, AlertTriangle, Play, RefreshCw, X, ShieldCheck, ArrowRight, Clock, HelpCircle, Calendar } from 'lucide-react';

interface BatchShipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PreviewData {
  cutoffDate: string;
  yesterdayStr: string;
  totalOldNewOrders: number;
  todayNewOrders: number;
  sampleOrders: Array<{
    id: string;
    dateCreate: string;
    nextDayShipment: string;
    clientName: string;
    totalSumma: number;
  }>;
  sampleTodayOrders?: Array<{
    id: string;
    dateCreate: string;
    nextDayShipment: string;
    clientName: string;
    totalSumma: number;
  }>;
}

interface RunResult {
  success: boolean;
  cutoffDate: string;
  mode: string;
  totalUpdated: number;
  totalSkippedToday: number;
  batchesProcessed: number;
  sampleUpdated: Array<{
    id: string;
    dateCreate: string;
    dateShipment: string;
    status: number;
  }>;
  errors: string[];
}

type ShipMode = 'old_only' | 'today_only' | 'all';

export function BatchShipModal({ isOpen, onClose, onSuccess }: BatchShipModalProps) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [mode, setMode] = useState<ShipMode>('old_only');
  const [selectedLimit, setSelectedLimit] = useState<number>(100);
  const [isDryRun, setIsDryRun] = useState<boolean>(false);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const fetchPreview = async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/salesdoc/orders/batch-ship-preview');
      const data = await res.json();
      if (data.success && data.data) {
        setPreview(data.data);
      } else {
        setPreviewError(data.error || 'Preview maʼlumotlarini yuklab boʻlmadi');
      }
    } catch (err: any) {
      setPreviewError(err.message || 'Tarmoq xatosi');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setRunResult(null);
      setRunError(null);
      fetchPreview();
    }
  }, [isOpen]);

  // Adjust default limit when mode changes
  useEffect(() => {
    if (mode === 'today_only') {
      setSelectedLimit(preview?.todayNewOrders ? Math.max(50, preview.todayNewOrders) : 50);
    } else if (mode === 'old_only') {
      setSelectedLimit(100);
    } else {
      setSelectedLimit(500);
    }
  }, [mode, preview?.todayNewOrders]);

  if (!isOpen) return null;

  const handleStartShipment = async () => {
    setIsRunning(true);
    setRunError(null);
    setRunResult(null);

    try {
      const res = await fetch('/api/salesdoc/orders/batch-ship-old', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxOrders: selectedLimit,
          batchSize: 50,
          dryRun: isDryRun,
          mode: mode
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        setRunResult(json.data);
        if (onSuccess) {
          onSuccess();
        }
        // Refresh preview after real update
        if (!isDryRun) {
          fetchPreview();
        }
      } else {
        setRunError(json.error || 'Otgruzka jarayonida xatolik yuz berdi');
      }
    } catch (err: any) {
      setRunError(err.message || 'Tarmoq xatoligi yuz berdi');
    } finally {
      setIsRunning(false);
    }
  };

  const sampleList = mode === 'today_only'
    ? (preview?.sampleTodayOrders || [])
    : (preview?.sampleOrders || []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Buyurtmalarni otgrujen qilish (SalesDoc)
              </h2>
              <p className="text-xs text-slate-400">
                Statusni 2 (Отгружен) ga oʻzgartirish va yetkazib berish sanasini +1 kun qilib belgilash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Explanation Alert for User */}
          <div className="p-3.5 bg-blue-950/30 border border-blue-500/30 rounded-lg flex items-start gap-2.5 text-blue-200 text-xs">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-blue-300">
                Nimaga baʼzi zakazlar otgrujen boʻlmagan?
              </div>
              <p className="text-slate-300 leading-relaxed">
                Oldingi koʻrsatmada <span className="font-medium text-amber-300">«bugungi zakazlar qolsin»</span> qoidasi oʻrnatilgan edi. Shu sababli bugungi tushgan <span className="font-semibold text-white">{preview?.todayNewOrders ?? 42} ta yangi zakaz</span> xavfsizlik uchun saqlab qolingan. Agar aynan bugungi zakazlarni otgrujen qilmoqchi boʻlsangiz, quyida <span className="font-semibold text-emerald-300">«Faqat bugungi zakazlar»</span> tugmasini tanlang.
              </p>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div className="space-y-1.5">
            <label className="font-medium text-slate-200 block">
              Qaysi zakazlarni otgrujen qilmoqchisiz?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('old_only')}
                disabled={isRunning}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === 'old_only'
                    ? 'bg-emerald-950/40 border-emerald-500 text-slate-100 shadow-xs'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs">Kechagacha qolganlar</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-mono text-emerald-400">
                    {preview?.totalOldNewOrders ?? '...'} ta
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Bugungi zakazlar saqlanadi (tegmaydi)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('today_only')}
                disabled={isRunning}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === 'today_only'
                    ? 'bg-blue-950/40 border-blue-500 text-slate-100 shadow-xs'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs">Faqat bugungi zakazlar</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-mono text-blue-400">
                    {preview?.todayNewOrders ?? '...'} ta
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Bugun tushgan zakazlar ertangi sana bilan
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('all')}
                disabled={isRunning}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === 'all'
                    ? 'bg-purple-950/40 border-purple-500 text-slate-100 shadow-xs'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs">Barcha zakazlar</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-mono text-purple-400">
                    {(preview?.totalOldNewOrders ?? 0) + (preview?.todayNewOrders ?? 0)} ta
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Eski va bugungi zakazlar birgalikda
                </div>
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div className="text-slate-400 mb-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Bugungi sana</span>
              </div>
              <div className="text-sm font-semibold text-slate-100 font-mono">
                {preview?.cutoffDate || '2026-09-07'}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div className="text-slate-400 mb-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Bugun tushgan zakazlar</span>
              </div>
              <div className="text-sm font-semibold text-blue-400 font-mono">
                {loadingPreview ? '...' : `${preview?.todayNewOrders ?? 0} ta yangi`}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div className="text-slate-400 mb-0.5 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Yangi holat & Sana</span>
              </div>
              <div className="text-sm font-semibold text-emerald-400 font-mono">
                Status: 2 (Отгружен) / +1 kun
              </div>
            </div>
          </div>

          {/* Quantity selector */}
          <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-lg space-y-2.5">
            <label className="font-medium text-slate-200 block">
              Nechta zakazni otgrujen qilmoqchisiz?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: mode === 'today_only' ? `${preview?.todayNewOrders || 42} ta (Barchasi)` : '50 ta', value: mode === 'today_only' ? (preview?.todayNewOrders || 50) : 50 },
                { label: '100 ta', value: 100 },
                { label: '500 ta', value: 500 },
                { label: '1 000 ta', value: 1000 }
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setSelectedLimit(opt.value)}
                  disabled={isRunning}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    selectedLimit === opt.value
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                      : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span>Sinov rejimi (Dry Run - SalesDoc ga yozmaydi)</span>
              </label>

              <button
                type="button"
                onClick={fetchPreview}
                disabled={loadingPreview || isRunning}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
                <span>Yangilash</span>
              </button>
            </div>
          </div>

          {/* Sample preview table */}
          {sampleList.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-300">
                  {mode === 'today_only' ? 'Bugun tushgan zakazlardan namunalar:' : 'Navbatdagi namunaviy zakazlar:'}
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  (Namuna {sampleList.length} ta)
                </span>
              </div>

              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 text-slate-400 text-[11px] border-b border-slate-800">
                      <th className="py-2 px-3 font-medium">Zakaz ID</th>
                      <th className="py-2 px-3 font-medium">Mijoz</th>
                      <th className="py-2 px-3 font-medium">Buyurtma sanasi</th>
                      <th className="py-2 px-3 font-medium text-emerald-400">Yangi joʻnatish sanasi</th>
                      <th className="py-2 px-3 font-medium text-right">Summa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-[11px]">
                    {sampleList.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-slate-300">{ord.id}</td>
                        <td className="py-2 px-3 text-slate-300 font-medium truncate max-w-[150px]">{ord.clientName}</td>
                        <td className="py-2 px-3 text-slate-400 font-mono">{ord.dateCreate}</td>
                        <td className="py-2 px-3 font-mono font-medium text-emerald-400 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-slate-500 inline" />
                          <span>{ord.nextDayShipment}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-200">
                          {Number(ord.totalSumma).toLocaleString()} soʻm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Success Execution Result */}
          {runResult && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Muvaffaqiyatli bajarildi! {runResult.totalUpdated} ta zakaz otgrujen qilindi.
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300 text-[11px]">
                <div className="p-2 bg-slate-900/60 rounded">
                  <div className="text-slate-500">Yangilandi:</div>
                  <div className="font-semibold text-emerald-400 text-xs">{runResult.totalUpdated} ta</div>
                </div>
                <div className="p-2 bg-slate-900/60 rounded">
                  <div className="text-slate-500">Qolgan bugungilar:</div>
                  <div className="font-semibold text-blue-400 text-xs">{runResult.totalSkippedToday} ta</div>
                </div>
                <div className="p-2 bg-slate-900/60 rounded">
                  <div className="text-slate-500">Partiyalar soni:</div>
                  <div className="font-semibold text-slate-200 text-xs">{runResult.batchesProcessed} ta</div>
                </div>
                <div className="p-2 bg-slate-900/60 rounded">
                  <div className="text-slate-500">Xatolar:</div>
                  <div className="font-semibold text-slate-200 text-xs">{runResult.errors.length} ta</div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {runError && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/30 rounded-lg text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{runError}</span>
            </div>
          )}

          {previewError && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-lg text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Yopish
          </button>

          <button
            type="button"
            onClick={handleStartShipment}
            disabled={isRunning || loadingPreview}
            className={`px-5 py-2 text-xs font-medium text-white rounded-lg flex items-center gap-2 shadow-lg transition-all ${
              isRunning
                ? 'bg-emerald-800 cursor-not-allowed opacity-80'
                : mode === 'today_only'
                  ? 'bg-blue-600 hover:bg-blue-500 active:scale-98 shadow-blue-900/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:scale-98 shadow-emerald-900/20'
            }`}
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Otgrujen qilinmoqda ({selectedLimit} ta)...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isDryRun
                    ? 'Sinovni boshlash'
                    : mode === 'today_only'
                      ? `Bugungi ${selectedLimit} ta zakazni otgrujen qilish`
                      : `${selectedLimit} ta zakazni otgrujen qilish`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
