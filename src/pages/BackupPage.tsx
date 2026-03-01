import { useState, useEffect } from 'react';
import {
  Database, Download, Mail, Save, Send, CheckCircle,
  Settings, Eye, EyeOff, AlertTriangle, TestTube,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';
import { isAdmin } from '../utils/permissions';

interface Props { user: AuthUser; }
type Tab = 'backup' | 'email-config';

interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
}

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

  // ─── Teste de SMTP ────────────────────────────────────────────────────────────
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  // ─── Carregar dados ao montar ─────────────────────────────────────────────────
  useEffect(() => {
    // E-mail destino do próprio usuário
    api.get<{ value: string }>(`/settings/backup-email?user_id=${user.id}`)
      .then(res => { if (res?.value) { setMyEmail(res.value); setSendEmail(res.value); } })
      .catch(() => {});

    // SMTP (somente admin carrega)
    if (isAdmin(user.role)) {
      api.get<SmtpConfig>('/settings/smtp')
        .then(res => {
          if (res) {
            setSmtp(res);
            setSmtpConfigured(!!(res.host && res.user));
          }
        })
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
      setSendEmail(myEmail);
      setSendMsg('');
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
      setSendMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao enviar. Verifique as configurações SMTP.'));
    } finally { setSending(false); }
  }

  // ─── Salvar e-mail destino do usuário ─────────────────────────────────────────
  async function saveMyEmail() {
    if (!myEmail.trim()) return;
    setSavingMyEmail(true); setMyEmailSaved(false);
    try {
      await api.post('/settings/backup-email', { user_id: user.id, email: myEmail.trim() });
      setMyEmailSaved(true);
      setSendEmail(myEmail.trim());
      setTimeout(() => setMyEmailSaved(false), 2500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSavingMyEmail(false); }
  }

  // ─── Salvar SMTP ──────────────────────────────────────────────────────────────
  async function saveSmtp() {
    if (!smtp.host || !smtp.user) { setSmtpError('Host e e-mail são obrigatórios'); return; }
    setSavingSmtp(true); setSmtpSaved(false); setSmtpError('');
    try {
      await api.post('/settings/smtp', smtp);
      setSmtpSaved(true);
      setSmtpConfigured(true);
      setTimeout(() => setSmtpSaved(false), 2500);
    } catch (e) {
      setSmtpError(e instanceof Error ? e.message : 'Erro ao salvar SMTP');
    } finally { setSavingSmtp(false); }
  }

  // ─── Testar SMTP ──────────────────────────────────────────────────────────────
  async function testSmtp() {
    if (!testEmail.trim()) { setTestMsg('Informe um e-mail para teste'); return; }
    setTesting(true); setTestMsg('');
    try {
      await api.post('/backup/send-email', { email: testEmail.trim() });
      setTestMsg('✅ E-mail de teste enviado com sucesso!');
    } catch (e) {
      setTestMsg('❌ Falha: ' + (e instanceof Error ? e.message : 'Verifique as configurações SMTP'));
    } finally { setTesting(false); }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-stone-100">Backup</h1>

      {/* Tabs */}
      <div className="flex border-b border-stone-700">
        <button
          onClick={() => setTab('backup')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'backup' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
        >
          <Database size={14} /> Fazer Backup
        </button>
        <button
          onClick={() => setTab('email-config')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'email-config' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
        >
          <Mail size={14} /> Config. E-mail
          {/* Alerta se SMTP não configurado */}
          {isAdmin(user.role) && !smtpConfigured && (
            <AlertTriangle size={13} className="text-amber-400" />
          )}
        </button>
      </div>

      {/* ─── Aba: Fazer Backup ──────────────────────────────────────────────────── */}
      {tab === 'backup' && (
        <div className="space-y-4 max-w-md">
          {/* Aviso se SMTP não configurado (admin) */}
          {isAdmin(user.role) && !smtpConfigured && (
            <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/50 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-amber-300 text-xs">
                O envio por e-mail requer configuração SMTP.{' '}
                <button onClick={() => setTab('email-config')} className="underline font-medium">
                  Configurar agora
                </button>
              </p>
            </div>
          )}

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Database className="text-amber-400" size={24} />
              <div>
                <p className="text-stone-200 font-medium">Backup de Dados</p>
                <p className="text-stone-500 text-xs mt-0.5">Salva todas as escalas, membros e configurações</p>
              </div>
            </div>

            {myEmail && (
              <div className="mb-4 flex items-center gap-2 bg-stone-800/60 border border-stone-700 rounded-lg px-3 py-2">
                <Mail size={13} className="text-amber-400 flex-shrink-0" />
                <p className="text-stone-400 text-xs">
                  E-mail padrão: <span className="text-amber-300">{myEmail}</span>
                </p>
              </div>
            )}

            {message && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm border ${message.includes('sucesso') ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
                {message}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button onClick={doBackup} loading={loading}>
                <Download size={16} /> Realizar Backup
              </Button>
              {backupDone && (
                <Button variant="secondary" onClick={() => { setSendEmail(myEmail); setSendMsg(''); setEmailModal(true); }}>
                  <Send size={16} /> Enviar por E-mail
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Aba: Configuração de E-mail ────────────────────────────────────────── */}
      {tab === 'email-config' && (
        <div className="space-y-6 max-w-lg">

          {/* ── Seção 1: SMTP (apenas Admin/SuperAdmin) ── */}
          {isAdmin(user.role) && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-1">
                <Settings className="text-amber-400" size={20} />
                <p className="text-stone-200 font-semibold">Configuração SMTP</p>
                {smtpConfigured && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
                    <CheckCircle size={13} /> Configurado
                  </span>
                )}
              </div>
              <p className="text-stone-500 text-xs mb-5">
                Servidor de e-mail usado para enviar backups e recuperação de senha. Configure antes de usar.
              </p>

              <div className="space-y-4">
                {/* Preset rápido */}
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Servidor pré-configurado</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
                      { label: 'Outlook', host: 'smtp-mail.outlook.com', port: '587' },
                      { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587' },
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => setSmtp(s => ({ ...s, host: preset.host, port: preset.port }))}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${smtp.host === preset.host ? 'bg-amber-600/20 border-amber-600/40 text-amber-300' : 'bg-stone-800 border-stone-600 text-stone-400 hover:border-stone-500'}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Input
                      label="Host SMTP *"
                      value={smtp.host}
                      onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <Input
                    label="Porta"
                    value={smtp.port}
                    onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))}
                    placeholder="587"
                  />
                </div>

                <Input
                  label="E-mail remetente *"
                  type="email"
                  value={smtp.user}
                  onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))}
                  placeholder="seuemail@gmail.com"
                />

                <div className="relative">
                  <Input
                    label="Senha / App Password *"
                    type={showPass ? 'text' : 'password'}
                    value={smtp.pass}
                    onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))}
                    placeholder={smtp.pass === '••••••••' ? '(mantida — deixe em branco para não alterar)' : 'Senha ou App Password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 bottom-2 text-stone-500 hover:text-stone-300 transition-colors"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Dica Gmail */}
                {smtp.host.includes('gmail') && (
                  <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 text-xs text-blue-300">
                    💡 Para Gmail, use uma <strong>App Password</strong> (não sua senha normal).
                    Acesse: Conta Google → Segurança → Verificação em duas etapas → Senhas de app.
                  </div>
                )}

                {smtpError && <p className="text-red-400 text-xs">{smtpError}</p>}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={saveSmtp} loading={savingSmtp}>
                    <Save size={15} /> Salvar SMTP
                  </Button>
                  {smtpSaved && (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                      <CheckCircle size={14} /> Salvo!
                    </span>
                  )}
                </div>

                {/* Testar SMTP */}
                {smtpConfigured && (
                  <div className="border-t border-stone-700 pt-4 mt-2">
                    <p className="text-stone-400 text-xs font-medium mb-2 flex items-center gap-2">
                      <TestTube size={13} /> Testar envio
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                        placeholder="email para teste..."
                        className="flex-1 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:border-amber-500"
                      />
                      <Button size="sm" variant="secondary" onClick={testSmtp} loading={testing}>
                        Testar
                      </Button>
                    </div>
                    {testMsg && (
                      <p className={`text-xs mt-2 ${testMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {testMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── Seção 2: E-mail destino (todos os usuários com acesso) ── */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <Mail className="text-amber-400" size={20} />
              <p className="text-stone-200 font-semibold">Meu E-mail para Backup</p>
            </div>
            <p className="text-stone-500 text-xs mb-5">
              Será pré-preenchido automaticamente no modal de envio. Você pode alterá-lo na hora.
            </p>

            <div className="space-y-4">
              <Input
                label="Seu e-mail *"
                type="email"
                value={myEmail}
                onChange={e => setMyEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
              />
              <div className="flex items-center gap-3">
                <Button onClick={saveMyEmail} loading={savingMyEmail}>
                  <Save size={15} /> Salvar E-mail
                </Button>
                {myEmailSaved && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle size={14} /> Salvo!
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Aviso para não-admins sobre SMTP */}
          {!isAdmin(user.role) && (
            <div className="flex items-start gap-3 bg-stone-800/60 border border-stone-700 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-stone-500 mt-0.5 flex-shrink-0" />
              <p className="text-stone-500 text-xs">
                A configuração do servidor de e-mail (SMTP) é feita por um Administrador do sistema.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal: Enviar Backup por E-mail ─────────────────────────────────────── */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="📦 Enviar Backup por E-mail" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Backup gerado! Confirme o e-mail para envio:
          </p>
          <Input
            label="E-mail destinatário *"
            type="email"
            value={sendEmail}
            onChange={e => setSendEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
          />
          {!smtpConfigured && isAdmin(user.role) && (
            <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-amber-400" />
              <p className="text-amber-300 text-xs">SMTP não configurado. O envio pode falhar.</p>
            </div>
          )}
          {sendMsg && (
            <p className={`text-sm ${sendMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
              {sendMsg}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setEmailModal(false)}>Fechar</Button>
            <Button onClick={sendBackupEmail} loading={sending}>
              <Send size={15} /> Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
