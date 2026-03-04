import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Clock, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Card, Button, Modal, Badge } from '../components/ui';
import api from '../utils/api';
import type { PastoralCabinetSchedule } from '../types';

interface Props { title?: string; }
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
type Tab = 'available' | 'occupied' | 'history';

export default function PastoralCabinetSchedules({ title = 'Gerenciar Disponibilidade de Gabinete' }: Props) {
  const [schedules, setSchedules] = useState<PastoralCabinetSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('available');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PastoralCabinetSchedule | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [formData, setFormData] = useState({ date: '', time: '', duration_minutes: 60 });

  useEffect(() => { loadSchedules(); }, []);

  async function loadSchedules() {
    try {
      setLoading(true); setError('');
      const response = await api.get<PastoralCabinetSchedule[]>('/pastoral-cabinet/schedules');
      if (response) setSchedules(response.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar horários');
    } finally { setLoading(false); }
  }

  function openNew() {
    setFormData({ date: new Date().toISOString().slice(0, 10), time: '09:00', duration_minutes: 60 });
    setError(''); setModalOpen(true);
  }

  async function handleSave() {
    if (!formData.date || !formData.time) { setError('Data e hora são obrigatórios'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/pastoral-cabinet/schedules', { ...formData, is_available: true });
      setModalOpen(false); loadSchedules();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/pastoral-cabinet/schedules/${deleteTarget.id}`);
      setDeleteModal(false); setDeleteTarget(null); loadSchedules();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
      .toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const available = schedules.filter(s => s.date >= today && s.is_available);
  const occupied  = schedules.filter(s => s.date >= today && !s.is_available);
  const history   = schedules.filter(s => s.date < today);
  const tabList   = tab === 'available' ? available : tab === 'occupied' ? occupied : history;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-bold text-stone-100">{title}</h2>
        <Button onClick={openNew} size="sm"><Plus size={16} /> Adicionar Horário</Button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('available')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'available' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <CheckCircle size={14} /> Disponíveis <span className="text-xs opacity-60">({available.length})</span>
        </button>
        <button onClick={() => setTab('occupied')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'occupied' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <XCircle size={14} /> Ocupados <span className="text-xs opacity-60">({occupied.length})</span>
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <Calendar size={14} /> Histórico <span className="text-xs opacity-60">({history.length})</span>
        </button>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-amber-500" />
        </Card>
      ) : tabList.length === 0 ? (
        <Card className="text-center py-10">
          <Calendar size={36} className="mx-auto mb-3 text-stone-600" />
          <p className="text-stone-400 text-sm">
            {tab === 'available' ? 'Nenhum horário disponível' : tab === 'occupied' ? 'Nenhum horário ocupado' : 'Nenhum registro no histórico'}
          </p>
          {tab === 'available' && <p className="text-stone-500 text-xs mt-1">Clique em "+ Adicionar Horário" para criar novos horários</p>}
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {tabList.map(schedule => (
              <div key={schedule.id}
                className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${
                  tab === 'history' ? 'bg-stone-900/40 border-stone-700/30 opacity-60' :
                  tab === 'occupied' ? 'bg-stone-800/30 border-stone-700/50' :
                  'bg-stone-800/50 hover:bg-stone-800 border-stone-700/50 hover:border-stone-600'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className={tab === 'history' ? 'text-stone-600' : 'text-amber-400'} />
                    <p className={`text-sm font-medium ${tab === 'history' ? 'text-stone-500' : 'text-stone-200'}`}>
                      {formatDate(schedule.date)} às {schedule.time}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color={schedule.is_available ? 'green' : 'red'}>
                      {schedule.is_available ? 'Disponível' : 'Ocupado'}
                    </Badge>
                    <span className="text-xs text-stone-500">{schedule.duration_minutes} min</span>
                  </div>
                </div>
                {tab !== 'occupied' && (
                  <button onClick={() => { setDeleteTarget(schedule); setDeleteModal(true); }}
                    title="Excluir"
                    className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Adicionar Horário de Gabinete" size="md">
        <div className="space-y-4">
          <p className="text-sm text-stone-400">Defina um novo horário disponível para os voluntários agendarem atendimento pastoral.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Data *</label>
              <input type="date" value={formData.date} min={new Date().toISOString().slice(0, 10)}
                onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Hora *</label>
              <input type="time" value={formData.time}
                onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Duração do Atendimento *</label>
            <select value={formData.duration_minutes}
              onChange={e => setFormData(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
              {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} minutos</option>)}
            </select>
          </div>
          {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-700/40 rounded p-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Adicionar Horário</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir Horário" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
            <p className="text-stone-200 text-sm">Deseja excluir o horário de <strong className="text-red-300">
              {deleteTarget && `${formatDate(deleteTarget.date)} às ${deleteTarget.time}`}
            </strong>?</p>
            <p className="text-stone-500 text-xs mt-2">Se houver agendamento neste horário, a ação será recusada.</p>
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
