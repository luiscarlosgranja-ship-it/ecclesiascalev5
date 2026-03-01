import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import type { AuthUser } from '../types';
import api from '../utils/api';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

type View = 'login' | 'register' | 'forgot' | '2fa';

// Form vazio como constante — reutilizado para reset limpo entre sessões
const EMPTY_FORM = { email: '', password: '', name: '', confirmPassword: '', code: '' };

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [view, setView] = useState<View>('login');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tempToken, setTempToken] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Troca de view sempre limpa erro e sucesso
  function goTo(v: View) {
    setView(v);
    setError('');
    setSuccess('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ requires2FA?: boolean; tempToken?: string } & AuthUser>('/login', {
        email: form.email.trim(), password: form.password,
      });
      if (data.requires2FA) {
        setTempToken(data.tempToken || '');
        setForm(f => ({ ...f, code: '' })); // limpa código anterior
        goTo('2fa');
      } else {
        setForm(EMPTY_FORM); // limpa form antes de passar adiante (evita stale ao trocar usuário)
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
      setForm(EMPTY_FORM); // limpa form ao autenticar via 2FA também
      onLogin(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido');
    } finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { setError('Senhas não coincidem'); return; }
    if (form.password.length < 8) { setError('Senha deve ter mínimo 8 caracteres'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/register', { name: form.name.trim(), email: form.email.trim(), password: form.password });
      setSuccess('Conta criada! Faça login para entrar.');
      setForm(f => ({ ...EMPTY_FORM, email: f.email })); // mantém e-mail para facilitar login
      goTo('login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar conta');
    } finally { setLoading(false); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/forgot-password', { email: form.email.trim() });
      setSuccess('Se o e-mail existir, você receberá as instruções em breve.');
      goTo('login');
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl shadow-lg mb-4">
            <span className="text-white font-bold text-2xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-100">EcclesiaScale</h1>
          <p className="text-stone-500 text-sm mt-1">Gestão de Escalas para Igrejas</p>
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
                      autoComplete="username"
                      className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-9 pr-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                      placeholder="seu@email.com" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} required
                      autoComplete="current-password"
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
                <button onClick={() => goTo('register')} className="text-amber-400 hover:text-amber-300 text-sm transition-colors">
                  Criar conta
                </button>
                <button onClick={() => goTo('forgot')} className="text-stone-500 hover:text-stone-400 text-xs transition-colors">
                  Esqueci minha senha
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
                    autoComplete="name"
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="Seu nome" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                    autoComplete="username"
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="seu@email.com" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Senha</label>
                  <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required
                    autoComplete="new-password"
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
                    placeholder="Mínimo 8 caracteres" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Confirmar senha</label>
                  <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required
                    autoComplete="new-password"
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Criar Conta
                </button>
                <button type="button" onClick={() => goTo('login')} className="w-full text-stone-500 hover:text-stone-400 text-sm transition-colors">
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
                    autoComplete="username"
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 placeholder-stone-500"
                    placeholder="seu@email.com" />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Enviar E-mail
                </button>
                <button type="button" onClick={() => goTo('login')} className="w-full text-stone-500 hover:text-stone-400 text-sm">
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
                  onChange={e => set('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full bg-stone-800 border border-stone-600 rounded-lg px-4 py-3 text-stone-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
                  {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Verificar'}
                </button>
                <button type="button" onClick={() => goTo('login')} className="w-full text-stone-500 hover:text-stone-400 text-xs transition-colors">
                  Voltar ao login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
