import { useState, useEffect, useRef } from 'react';
import {
  Database, Download, Mail, Save, Send, CheckCircle,
  Settings, Eye, EyeOff, AlertTriangle, Upload, RotateCcw,
  CheckSquare, XCircle, Link, Link2Off, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';
import { isAdmin } from '../utils/permissions';

interface Props { user: AuthUser; }
type Tab = 'backup' | 'restore' | 'email-config';

interface SmtpConfig { host: string; port: string; user: string; pass: string; configured?: boolean; }
interface RestoreResult { table: string; status: 'ok' | 'error' | 'skipped'; count: number; }
interface GmailStatus { connected: boolean; email: string | null; }

export default function BackupPage({ user }: Props) {
  const [tab, setTab] = useState<Tab>('backup');

  // ─── Backup ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backupDone, setBackupDone] = useState(false);

  // ─── Modal de envio por e-mail ────────────────────────────────────────────────
  const [emailModal, setEmailModal] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');

  // ─── E-mail destino padrão do usuário ────────────────────────────────────────
  const [myEmail, setMyEmail] = useState('');
  const [savingMyEmail, setSavingMyEmail] = useState(false);
  const [myEmailSaved, setMyEmailSaved] = useState(false);

  // ─── SMTP (somente Admin/SuperAdmin) ─────────────────────────────────────────
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: '', port: '587', user: '', pass: '' });
  const [showPass, setShowPass] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpError, setSmtpError] = useState('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  // ─── Gmail OAuth2 ─────────────────────────────────────────────────────────────
  const [gmail, setGmail] = useState<GmailStatus>({ connected: false, email: null });
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailMsg, setGmailMsg] = useState('');
  const [showSmtpFallback, setShowSmtpFallback] = useState(false);

  // ─── Restauração ─────────────────────────────────────────────────────────────
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<any>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, number>>({});
  const [restoreConfirmModal, setRestoreConfirmModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResults, setRestoreResults] = useState<RestoreResult[] | null>(null);
  const [restoreMsg, setRestoreMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Carregar dados ao montar ─────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ value: string }>(`/settings/backup-email?user_id=${user.id}`)
      .then(res => { if (res?.value) { setMyEmail(res.value); setSendEmail(res.value); } })
      .catch(() => {});

    if (isAdmin(user.role)) {
      api.get<SmtpConfig & { configured?: boolean }>('/settings/smtp')
        .then(res => {
          if (res) {
            setSmtp(res);
            // ✅ usa flag "configured" retornada pelo servidor (host+user+pass presentes)
            setSmtpConfigured(res.configured ?? !!(res.host && res.user));
          }
        })
        .catch(() => {});
      // Carrega status Gmail OAuth2
      api.get<GmailStatus>('/settings/gmail/status')
        .then(res => { if (res) setGmail(res); })
        .catch(() => {});
    }
  }, [user.id, user.role]);

  // ─── Fazer Backup ─────────────────────────────────────────────────────────────
  async function doBackup() {
    setLoading(true); setMessage(''); setBackupDone(false);
    try {
      const res = await api.post<{ message: string }>('/backup', {});
      setMessage(res.message || 'Backup realizado com sucesso!');
      setBackupDone(true);
      setSendEmail(myEmail); setSendMsg('');
      setEmailModal(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro ao realizar backup');
    } finally { setLoading(false); }
  }

  // ─── Enviar Backup por E-mail ─────────────────────────────────────────────────
  async function sendBackupEmail() {
    if (!sendEmail.trim()) { setSendMsg('Informe um e-mail'); return; }
    setSending(true); setSendMsg('');
    try {
      await api.post('/backup/send-email', { email: sendEmail.trim() });
      setSendMsg('✅ Backup enviado com sucesso!');
      setTimeout(() => { setEmailModal(false); setSendMsg(''); }, 2000);
    } catch (e) {
      setSendMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao enviar'));
    } finally { setSending(false); }
  }

  // ─── Salvar e-mail destino ────────────────────────────────────────────────────
  async function saveMyEmail() {
    if (!myEmail.trim()) return;
    setSavingMyEmail(true); setMyEmailSaved(false);
    try {
      await api.post('/settings/backup-email', { user_id: user.id, email: myEmail.trim() });
      setMyEmailSaved(true); setSendEmail(myEmail.trim());
      setTimeout(() => setMyEmailSaved(false), 2500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSavingMyEmail(false); }
  }

  // ─── Conectar Gmail OAuth2 ────────────────────────────────────────────────────
  async function connectGmail() {
    setLoadingGmail(true); setGmailMsg('');
    try {
      const res = await api.get<{ url: string }>('/settings/gmail/auth');
      if (!res?.url) throw new Error('URL de autenticação não retornada');
      const popup = window.open(res.url, 'gmail_auth', 'width=500,height=600');
      // Escuta mensagem de sucesso da janela popup
      const handler = (e: MessageEvent) => {
        if (e.data === 'gmail_connected') {
          window.removeEventListener('message', handler);
          popup?.close();
          api.get<GmailStatus>('/settings/gmail/status')
            .then(s => { if (s) { setGmail(s); setGmailMsg('✅ Gmail conectado com sucesso!'); } })
            .catch(() => {});
        }
      };
      window.addEventListener('message', handler);
    } catch (e) {
      setGmailMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao conectar Gmail'));
    } finally { setLoadingGmail(false); }
  }

  async function disconnectGmail() {
    try {
      await api.delete('/settings/gmail');
      setGmail({ connected: false, email: null });
      setGmailMsg('Gmail desconectado.');
    } catch { setGmailMsg('Erro ao desconectar.'); }
  }

  // ─── Salvar SMTP ──────────────────────────────────────────────────────────────
  async function saveSmtp() {
    if (!smtp.host || !smtp.user) { setSmtpError('Host e e-mail são obrigatórios'); return; }
    setSavingSmtp(true); setSmtpSaved(false); setSmtpError('');
    try {
      await api.post('/settings/smtp', smtp);
      setSmtpSaved(true); setSmtpConfigured(true);
      setTimeout(() => setSmtpSaved(false), 2500);
    } catch (e) {
      setSmtpError(e instanceof Error ? e.message : 'Erro ao salvar SMTP');
    } finally { setSavingSmtp(false); }
  }

  // ─── Testar SMTP ──────────────────────────────────────────────────────────────
  async function testSmtp() {
    setTesting(true); setTestMsg('Verificando conexão SMTP...');
    try {
      // Usa verify() — verifica autenticação sem enviar e-mail
      const res = await api.post<{ message: string }>('/settings/smtp/test', {});
      setTestMsg(res.message || '✅ Conexão verificada!');
      // Se conexão ok e e-mail preenchido, envia e-mail de teste real
      if (testEmail.trim()) {
        setSendEmail(testEmail.trim());
        await api.post('/backup/send-email', { email: testEmail.trim() });
        setTestMsg('✅ Conexão verificada e e-mail de teste enviado para ' + testEmail.trim());
      }
    } catch (e) {
      setTestMsg('❌ ' + (e instanceof Error ? e.message : 'Falha na conexão SMTP'));
    } finally { setTesting(false); }
  }

  // ─── Carregar arquivo de backup ───────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreResults(null);
    setRestoreMsg('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setRestoreData(parsed);
        // Monta preview: tabela → quantidade de registros
        const preview: Record<string, number> = {};
        const tables = ['departments','ministries','sectors','cult_types','members','member_ministries','cults','scales','swaps','notifications'];
        tables.forEach(t => { if (Array.isArray(parsed[t])) preview[t] = parsed[t].length; });
        setRestorePreview(preview);
      } catch {
        setRestoreData(null);
        setRestorePreview({});
        setRestoreMsg('❌ Arquivo inválido. Certifique-se de que é um backup gerado pelo EcclesiaScale.');
      }
    };
    reader.readAsText(file);
  }

  // ─── Confirmar restauração ────────────────────────────────────────────────────
  async function confirmRestore() {
    if (!restoreData) return;
    setRestoring(true); setRestoreMsg('');
    try {
      const res = await api.post<{ message: string; results: RestoreResult[] }>('/backup/restore', {
        data: restoreData,
        confirm: true,
      });
      setRestoreResults(res.results);
      setRestoreMsg(res.message);
      setRestoreConfirmModal(false);
    } catch (e) {
      setRestoreMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao restaurar'));
    } finally { setRestoring(false); }
  }

  const TABLE_LABELS: Record<string, string> = {
    departments: 'Departamentos', ministries: 'Ministérios', sectors: 'Setores',
    cult_types: 'Tipos de Culto', members: 'Membros', member_ministries: 'Vínculos Ministérios',
    cults: 'Cultos', scales: 'Escalas', swaps: 'Trocas', notifications: 'Notificações',
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-stone-100">Backup</h1>

      {/* Tabs */}
      <div className="flex border-b border-stone-700 flex-wrap">
        {[
          { id: 'backup', label: 'Fazer Backup', icon: <Database size={14} /> },
          ...(isAdmin(user.role) ? [{ id: 'restore', label: 'Restaurar', icon: <RotateCcw size={14} /> }] : []),
          { id: 'email-config', label: 'Config. E-mail', icon: <Mail size={14} />, alert: isAdmin(user.role) && !smtpConfigured && !gmail.connected },
        ].map((t: any) => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            {t.icon} {t.label}
            {t.alert && <AlertTriangle size={13} className="text-amber-400" />}
          </button>
        ))}
      </div>

      {/* ─── Aba: Fazer Backup ──────────────────────────────────────────────────── */}
      {tab === 'backup' && (
        <div className="space-y-4 max-w-md">
          {isAdmin(user.role) && !smtpConfigured && !gmail.connected && (
            <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/50 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-amber-300 text-xs">
                SMTP não configurado — o envio por e-mail não funcionará.{' '}
                <button onClick={() => setTab('email-config')} className="underline font-medium">Configurar agora</button>
              </p>
            </div>
          )}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Database className="text-amber-400" size={24} />
              <div>
                <p className="text-stone-200 font-medium">Backup de Dados</p>
                <p className="text-stone-500 text-xs mt-0.5">Salva escalas, membros, cultos e configurações</p>
              </div>
            </div>
            {myEmail && (
              <div className="mb-4 flex items-center gap-2 bg-stone-800/60 border border-stone-700 rounded-lg px-3 py-2">
                <Mail size={13} className="text-amber-400 flex-shrink-0" />
                <p className="text-stone-400 text-xs">E-mail padrão: <span className="text-amber-300">{myEmail}</span></p>
              </div>
            )}
            {message && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm border ${message.includes('sucesso') ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
                {message}
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <Button onClick={doBackup} loading={loading}><Download size={16} /> Realizar Backup</Button>
              {backupDone && (
                <Button variant="secondary" onClick={() => { setSendEmail(myEmail); setSendMsg(''); setEmailModal(true); }}>
                  <Send size={16} /> Enviar por E-mail
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Aba: Restaurar ─────────────────────────────────────────────────────── */}
      {tab === 'restore' && isAdmin(user.role) && (
        <div className="space-y-4 max-w-lg">
          <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3">
            <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-300 text-xs">
              <strong>Atenção:</strong> A restauração sobrescreve os dados existentes. Esta ação não pode ser desfeita. Faça um backup antes de prosseguir.
            </p>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <RotateCcw className="text-amber-400" size={22} />
              <div>
                <p className="text-stone-200 font-medium">Restaurar Backup</p>
                <p className="text-stone-500 text-xs mt-0.5">Selecione um arquivo .json gerado pelo EcclesiaScale</p>
              </div>
            </div>

            {/* Upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-stone-600 hover:border-amber-500 rounded-xl p-8 text-center cursor-pointer transition-colors group"
            >
              <Upload size={28} className="mx-auto mb-3 text-stone-500 group-hover:text-amber-400 transition-colors" />
              <p className="text-stone-400 text-sm">
                {restoreFile ? <span className="text-amber-300 font-medium">{restoreFile.name}</span> : 'Clique para selecionar o arquivo de backup'}
              </p>
              <p className="text-stone-600 text-xs mt-1">Formato aceito: .json</p>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Preview do backup */}
            {Object.keys(restorePreview).length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-stone-300 text-xs font-medium uppercase tracking-wide">Conteúdo do backup:</p>
                <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-3">
                  {restoreFile && restoreData?.exported_at && (
                    <p className="text-stone-500 text-xs mb-3">
                      Gerado em: <span className="text-stone-400">{new Date(restoreData.exported_at).toLocaleString('pt-BR')}</span>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(restorePreview).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between bg-stone-800 rounded-lg px-2.5 py-1.5">
                        <span className="text-stone-400 text-xs">{TABLE_LABELS[table] || table}</span>
                        <span className="text-amber-300 text-xs font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setRestoreConfirmModal(true)}
                  className="mt-2"
                >
                  <RotateCcw size={15} /> Restaurar este backup
                </Button>
              </div>
            )}

            {restoreMsg && (
              <div className={`mt-4 px-3 py-2 rounded-lg text-sm border ${restoreMsg.includes('concluída') || restoreMsg.includes('✅') ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
                {restoreMsg}
              </div>
            )}

            {/* Resultado da restauração */}
            {restoreResults && (
              <div className="mt-4 space-y-2">
                <p className="text-stone-300 text-xs font-medium uppercase tracking-wide">Resultado:</p>
                <div className="space-y-1">
                  {restoreResults.map(r => (
                    <div key={r.table} className="flex items-center gap-2 text-xs">
                      {r.status === 'ok'
                        ? <CheckSquare size={13} className="text-emerald-400 flex-shrink-0" />
                        : r.status === 'error'
                        ? <XCircle size={13} className="text-red-400 flex-shrink-0" />
                        : <CheckSquare size={13} className="text-stone-600 flex-shrink-0" />}
                      <span className={r.status === 'ok' ? 'text-stone-300' : r.status === 'error' ? 'text-red-400' : 'text-stone-600'}>
                        {TABLE_LABELS[r.table] || r.table}
                        {r.status === 'ok' && <span className="text-stone-500 ml-1">({r.count} registros)</span>}
                        {r.status === 'skipped' && <span className="text-stone-600 ml-1">(vazio)</span>}
                        {r.status === 'error' && <span className="ml-1">— erro</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Aba: Configuração de E-mail ────────────────────────────────────────── */}
      {tab === 'email-config' && (
        <div className="space-y-6 max-w-lg">

          {/* Config. E-mail — apenas Admin */}
          {isAdmin(user.role) && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-1">
                <Mail className="text-amber-400" size={20} />
                <p className="text-stone-200 font-semibold">Configuração de E-mail</p>
                {(gmail.connected || smtpConfigured) && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
                    <CheckCircle size={13} /> Configurado
                  </span>
                )}
              </div>
              <p className="text-stone-500 text-xs mb-5">Necessário para envio de backups e recuperação de senha.</p>

              {/* Opção 1: Gmail OAuth2 */}
              <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/><path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/><path fill="#4A90D9" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/><path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/></svg>
                  </div>
                  <div>
                    <p className="text-stone-200 text-sm font-medium">Conectar via Gmail</p>
                    <p className="text-stone-500 text-xs">Recomendado — funciona no Railway sem bloqueios</p>
                  </div>
                  {gmail.connected && (
                    <span className="ml-auto flex items-center gap-1 bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-2 py-1 text-emerald-400 text-xs">
                      <CheckCircle size={11} /> Conectado
                    </span>
                  )}
                </div>
                {gmail.connected && gmail.email ? (
                  <div className="flex items-center justify-between bg-stone-900 rounded-lg px-3 py-2">
                    <span className="text-amber-300 text-sm">{gmail.email}</span>
                    <button onClick={disconnectGmail} className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs transition-colors">
                      <Link2Off size={13} /> Desconectar
                    </button>
                  </div>
                ) : (
                  <Button onClick={connectGmail} loading={loadingGmail} size="sm">
                    <Link size={14} /> Conectar Gmail
                  </Button>
                )}
                {gmailMsg && (
                  <p className={`text-xs mt-2 ${gmailMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{gmailMsg}</p>
                )}
              </div>

              {/* Opção 2: SMTP manual */}
              <button
                onClick={() => setShowSmtpFallback(v => !v)}
                className="flex items-center gap-2 text-stone-500 hover:text-stone-300 text-xs transition-colors w-full mb-2"
              >
                {showSmtpFallback ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Configuração SMTP manual (avançado)
              </button>

              {showSmtpFallback && (
                <div className="space-y-4 border border-stone-700 rounded-xl p-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
                      { label: 'Outlook', host: 'smtp-mail.outlook.com', port: '587' },
                      { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587' },
                    ].map(p => (
                      <button key={p.label} onClick={() => setSmtp(s => ({ ...s, host: p.host, port: p.port }))}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${smtp.host === p.host ? 'bg-amber-600/20 border-amber-600/40 text-amber-300' : 'bg-stone-800 border-stone-600 text-stone-400 hover:border-stone-500'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Input label="Host SMTP *" value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} placeholder="smtp.gmail.com" />
                    </div>
                    <Input label="Porta" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} placeholder="587" />
                  </div>
                  <Input label="E-mail remetente *" type="email" value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} placeholder="seuemail@gmail.com" />
                  <div className="relative">
                    <Input
                      label="Senha / App Password *"
                      type={showPass ? 'text' : 'password'}
                      value={smtp.pass}
                      onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))}
                      placeholder={smtp.pass === '••••••••' ? 'Deixe em branco para manter' : 'Senha ou App Password'}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 bottom-2 text-stone-500 hover:text-stone-300 transition-colors">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {smtpError && <p className="text-red-400 text-xs">{smtpError}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button onClick={saveSmtp} loading={savingSmtp}><Save size={15} /> Salvar SMTP</Button>
                    {smtpSaved && <span className="flex items-center gap-1.5 text-emerald-400 text-sm"><CheckCircle size={14} /> Salvo!</span>}
                  </div>
                </div>
              )}

              {/* Testar conexão */}
              {(gmail.connected || smtpConfigured) && (
                <div className="border-t border-stone-700 pt-4 mt-4">
                  <p className="text-stone-400 text-xs font-medium mb-2">Testar conexão e envio</p>
                  <p className="text-stone-600 text-xs mb-2">Deixe em branco para verificar só a conexão, ou preencha um e-mail para receber um teste.</p>
                  <div className="flex gap-2">
                    <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                      placeholder="e-mail para teste (opcional)..."
                      className="flex-1 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:border-amber-500" />
                    <Button size="sm" variant="secondary" onClick={testSmtp} loading={testing}>Testar</Button>
                  </div>
                  {testMsg && <p className={`text-xs mt-2 ${testMsg.startsWith('✅') ? 'text-emerald-400' : testMsg.includes('Verificando') ? 'text-amber-400' : 'text-red-400'}`}>{testMsg}</p>}
                </div>
              )}
            </Card>
          )}

          {/* E-mail destino — todos */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Mail className="text-amber-400" size={20} />
              <p className="text-stone-200 font-semibold">Meu E-mail para Backup</p>
            </div>
            <p className="text-stone-500 text-xs mb-5">Pré-preenchido automaticamente no modal de envio. Alterável na hora.</p>
            <div className="space-y-4">
              <Input label="Seu e-mail *" type="email" value={myEmail} onChange={e => setMyEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
              <div className="flex items-center gap-3">
                <Button onClick={saveMyEmail} loading={savingMyEmail}><Save size={15} /> Salvar E-mail</Button>
                {myEmailSaved && <span className="flex items-center gap-1.5 text-emerald-400 text-sm"><CheckCircle size={14} /> Salvo!</span>}
              </div>
            </div>
          </Card>

          {!isAdmin(user.role) && (
            <div className="flex items-start gap-3 bg-stone-800/60 border border-stone-700 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-stone-500 mt-0.5 flex-shrink-0" />
              <p className="text-stone-500 text-xs">A configuração SMTP é feita por um Administrador do sistema.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal: Enviar Backup por E-mail ─────────────────────────────────────── */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="📦 Enviar Backup por E-mail" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Backup gerado! Confirme o e-mail para envio:</p>
          <Input label="E-mail destinatário *" type="email" value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
          {isAdmin(user.role) && !smtpConfigured && !gmail.connected && (
            <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-amber-400" />
              <p className="text-amber-300 text-xs">SMTP não configurado. O envio irá falhar.</p>
            </div>
          )}
          {sendMsg && <p className={`text-sm ${sendMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{sendMsg}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setEmailModal(false)}>Fechar</Button>
            <Button onClick={sendBackupEmail} loading={sending}><Send size={15} /> Enviar</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Confirmar Restauração ────────────────────────────────────────── */}
      <Modal open={restoreConfirmModal} onClose={() => setRestoreConfirmModal(false)} title="⚠️ Confirmar Restauração" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4">
            <p className="text-red-300 text-sm font-medium mb-1">Esta ação não pode ser desfeita!</p>
            <p className="text-stone-400 text-xs">
              Todos os dados existentes serão sobrescritos pelos dados do arquivo <strong className="text-stone-300">{restoreFile?.name}</strong>.
            </p>
          </div>
          <p className="text-stone-400 text-sm">Tem certeza que deseja prosseguir com a restauração?</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRestoreConfirmModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmRestore} loading={restoring}>
              <RotateCcw size={15} /> Sim, restaurar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
