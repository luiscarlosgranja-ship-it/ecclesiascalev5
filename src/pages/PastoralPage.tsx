import { useState, useEffect } from 'react';
import PastoralCabinetSchedules from '../components/PastoralCabinetSchedules';
import { Plus, Edit, Trash2, CalendarClock, Clock, User, FileText, CheckCircle, XCircle, RefreshCw, Loader2, KeyRound, Shield, ShieldCheck, Calendar } from 'lucide-react';
import { Card, Button, Modal, Input, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, PastoralAppointment } from '../types';
import { isSuperAdmin, isAdmin } from '../utils/permissions';

interface Props { user: AuthUser; }

type Tab = 'upcoming' | 'history' | 'activation' | 'cabinet';

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
  const [tab, setTab] = useState<Tab>('upcoming');
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

  // ─── Ativação ────────────────────────────────────────────────────────────────
  const [activationKey, setActivationKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');
  const [isActivated, setIsActivated] = useState(false);

  // Verifica se já está ativado ao montar
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

  const history = (appointments || []).filter(a =>
    a.status === 'Realizado' || a.status === 'Cancelado'
  ).sort((a, b) => b.date.localeCompare(a.date));

  const list = tab === 'upcoming' ? upcoming : history;

  function openNew() {
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-stone-100">Atendimento Pastoral</h1>
        <Button onClick={openNew} size="sm"><Plus size={16} /> Novo Agendamento</Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('upcoming')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'upcoming' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <CalendarClock size={14} /> Agendamentos
          <span className="text-xs opacity-60">({upcoming.length})</span>
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <FileText size={14} /> Histórico
          <span className="text-xs opacity-60">({history.length})</span>
        </button>
        <button onClick={() => setTab('cabinet')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'cabinet' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <Calendar size={14} /> Gabinete Pastoral
        </button>
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-amber-500" size={24} />
          </div>
        ) : (tab === 'upcoming' || tab === 'history') && (
          <div className="divide-y divide-stone-700">
            {list.length === 0 ? (
              <div className="px-6 py-8 text-center text-stone-500 text-sm">
                {tab === 'upcoming' ? 'Nenhum agendamento pendente' : 'Nenhum agendamento no histórico'}
              </div>
            ) : (
              list.map(a => (
                <div key={a.id} className="px-6 py-4 hover:bg-stone-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-stone-200">{a.name}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} /> {formatDate(a.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {a.time}
                        </span>
                        <Badge color={STATUS_COLOR[a.status] || 'gray'}>{a.status}</Badge>
                      </div>
                      {a.notes && <p className="text-xs text-stone-500 mt-2">{a.notes}</p>}
                    </div>
                    {tab === 'upcoming' && (
                      <div className="flex items-center gap-2">
                        {isSuperAdmin(user) || isAdmin(user) ? (
                          <>
                            <button onClick={() => openEdit(a)} title="Editar"
                              className="text-stone-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <Edit size={15} />
                            </button>
                            <button onClick={() => { setRescheduleTarget(a); setRescheduleModal(true); }} title="Reagendar"
                              className="text-stone-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <RefreshCw size={15} />
                            </button>
                            <button onClick={() => markDone(a)} title="Marcar como Realizado"
                              className="text-stone-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                            <button onClick={() => cancelAppointment(a)} title="Cancelar"
                              className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <XCircle size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => markDone(a)} title="Marcar como Realizado"
                              className="text-stone-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                            <button onClick={() => cancelAppointment(a)} title="Cancelar"
                              className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                        <button onClick={() => { setDeleteTarget(a); setDeleteModal(true); }} title="Excluir"
                          className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* ─── Aba: Gabinete Pastoral ─────────────────────────────────────────── */}
      {tab === 'cabinet' && (
        <PastoralCabinetSchedules />
      )}

      {/* ─── Aba: Ativar Sistema ─────────────────────────────────────────────────── */}
      {tab === 'activation' && (
        <div className="max-w-md space-y-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 space-y-5">

            {/* Status atual */}
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

            {/* Formulário de ativação */}
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

            {/* Instrução */}
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
    </div>
  );
}
