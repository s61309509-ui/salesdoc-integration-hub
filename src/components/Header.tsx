import { useState, useEffect, FormEvent } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Zap,
  Key,
  Globe,
  User,
  Save,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  X,
  HardDrive
} from 'lucide-react';
import { ConnectionTestResult, StatusData } from '../types';

interface HeaderProps {
  statusData: StatusData | null;
  onTestConnection: () => Promise<ConnectionTestResult | void>;
  testingConnection: boolean;
  onToggleDryRun: (enabled: boolean) => void;
  onUpdateConfig?: (updates: {
    baseUrl?: string;
    token?: string;
    userId?: string;
    filialId?: string;
    login?: string;
    password?: string;
  }) => Promise<boolean>;
  showConfigModal?: boolean;
  onOpenConfig?: () => void;
  onCloseConfig?: () => void;
}

export function Header({
  statusData,
  onTestConnection,
  testingConnection,
  onToggleDryRun,
  onUpdateConfig,
  showConfigModal,
  onOpenConfig,
  onCloseConfig
}: HeaderProps) {
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const isModalOpen = showConfigModal !== undefined ? showConfigModal : internalModalOpen;

  const setModalOpen = (open: boolean) => {
    if (open) {
      if (onOpenConfig) onOpenConfig();
      else setInternalModalOpen(true);
    } else {
      if (onCloseConfig) onCloseConfig();
      else setInternalModalOpen(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'login' | 'token' | 'overview'>('login');
  const [editUrl, setEditUrl] = useState(statusData?.baseUrl || 'https://namdistribution.salesdoc.io/api/v2');
  const [editToken, setEditToken] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editFilialId, setEditFilialId] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (statusData) {
      if (statusData.baseUrl) setEditUrl(statusData.baseUrl);
      if (statusData.userId && statusData.userId !== 'N/A') setEditUserId(statusData.userId);
      if (statusData.filialId && statusData.filialId !== 'None') setEditFilialId(statusData.filialId);
      if (statusData.savedLogin) setLoginUser(statusData.savedLogin);
    }
  }, [statusData]);

  const isConnected = statusData?.metrics.connection_status === 'connected';
  const isNotConfigured = statusData?.metrics.connection_status === 'not_configured';

  // Handle Login & Password submission
  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPassword.trim()) {
      setFeedback({ type: 'error', message: 'Iltimos, login va parolni to\'liq kiriting' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/salesdoc/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: editUrl.trim(),
          login: loginUser.trim(),
          password: loginPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: 'Muvaffaqiyatli ulandi va ma\'lumotlar diskda doimiy saqlandi! Endi qayta so\'ralmaydi.'
        });
        setLoginPassword('');
        await onTestConnection();
        setTimeout(() => {
          setModalOpen(false);
          setFeedback(null);
        }, 1500);
      } else {
        setFeedback({ type: 'error', message: data.error || 'SalesDoc login amalga oshmadi' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Tarmoq xatosi yuz berdi' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle manual Token submission
  const handleTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editToken.trim() && !statusData?.hasToken) {
      setFeedback({ type: 'error', message: 'API Tokenni kiriting' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      let cleanUserId = editUserId.trim();
      let cleanToken = editToken.trim();

      // Auto-extract userId if token formatted as userId:token
      if (cleanToken.includes(':') && !cleanUserId) {
        const parts = cleanToken.split(':');
        cleanUserId = parts[0];
        cleanToken = parts.slice(1).join(':');
      }

      if (onUpdateConfig) {
        const ok = await onUpdateConfig({
          baseUrl: editUrl.trim(),
          token: cleanToken || undefined,
          userId: cleanUserId || undefined,
          filialId: editFilialId.trim() || undefined
        });
        if (ok) {
          setFeedback({
            type: 'success',
            message: 'Token muvaffaqiyatli saqlandi va diskda mustahkamlandi!'
          });
          setEditToken('');
          await onTestConnection();
          setTimeout(() => {
            setModalOpen(false);
            setFeedback(null);
          }, 1500);
        } else {
          setFeedback({ type: 'error', message: 'Sozlamalarni saqlab bo\'lmadi' });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Xatolik yuz berdi' });
    } finally {
      setSubmitting(false);
    }
  };

  // Clear credentials
  const handleClearAuth = async () => {
    if (!window.confirm('Rostdan ham barcha saqlangan SalesDoc ma\'lumotlarini o\'chirmoqchimisiz?')) {
      return;
    }
    try {
      await fetch('/api/salesdoc/clear-auth', { method: 'POST' });
      setEditToken('');
      setLoginPassword('');
      setLoginUser('');
      setFeedback({ type: 'success', message: 'Barcha ma\'lumotlar tozalandi' });
      await onTestConnection();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Tozalashda xatolik' });
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Instance */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-semibold text-base sm:text-lg tracking-tight text-slate-100">
                  SalesDoc API V2 Hub
                </h1>
                <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Enterprise
                </span>
                <span className="hidden sm:inline-flex items-center space-x-1 bg-slate-800 text-slate-300 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-700">
                  <HardDrive className="w-3 h-3 text-emerald-400" />
                  <span>Doimiy xotira</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                {statusData?.baseUrl || 'https://namdistribution.salesdoc.io/api/v2'}
              </p>
            </div>
          </div>

          {/* Controls & Connection Status */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Dry Run Indicator & Toggle */}
            <button
              id="header-dry-run-toggle"
              onClick={() => onToggleDryRun(!statusData?.dryRun)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                statusData?.dryRun
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="When enabled, mutating API calls are simulated without writing to SalesDoc"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Dry Run: {statusData?.dryRun ? 'ON' : 'OFF'}</span>
            </button>

            {/* Status Badge */}
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : isNotConfigured
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {isConnected ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              <span className="capitalize">
                {isConnected ? 'Ulangan' : isNotConfigured ? 'Token Kiritilmagan' : 'Ulanish Xatosi'}
              </span>
            </div>

            {/* Test Connection Button */}
            <button
              id="header-test-connection-btn"
              onClick={onTestConnection}
              disabled={testingConnection}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-1.5 rounded-md border border-slate-700 transition"
              title="SalesDoc API aloqasini tekshirish"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Tekshirish</span>
            </button>

            {/* Settings trigger */}
            <button
              id="header-settings-btn"
              onClick={() => setModalOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-emerald-700/60 hover:bg-emerald-600 text-emerald-200 rounded-md border border-emerald-600/60 transition text-xs font-medium shadow-xs"
              title="SalesDoc Login, Parol va Token Sozlamalari"
            >
              <Settings className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">Sozlamalar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Config Details / Settings Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full text-slate-200 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    SalesDoc Tizim Sozlamalari
                  </h3>
                  <p className="text-xs text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 inline" />
                    <span>Doimiy xotira faol (admin o'zi o'zgartirmaguncha saqlanadi)</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Permanent storage notice */}
            <div className="mt-4 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-300 font-medium">
                <span className="flex items-center space-x-1.5 text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Doimiy Autentifikatsiya mexanizmi</span>
                </span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-mono">
                  Persistent
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Bir marta kiritilgan login, parol va token server diskida doimiy saqlanadi. Har bir bo'lim alohida so'ramaydi. Agar SalesDoc tokeni eskirsa, tizim saqlangan login va parol orqali yangi tokenni avtomatik oladi.
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setFeedback(null);
                }}
                className={`pb-2.5 px-3.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
                  activeTab === 'login'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>1. Login & Parol (Tavsiya etiladi)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('token');
                  setFeedback(null);
                }}
                className={`pb-2.5 px-3.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
                  activeTab === 'token'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>2. API Token (Qo'lda)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  setFeedback(null);
                }}
                className={`pb-2.5 px-3.5 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
                  activeTab === 'overview'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Holat ko'rinishi</span>
              </button>
            </div>

            {/* Feedback alert */}
            {feedback && (
              <div
                className={`mt-4 p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-800 text-rose-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* TAB 1: Login & Password */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1 flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>SalesDoc Base URL</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://namdistribution.salesdoc.io/api/v2"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kompaniya SalesDoc domeni (odatda: https://namdistribution.salesdoc.io/api/v2)
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1 flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>SalesDoc Login *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      placeholder="masalan: sardor yoki d0_67"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>SalesDoc Parol *</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center space-x-1"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPassword ? 'Yashirish' : 'Ko\'rsatish'}</span>
                      </button>
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Parolni kiriting"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="p-3 bg-emerald-950/30 border border-emerald-900/60 rounded-lg text-emerald-300/90 text-[11px] leading-relaxed">
                  💡 <strong>Qulaylik:</strong> Login va parol bir marta kiritilgach, tizim avtomatik SalesDoc serveriga ulanadi, yangi token oladi va diskda saqlaydi. Kelgusida token eskirgan taqdirda ham foydalanuvchini bezovta qilmasdan avtomatik yangilab boradi.
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleClearAuth}
                    className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded bg-rose-950/30 border border-rose-900/40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Tozalash</span>
                  </button>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    >
                      Yopish
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Ulanmoqda...' : 'Saqlash va Doimiy Ulanish'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: API Token & User ID */}
            {activeTab === 'token' && (
              <form onSubmit={handleTokenSubmit} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1 flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>SalesDoc Base URL</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://namdistribution.salesdoc.io/api/v2"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span>SalesDoc API Token *</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Hozirgi: {statusData?.tokenMasked || 'Yo\'q'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editToken}
                    onChange={(e) => setEditToken(e.target.value)}
                    placeholder="Yangi token kiriting (masalan: 98118... yoki d0_67:98118...)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Format: oddiy token yoki <code>userId:token</code> shaklida kiritishingiz mumkin.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1 flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>User ID (Agent ID)</span>
                    </label>
                    <input
                      type="text"
                      value={editUserId}
                      onChange={(e) => setEditUserId(e.target.value)}
                      placeholder="e.g. d0_67"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Filial ID (ixtiyoriy)</label>
                    <input
                      type="text"
                      value={editFilialId}
                      onChange={(e) => setEditFilialId(e.target.value)}
                      placeholder="e.g. 0 yoki bo'sh"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleClearAuth}
                    className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded bg-rose-950/30 border border-rose-900/40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Tozalash</span>
                  </button>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    >
                      Yopish
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Saqlanmoqda...' : 'Tokenni Doimiy Saqlash'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 3: Overview & Diagnostics */}
            {activeTab === 'overview' && (
              <div className="mt-4 space-y-3.5 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Base URL:</span>
                    <span className="text-slate-200 font-semibold">{statusData?.baseUrl}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Token holati:</span>
                    <span className={statusData?.hasToken ? 'text-emerald-400' : 'text-rose-400'}>
                      {statusData?.hasToken ? `Faol (${statusData.tokenMasked})` : 'Mavjud emas'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Saqlangan Login:</span>
                    <span className="text-slate-200">
                      {statusData?.savedLogin || 'Kiritilmagan'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Avtomatik yangilash:</span>
                    <span className={statusData?.hasSavedCredentials ? 'text-emerald-400' : 'text-amber-400'}>
                      {statusData?.hasSavedCredentials ? '✓ Faol (Doimiy)' : '✕ Faol emas (Login va parol kiritilsa faollashadi)'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">SalesDoc User ID:</span>
                    <span className="text-slate-200">{statusData?.userId || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Filial ID:</span>
                    <span className="text-slate-200">{statusData?.filialId || 'Default (0)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Dry Run (Simulyatsiya):</span>
                    <span className={statusData?.dryRun ? 'text-amber-400' : 'text-slate-200'}>
                      {statusData?.dryRun ? 'Yoniq (Ma\'lumot yozilmaydi)' : 'O\'chiq (Jonli rejim)'}
                    </span>
                  </div>
                </div>

                {statusData?.metrics.connection_message && (
                  <div
                    className={`p-3 rounded-xl border text-xs ${
                      statusData.metrics.connection_status === 'connected'
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800 text-rose-300'
                    }`}
                  >
                    <strong>Server javobi:</strong> {statusData.metrics.connection_message}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={onTestConnection}
                    disabled={testingConnection}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs border border-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                    <span>{testingConnection ? 'Sinovdan o\'tmoqda...' : 'Qayta tekshirish'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium"
                  >
                    Yopish
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
