import { useState, useEffect } from 'react';
import { Database, Download, Mail, Save, Send, CheckCircle } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';

interface Props { user: AuthUser; }
type Tab = 'backup' | 'email-config';

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

  // ─── Configuração de e-mail padrão (salvo por usuário via settings) ───────────
  const [configEmail, setConfigEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);

  // Carrega e-mail configurado do usuário ao montar
  useEffect(() => {
    api.get<{ value: string }>(`/settings/backup-email?user_id=${user.id}`)
      .then(res => { if (res?.value) setConfigEmail(res.value); })
      .catch(() => {});
  }, [user.id]);

  async function doBackup() {
    setLoading(true); setMessage(''); setBackupDone(false);
    try {
      const res = await api.post<{ url?: string; message: string }>('/backup', {});
      setMessage(res.message || 'Backup realizado com sucesso!');
      setBackupDone(true);
      setSendEmail(configEmail);
      setSendMsg('');
      setEmailModal(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro ao realizar backup');
    } finally { setLoading(false); }
  }

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

  async function saveEmailConfig() {
    if (!configEmail.trim()) return;
    setSavingEmail(true); setEmailSaved(false);
    try {
      await api.post('/settings/backup-email', { user_id: user.id, email: configEmail.trim() });
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSavingEmail(false); }
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
        </button>
      </div>

      {/* ─── Aba: Fazer Backup ──────────────────────────────────────────────────── */}
      {tab === 'backup' && (
        <Card className="p-6 max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <Database className="text-amber-400" size={24} />
            <div>
              <p className="text-stone-200 font-medium">Backup de Dados</p>
              <p className="text-stone-500 text-xs mt-0.5">Salva todas as escalas, membros e configurações</p>
            </div>
          </div>

          {configEmail && (
            <div className="mb-4 flex items-center gap-2 bg-stone-800/60 border border-stone-700 rounded-lg px-3 py-2">
              <Mail size={13} className="text-amber-400 flex-shrink-0" />
              <p className="text-stone-400 text-xs">
                E-mail padrão configurado: <span className="text-amber-300">{configEmail}</span>
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
              <Button variant="secondary" onClick={() => { setSendEmail(configEmail); setSendMsg(''); setEmailModal(true); }}>
                <Send size={16} /> Enviar por E-mail
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ─── Aba: Configuração de E-mail ────────────────────────────────────────── */}
      {tab === 'email-config' && (
        <Card className="p-6 max-w-md">
          <div className="flex items-center gap-3 mb-5">
            <Mail className="text-amber-400" size={24} />
            <div>
              <p className="text-stone-200 font-medium">E-mail para Receber Backup</p>
              <p className="text-stone-500 text-xs mt-0.5">
                Configure o e-mail que será pré-preenchido ao enviar backups
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <Input
              label="Seu e-mail *"
              type="email"
              value={configEmail}
              onChange={e => setConfigEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
            />
            <p className="text-stone-500 text-xs">
              Será pré-preenchido automaticamente no modal de envio após cada backup. Você pode alterá-lo na hora.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={saveEmailConfig} loading={savingEmail}>
                <Save size={15} /> Salvar E-mail
              </Button>
              {emailSaved && (
                <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                  <CheckCircle size={14} /> Salvo!
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Modal: Enviar Backup por E-mail ─────────────────────────────────────── */}
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="📦 Enviar Backup por E-mail" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Backup gerado com sucesso! Para qual e-mail deseja enviar?
          </p>
          <Input
            label="E-mail destinatário *"
            type="email"
            value={sendEmail}
            onChange={e => setSendEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
          />
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
