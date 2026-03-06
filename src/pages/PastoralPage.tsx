import { useState, useEffect, useRef } from 'react';
import PastoralCabinetSchedules, { type CabinetSchedulesRef } from '../components/PastoralCabinetSchedules';
import PastoralCabinetBooking from '../components/PastoralCabinetBooking';
import VolunteerCabinetBookings from '../components/VolunteerCabinetBookings';
import {
  Plus, Edit, Trash2, CalendarClock, Clock, User, FileText,
  CheckCircle, XCircle, RefreshCw, Loader2, KeyRound, Shield,
  ShieldCheck, Calendar, AlertTriangle, History,
} from 'lucide-react';
import { Card, Button, Modal, Input, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, PastoralAppointment } from '../types';
import { isSuperAdmin, isAdmin, isLeader } from '../utils/permissions';

interface Props { user: AuthUser; }

type Tab = 'cabinet' | 'history' | 'activation';

const STATUS_COLOR: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'gray'> = {
  'Agendado':   'blue',
  'Realizado':  'green',
  'Cancelado':  'red',
  'Reagendado': 'yellow',
};

const EMPTY_FORM: Partial<PastoralAppointment> = {
  name: '', date: '', time: '', notes: '', status: 'Agendado',
};

export default function PastoralPage({ user }: Props) {
  const { data: appointments, loading, refetch } = useApi<PastoralAppointment[]>('/pastoral');
  const cabinetRef = useRef<CabinetSchedulesRef>(null);
  const [tab, setTab] = useState<Tab>('cabinet');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<PastoralAppointment>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PastoralAppointment | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<PastoralAppointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // ─── Histórico: limpar tudo ───────────────────────────────────────────────────
  const [clearHistoryModal, setClearHistoryModal] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  // ─── Ativação ────────────────────────────────────────────────────────────────
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    api.get<{ isActive: boolean; isTrial: boolean }>('/settings/trial')
      .then(res => { if (res?.isActive && !res?.isTrial) setIsActivated(true); })
      .catch(() => {});
  }, []);

  async function activateSystem() {
    if (!activationKey.trim()) return;
    setActivating(true); setActivateMsg('');
    try {
      await api.post('/activation-codes/activate', { code: activationKey.trim() });
      setActivateMsg('✅ Sistema ativado com sucesso! Obrigado.');
      setIsActivated(true);
      setActivationKey('');
    } catch (e) {
      setActivateMsg('❌ ' + (e instanceof Error ? e.message : 'Chave inválida ou expirada'));
    } finally { setActivating(false); }
  }

  const today = new Date().toISOString().slice(0, 10);

  const upcoming = (appointments || []).filter(a =>
    a.status === 'Agendado' || a.status === 'Reagendado'
  ).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // Histórico: Realizados + Cancelados ordenados do mais recente ao mais antigo
  const history = (appointments || []).filter(a =>
    a.status === 'Realizado' || a.status === 'Cancelado'
  ).sort((a, b) => b.date.localeCompare(a.date));

  function openNew() {
    if (tab === 'cabinet') {
      cabinetRef.current?.openNew();
      return;
    }
    setEditing({ ...EMPTY_FORM, date: today });
    setError('');
    setModalOpen(true);
  }

  function openEdit(a: PastoralAppointment) {
    setEditing({ ...a });
    setError('');
    setModalOpen(true);
  }

  async function save() {
    if (!editing.name?.trim() || !editing.date || !editing.time) {
      setError('Nome, data e hora são obrigatórios');
      return;
    }
    setSaving(true); setError('');
    try {
      if (editing.id) {
        await api.put(`/pastoral/${editing.id}`, editing);
      } else {
        await api.post('/pastoral', editing);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function cancelAppointment(a: PastoralAppointment) {
    try {
      await api.put(`/pastoral/${a.id}`, { ...a, status: 'Cancelado' });
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao cancelar');
    }
  }

  async function markDone(a: PastoralAppointment) {
    try {
      await api.put(`/pastoral/${a.id}`, { ...a, status: 'Realizado' });
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/pastoral/${deleteTarget.id}`);
      setDeleteModal(false);
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  // ─── Limpar todo o histórico ──────────────────────────────────────────────────
  async function confirmClearHistory() {
    setClearingHistory(true);
    try {
      // Exclui cada item do histórico individualmente
      await Promise.all(history.map(a => api.delete(`/pastoral/${a.id}`)));
      setClearHistoryModal(false);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao limpar histórico');
    } finally { setClearingHistory(false); }
  }

  async function confirmReschedule() {
    if (!rescheduleTarget || !newDate || !newTime) return;
    setRescheduling(true);
    try {
      await api.put(`/pastoral/${rescheduleTarget.id}`, {
        ...rescheduleTarget,
        date: newDate,
        time: newTime,
        status: 'Reagendado',
      });
      setRescheduleModal(false);
      setRescheduleTarget(null);
      setNewDate(''); setNewTime('');
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao reagendar');
    } finally { setRescheduling(false); }
  }

  function formatDate(d: string) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  const canManage = isSuperAdmin(user.role) || isAdmin(user.role) || user.role === 'Secretaria';

  return (
    <div className="space-y-5">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-stone-100">Gabinete Pastoral</h1>
        {canManage && (
          <Button onClick={openNew} size="sm">
            <Plus size={16} /> {tab === 'cabinet' ? 'Adicionar Horário' : 'Novo Agendamento'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('cabinet')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'cabinet' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <Calendar size={14} /> Gabinete Pastoral
        </button>
        {canManage && (
          <button onClick={() => setTab('history')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            <History size={14} /> Histórico
            {history.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === 'history' ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-700 text-stone-400'}`}>
                {history.length}
              </span>
            )}
          </button>
        )}
        {!isActivated && (
          <button onClick={() => setTab('activation')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'activation' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            <KeyRound size={14} /> Ativar Sistema
          </button>
        )}
      </div>

      {/* ─── Aba: Gabinete Pastoral ─────────────────────────────────────────── */}
      {tab === 'cabinet' && (
        canManage
          ? <PastoralCabinetSchedules ref={cabinetRef} title="Disponibilidade do Gabinete" />
          : (
            <div className="space-y-5">
              {user.member_id && (
                <PastoralCabinetBooking
                  volunteerId={user.member_id}
                  volunteerName={user.name || user.email}
                  onBookingSuccess={() => {}}
                />
              )}
              {user.member_id && (
                <VolunteerCabinetBookings volunteerId={user.member_id} />
              )}
            </div>
          )
      )}

      {/* ─── Aba: Histórico ─────────────────────────────────────────────────── */}
      {tab === 'history' && canManage && (
        <div className="space-y-3">
          {/* Header do histórico com botão limpar */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-stone-300 font-semibold text-sm">Agendamentos Concluídos e Cancelados</p>
              <p className="text-stone-500 text-xs mt-0.5">
                {history.length === 0
                  ? 'Nenhum registro no histórico ainda'
                  : `${history.length} registro${history.length !== 1 ? 's' : ''} no histórico`}
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => setClearHistoryModal(true)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-900/10 hover:bg-red-900/20 border border-red-800/40 hover:border-red-700/60 px-3 py-1.5 rounded-lg transition-all"
              >
                <Trash2 size={13} /> Limpar Histórico
              </button>
            )}
          </div>

          <Card className="overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-amber-500" size={24} />
              </div>
            ) : history.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <History size={40} className="text-stone-700 mx-auto mb-3" />
                <p className="text-stone-500 text-sm font-medium">Nenhum agendamento no histórico</p>
                <p className="text-stone-600 text-xs mt-1">
                  Agendamentos concluídos ou cancelados aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-800">
                {history.map(a => (
                  <div key={a.id} className="px-5 py-4 hover:bg-stone-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Nome e status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-stone-200 text-sm">{a.name}</p>
                          <Badge color={STATUS_COLOR[a.status] || 'gray'}>{a.status}</Badge>
                          {(a as any).source === 'gabinete' && (
                            <span className="text-xs bg-blue-900/30 border border-blue-700/40 text-blue-300 px-2 py-0.5 rounded-full">
                              Via Gabinete Pastoral
                            </span>
                          )}
                        </div>

                        {/* Data e hora */}
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-stone-500">
                          <span className="flex items-center gap-1">
                            <CalendarClock size={11} /> {formatDate(a.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> {a.time}
                          </span>
                          {(a as any).created_by_name && (
                            <span className="flex items-center gap-1 text-amber-600/80">
                              <User size={11} /> Agendado por: {(a as any).created_by_name}
                            </span>
                          )}
                        </div>

                        {/* Observações */}
                        {a.notes && (
                          <p className="text-xs text-stone-500 mt-1.5 italic">"{a.notes}"</p>
                        )}
                      </div>

                      {/* Ação: excluir individualmente */}
                      <button
                        onClick={() => { setDeleteTarget(a); setDeleteModal(true); }}
                        title="Excluir do histórico"
                        className="flex-shrink-0 text-stone-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Aba: Ativar Sistema ─────────────────────────────────────────────────── */}
      {tab === 'activation' && (
        <div className="max-w-md space-y-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 space-y-5">
            {isActivated ? (
              <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3">
                <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-emerald-300 font-semibold text-sm">Sistema Ativado</p>
                  <p className="text-emerald-600 text-xs mt-0.5">Sua licença está ativa. Nenhuma ação necessária.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3">
                <Shield size={20} className="text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-amber-300 font-semibold text-sm">Período de Teste</p>
                  <p className="text-amber-600 text-xs mt-0.5">Insira a chave de ativação para liberar o acesso completo.</p>
                </div>
              </div>
            )}
            {!isActivated && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                    <KeyRound size={12} /> Chave de Ativação
                  </label>
                  <input
                    type="text"
                    value={activationKey}
                    onChange={e => setActivationKey(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && activateSystem()}
                    placeholder="Cole a chave recebida aqui..."
                    className="w-full bg-stone-800 border border-stone-600 rounded-xl px-4 py-3 text-stone-100 text-sm font-mono tracking-widest focus:outline-none focus:border-amber-500 placeholder-stone-600"
                  />
                </div>
                {activateMsg && (
                  <p className={`text-sm px-3 py-2 rounded-lg border ${
                    activateMsg.startsWith('✅')
                      ? 'text-emerald-300 bg-emerald-900/20 border-emerald-700/40'
                      : 'text-red-300 bg-red-900/20 border-red-700/40'
                  }`}>{activateMsg}</p>
                )}
                <Button onClick={activateSystem} loading={activating} disabled={!activationKey.trim()}>
                  <Shield size={15} /> Ativar Sistema
                </Button>
              </div>
            )}
            <p className="text-stone-600 text-xs border-t border-stone-800 pt-4">
              A chave de ativação é fornecida pelo administrador do sistema. Entre em contato caso não tenha recebido.
            </p>
          </div>
        </div>
      )}

      {/* Modal: Novo / Editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing.id ? 'Editar Agendamento' : 'Novo Agendamento'} size="md">
        <div className="space-y-4">
          <Input
            label="Nome *"
            value={editing.name || ''}
            onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
            placeholder="Nome da pessoa"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Data *</label>
              <input
                type="date"
                value={editing.date || ''}
                onChange={e => setEditing(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Hora *</label>
              <input
                type="time"
                value={editing.time || ''}
                onChange={e => setEditing(p => ({ ...p, time: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          {editing.id && (
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Status</label>
              <select
                value={editing.status || 'Agendado'}
                onChange={e => setEditing(p => ({ ...p, status: e.target.value as any }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="Agendado">Agendado</option>
                <option value="Reagendado">Reagendado</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Observação</label>
            <textarea
              value={editing.notes || ''}
              onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Motivo do atendimento, detalhes relevantes..."
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} loading={saving}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Reagendar */}
      <Modal open={rescheduleModal} onClose={() => setRescheduleModal(false)} title="Reagendar Atendimento" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Escolha a nova data e hora para <strong className="text-stone-200">{rescheduleTarget?.name}</strong>:</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Nova Data *</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Nova Hora *</label>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => setRescheduleModal(false)}>Cancelar</Button>
            <Button onClick={confirmReschedule} loading={rescheduling} disabled={!newDate || !newTime}>
              <RefreshCw size={14} /> Reagendar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirmar exclusão */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir Agendamento" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
            <p className="text-stone-200 text-sm">Deseja excluir o agendamento de <strong className="text-red-300">{deleteTarget?.name}</strong>?</p>
            <p className="text-stone-500 text-xs mt-1">Esta ação não pode ser desfeita.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Limpar todo o histórico */}
      <Modal open={clearHistoryModal} onClose={() => setClearHistoryModal(false)} title="Limpar Histórico" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-stone-200 text-sm font-semibold">Atenção: ação irreversível</p>
              <p className="text-stone-400 text-sm mt-1">
                Todos os <strong className="text-red-300">{history.length} registros</strong> do histórico
                (concluídos e cancelados) serão permanentemente excluídos.
              </p>
              <p className="text-stone-500 text-xs mt-2">Esta ação não pode ser desfeita.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setClearHistoryModal(false)} disabled={clearingHistory}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmClearHistory} loading={clearingHistory}>
              <Trash2 size={14} /> Limpar Tudo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
