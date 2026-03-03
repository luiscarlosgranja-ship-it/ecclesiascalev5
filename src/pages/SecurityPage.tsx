import { useState } from 'react';
import { Key, Shield, RefreshCw, Copy, Check } from 'lucide-react';
import { Card, Button, Input, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, ActivationCode } from '../types';
import { isSuperAdmin, isAdmin } from '../utils/permissions';

interface Props { user: AuthUser; initialTab?: 'activation' | 'reset' | 'activate'; hideTabs?: boolean; }

export default function SecurityPage({ user, initialTab, hideTabs }: Props) {
  const defaultTab = initialTab || (isSuperAdmin(user.role) ? 'activation' : 'activate');
  const [tab, setTab] = useState<'activation' | 'reset' | 'activate'>(defaultTab);
  const [institution, setInstitution] = useState('');
  const [expiryDays, setExpiryDays] = useState('365');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [resetting, setResetting] = useState(false);

  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');

  const { data: codes, refetch: refetchCodes } = useApi<ActivationCode[]>(isSuperAdmin(user.role) ? '/activation-codes' : null);

  async function generateCode() {
    if (!institution.trim()) return;
    setGenerating(true);
    try {
      const res = await api.post<{ code: string }>('/activation-codes', { institution, expiry_days: Number(expiryDays) });
      setGeneratedCode(res.code);
      refetchCodes();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao gerar');
    } finally { setGenerating(false); }
  }

  function copyCode() {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function resetPassword() {
    if (!resetEmail || !newPw) return;
    setResetting(true);
    try {
      await api.post('/users/reset-password', { email: resetEmail, new_password: newPw });
      alert('Senha redefinida com sucesso!');
      setResetEmail(''); setNewPw('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    } finally { setResetting(false); }
  }

  async function activateSystem() {
    if (!activationKey.trim()) return;
    setActivating(true); setActivateMsg('');
    try {
      await api.post('/activation-codes/activate', { code: activationKey });
      setActivateMsg('✅ Sistema ativado com sucesso!');
      setActivationKey('');
    } catch (e) {
      setActivateMsg('❌ ' + (e instanceof Error ? e.message : 'Código inválido'));
    } finally { setActivating(false); }
  }

  const TABS = [
    ...(isSuperAdmin(user.role) ? [{ id: 'activation', label: 'Gerador de Chaves' }] : []),
    { id: 'activate', label: 'Ativar Sistema' },
    ...(isAdmin(user.role) ? [{ id: 'reset', label: 'Reset de Senha' }] : []),
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-stone-100">
        {hideTabs
          ? tab === 'reset'       ? 'Reset de Senha'
          : tab === 'activate'    ? 'Ativar Sistema'
          : 'Gerador de Chaves'
          : 'Segurança'}
      </h1>

      {!hideTabs && <div className="flex border-b border-stone-700">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            {t.label}
          </button>
        ))}
      </div>}

      {/* Activation Code Generator — SuperAdmin only */}
      {tab === 'activation' && isSuperAdmin(user.role) && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="text-stone-200 font-semibold mb-4 flex items-center gap-2"><Key size={16} className="text-amber-400" /> Gerar Nova Chave de Ativação</h3>
            <div className="space-y-4">
              <Input label="Nome da Instituição *" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Ex: Igreja Batista Central" />
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Validade</label>
                <select value={expiryDays} onChange={e => setExpiryDays(e.target.value)}
                  className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
                  <option value="7">7 dias (teste)</option>
                  <option value="30">30 dias</option>
                  <option value="90">90 dias</option>
                  <option value="180">180 dias</option>
                  <option value="365">1 ano</option>
                  <option value="0">Sem expiração</option>
                </select>
              </div>
              <Button onClick={generateCode} loading={generating}><RefreshCw size={15} /> Gerar Chave</Button>

              {generatedCode && (
                <div className="bg-stone-800 border border-amber-600/40 rounded-xl p-4">
                  <p className="text-amber-300 text-xs mb-2 font-medium">Chave gerada:</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 text-amber-400 font-mono text-sm break-all">{generatedCode}</code>
                    <button onClick={copyCode} className="text-stone-400 hover:text-stone-200 transition-colors flex-shrink-0">
                      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Codes list */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-stone-700">
              <h3 className="text-stone-200 font-medium text-sm">Chaves Geradas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-700 bg-stone-800/50">
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Código</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Instituição</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Criado em</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Expira</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(codes || []).map(c => (
                    <tr key={c.code} className="border-b border-stone-800">
                      <td className="p-3 text-amber-400 font-mono text-xs">{c.code.slice(0, 12)}…</td>
                      <td className="p-3 text-stone-300 text-xs">{c.institution || '—'}</td>
                      <td className="p-3 text-stone-400 text-xs">{c.created_at?.slice(0, 10)}</td>
                      <td className="p-3 text-stone-400 text-xs">{c.expires_at?.slice(0, 10) || '—'}</td>
                      <td className="p-3"><Badge label={c.is_used ? 'Utilizada' : 'Disponível'} color={c.is_used ? 'gray' : 'green'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(codes || []).length === 0 && <p className="text-center text-stone-500 text-sm py-8">Nenhuma chave gerada</p>}
            </div>
          </Card>
        </div>
      )}

      {/* Activate System */}
      {tab === 'activate' && (
        <Card className="p-5 max-w-md">
          <h3 className="text-stone-200 font-semibold mb-4 flex items-center gap-2"><Shield size={16} className="text-amber-400" /> Ativar Sistema</h3>
          <div className="space-y-4">
            <Input
              label="Chave de Ativação *"
              value={activationKey}
              onChange={e => setActivationKey(e.target.value)}
              placeholder="Cole a chave recebida aqui..."
            />
            {activateMsg && (
              <p className={`text-sm ${activateMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{activateMsg}</p>
            )}
            <Button onClick={activateSystem} loading={activating}>Ativar</Button>
          </div>
        </Card>
      )}

      {/* Reset Password */}
      {tab === 'reset' && isAdmin(user.role) && (
        <Card className="p-5 max-w-md">
          <h3 className="text-stone-200 font-semibold mb-4 flex items-center gap-2"><Key size={16} className="text-amber-400" /> Reset de Senha</h3>
          <div className="space-y-4">
            <Input label="E-mail do usuário" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="usuario@email.com" />
            <Input label="Nova Senha" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <Button onClick={resetPassword} loading={resetting}>Redefinir Senha</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
