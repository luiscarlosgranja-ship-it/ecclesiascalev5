import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import type { AuthUser } from '../types';
import api from '../utils/api';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

type View = 'login' | 'register' | 'forgot' | '2fa' | 'secretary';

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [view, setView] = useState<View>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', confirmPassword: '', code: '', department_id: '', secEmail: '', secPassword: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [mustChangePw, setMustChangePw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [cultTypes, setCultTypes] = useState<{ id: number; name: string }[]>([]);
  const [availability, setAvailability] = useState<Record<number, boolean>>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [churchName, setChurchName] = useState('');

  useEffect(() => {
    // Detecta sessão expirada vinda do interceptor de 401
    if (sessionStorage.getItem('session_expired') === '1') {
      sessionStorage.removeItem('session_expired');
      setError('Sua sessão expirou. Faça login novamente.');
    }

    fetch('/api/public/departments')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch('/api/public/cult_types')
      .then(r => r.ok ? r.json() : [])
      .then(data => setCultTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch('/api/public/church-name')
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data.name) setChurchName(data.name); })
      .catch(() => {});
    fetch('/api/settings/logo')
      .then(r => r.ok ? r.json() : {})
      .then(data => { if (data.logo) setLogoUrl(data.logo); })
      .catch(() => {});
  }, []);

  // ── Favicon e título da aba (tela de login) ───────────────────────────────
  useEffect(() => {
    if (churchName) document.title = churchName;
    if (logoUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = logoUrl;
    }
  }, [churchName, logoUrl]);

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) { setError('Senha deve ter mínimo 8 caracteres'); return; }
    if (newPassword !== newPasswordConfirm) { setError('As senhas não coincidem'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/security/change-password', { member_id: pendingUser.member_id, password: newPassword });
      onLogin(pendingUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar senha');
    } finally { setLoading(false); }
  }

  // Tela de troca obrigatória de senha
  if (mustChangePw) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0a09', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: '#1c1917', border: '1px solid #44403c', borderRadius: '16px', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '48px', height: '48px', background: '#f59e0b22', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              🔑
            </div>
            <h2 style={{ color: '#e7e5e4', fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Troca de Senha Obrigatória</h2>
            <p style={{ color: '#a8a29e', fontSize: '13px', margin: 0 }}>Por segurança, defina uma nova senha para continuar.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nova Senha *</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', background: '#292524', border: '1px solid #44403c', borderRadius: '8px', padding: '10px 12px', color: '#e7e5e4', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Confirmar Senha *</label>
              <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                placeholder="Repita a nova senha"
                style={{ width: '100%', background: '#292524', border: '1px solid #44403c', borderRadius: '8px', padding: '10px 12px', color: '#e7e5e4', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}
            <button onClick={handleChangePassword} disabled={loading}
              style={{ background: '#f59e0b', color: '#1c1917', border: 'none', borderRadius: '8px', padding: '12px', fontWeight: 700, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '4px' }}>
              {loading ? 'Salvando...' : 'Definir Nova Senha e Entrar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSecretaryLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ requires2FA?: boolean; tempToken?: string } & AuthUser>('/login', {
        email: form.secEmail.trim(), password: form.secPassword,
      });
      if (data.requires2FA) {
        setTempToken(data.tempToken || '');
        setView('2fa');
      } else {
        if ((data as any).role !== 'Secretaria') {
          setError('Acesso restrito. Use o login de voluntário.');
          return;
        }
        onLogin(data as unknown as AuthUser);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Credenciais inválidas');
    } finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ requires2FA?: boolean; tempToken?: string } & AuthUser>('/login', {
        email: form.email, password: form.password,
      });
      if (data.requires2FA) {
        setTempToken(data.tempToken || '');
        setView('2fa');
      } else {
        onLogin(data as unknown as AuthUser);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Credenciais inválidas');
    } finally { setLoading(false); }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<AuthUser>('/verify-2fa', { code: form.code, tempToken });
      onLogin(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido');
    } finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { setError('Senhas não coincidem'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/register', { name: form.name, email: form.email, password: form.password, department_id: form.department_id || undefined, availability });
      setSuccess('Conta criada com sucesso! Faça login para entrar.');
      setAvailability({});
      setView('login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar conta');
    } finally { setLoading(false); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/forgot-password', { email: form.email });
      setSuccess('E-mail de redefinição enviado, verifique sua caixa de entrada.');
      setView('login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'E-mail não encontrado');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-800/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          {logoUrl ? (
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
              <img src={logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-2xl" style={{ background: 'transparent' }} />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl shadow-lg mb-4">
              <span className="text-white font-bold text-2xl">{(churchName || 'E')[0].toUpperCase()}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-stone-100">{churchName || 'EcclesiaScale'}</h1>
          <p className="text-stone-500 text-sm mt-1">Gestão de Escalas para Igrejas</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-stone-600 text-xs">EcclesiaScale v5.0</span>
            <span className="text-stone-700 text-xs">•</span>
            <span className="text-stone-600 text-xs">📞 21970031043</span>
          </div>
        </div>

        <div className="bg-stone-900 border border-stone-700 rounded-2xl p-8 shadow-2xl">
          {/* Login */}
          {view === 'login' && (
            <>
              <h2 className="text-stone-200 font-semibold text-lg mb-6">Entrar</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                      className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-9 pr-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                      placeholder="seu@email.com" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} required
                      className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-9 pr-10 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                      placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
                {success && <p className="text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">{success}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Entrar
                </button>
              </form>
              <div className="mt-4 flex flex-col gap-2 text-center">
                <button onClick={() => { setView('register'); setError(''); }} className="text-amber-400 hover:text-amber-300 text-sm transition-colors">
                  Criar conta
                </button>
                <button onClick={() => { setView('forgot'); setError(''); }} className="text-stone-500 hover:text-stone-400 text-xs transition-colors">
                  Esqueci minha senha
                </button>
                <div className="border-t border-stone-800 pt-2 mt-1">
                  <button onClick={() => { setView('secretary'); setError(''); setSuccess(''); }} className="text-violet-400 hover:text-violet-300 text-xs transition-colors flex items-center justify-center gap-1.5 w-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    Acesso Secretaria
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Secretary Login */}
          {view === 'secretary' && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-7 h-7 rounded-lg bg-violet-700 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <h2 className="text-stone-200 font-semibold text-lg">Acesso Secretaria</h2>
              </div>
              <form onSubmit={handleSecretaryLogin} className="space-y-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    <input type="email" value={form.secEmail} onChange={e => set('secEmail', e.target.value)} required
                      autoComplete="username"
                      className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-9 pr-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-violet-500 placeholder-stone-500"
                      placeholder="secretaria@email.com" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    <input type={showPw ? 'text' : 'password'} value={form.secPassword} onChange={e => set('secPassword', e.target.value)} required
                      autoComplete="current-password"
                      className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-9 pr-10 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-violet-500 placeholder-stone-500"
                      placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Entrar como Secretaria
                </button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { setView('login'); setError(''); }}
                  className="text-stone-500 hover:text-stone-400 text-xs transition-colors">
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}

          {/* Register */}
          {view === 'register' && (
            <>
              <h2 className="text-stone-200 font-semibold text-lg mb-6">Criar Conta</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Nome completo</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="Seu nome" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="seu@email.com" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Departamento</label>
                  <select
                    value={form.department_id}
                    onChange={e => set('department_id', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecionar departamento...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Senha</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
                    placeholder="Mínimo 8 caracteres" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Confirmar senha</label>
                  <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
                </div>
                {cultTypes.length > 0 && (
                  <div>
                    <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">
                      Disponibilidade <span className="text-stone-600 normal-case">(marque quando pode servir)</span>
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {cultTypes.map(ct => (
                        <label key={ct.id} className="flex items-center gap-3 cursor-pointer bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 hover:border-amber-600/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={!!availability[ct.id]}
                            onChange={e => setAvailability(prev => ({ ...prev, [ct.id]: e.target.checked }))}
                            className="w-4 h-4 accent-amber-500 flex-shrink-0"
                          />
                          <span className="text-stone-300 text-xs leading-tight">{ct.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Criar Conta
                </button>
                <button type="button" onClick={() => setView('login')} className="w-full text-stone-500 hover:text-stone-400 text-sm transition-colors">
                  Já tenho conta
                </button>
              </form>
            </>
          )}

          {/* Forgot Password */}
          {view === 'forgot' && (
            <>
              <h2 className="text-stone-200 font-semibold text-lg mb-2">Recuperar Senha</h2>
              <p className="text-stone-500 text-sm mb-6">Enviaremos um link de redefinição para seu e-mail.</p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="seu@email.com" />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Enviar E-mail
                </button>
                <button type="button" onClick={() => setView('login')} className="w-full text-stone-500 hover:text-stone-400 text-sm">
                  Voltar ao login
                </button>
              </form>
            </>
          )}

          {/* 2FA */}
          {view === '2fa' && (
            <>
              <h2 className="text-stone-200 font-semibold text-lg mb-2">Verificação 2FA</h2>
              <p className="text-stone-500 text-sm mb-6">Digite o código enviado ao seu e-mail.</p>
              <form onSubmit={handleVerify2FA} className="space-y-4">
                <input
                  type="text"
                  value={form.code}
                  onChange={e => set('code', e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-3 text-stone-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                  {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Verificar'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
