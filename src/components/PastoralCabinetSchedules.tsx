import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Card, Button, Modal, Input, Badge } from '../components/ui';
import api from '../utils/api';
import type { PastoralCabinetSchedule } from '../types';

interface Props {
  title?: string;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function PastoralCabinetSchedules({ title = 'Gerenciar Disponibilidade de Gabinete' }: Props) {
  const [schedules, setSchedules] = useState<PastoralCabinetSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PastoralCabinetSchedule | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);

  const [formData, setFormData] = useState({
    date: '',
    time: '',
    duration_minutes: 60,
  });

  useEffect(() => {
    loadSchedules();
  }, []);

  async function loadSchedules() {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<PastoralCabinetSchedule[]>(
        '/api/pastoral-cabinet/schedules'
      );
      if (response) {
        setSchedules(response.sort((a, b) =>
          (a.date + a.time).localeCompare(b.date + b.time)
        ));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      date: today,
      time: '09:00',
      duration_minutes: 60,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formData.date || !formData.time) {
      setError('Data e hora são obrigatórios');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post('/api/pastoral-cabinet/schedules', {
        date: formData.date,
        time: formData.time,
        duration_minutes: formData.duration_minutes,
        is_available: true,
      });
      setModalOpen(false);
      loadSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(schedule: PastoralCabinetSchedule) {
    setDeleteTarget(schedule);
    setDeleteModal(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/pastoral-cabinet/schedules/${deleteTarget.id}`);
      setDeleteModal(false);
      setDeleteTarget(null);
      loadSchedules();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
    return dateObj.toLocaleDateString('pt-BR', { 
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function formatDateTime(date: string, time: string) {
    return `${formatDate(date)} às ${time}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcomingSchedules = schedules.filter(s => s.date >= today);
  const pastSchedules = schedules.filter(s => s.date < today);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-stone-100">{title}</h1>
        <Button onClick={openNew} size="sm">
          <Plus size={16} /> Adicionar Horário
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold text-sm">Erro</p>
            <p className="text-red-200 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <Card className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-amber-500" />
        </Card>
      ) : schedules.length === 0 ? (
        <Card className="text-center py-12">
          <Calendar size={40} className="mx-auto mb-3 text-stone-600" />
          <p className="text-stone-400">Nenhum horário de gabinete disponível</p>
          <p className="text-stone-500 text-sm mt-1">Clique no botão acima para adicionar os primeiros horários</p>
        </Card>
      ) : (
        <>
          {/* Próximos Horários */}
          {upcomingSchedules.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Calendar size={16} /> Próximos Horários ({upcomingSchedules.length})
              </h2>
              <div className="space-y-2">
                {upcomingSchedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between gap-4 p-3 bg-stone-800/50 hover:bg-stone-800 rounded-lg transition-colors border border-stone-700/50 hover:border-stone-600"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={14} className="text-amber-400 flex-shrink-0" />
                        <p className="text-sm font-medium text-stone-200">
                          {formatDateTime(schedule.date, schedule.time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {schedule.is_available ? (
                          <Badge color="green" className="text-xs">Disponível</Badge>
                        ) : (
                          <Badge color="red" className="text-xs">Agendado</Badge>
                        )}
                        <span className="text-xs text-stone-500">
                          {schedule.duration_minutes} minutos
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(schedule)}
                      title="Excluir"
                      className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Horários Passados */}
          {pastSchedules.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-4">
                Histórico ({pastSchedules.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pastSchedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between gap-4 p-3 bg-stone-900/50 rounded-lg opacity-60 border border-stone-700/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-stone-600 flex-shrink-0" />
                        <p className="text-sm text-stone-500">
                          {formatDateTime(schedule.date, schedule.time)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(schedule)}
                      title="Excluir"
                      className="text-stone-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal: Adicionar Horário */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Adicionar Horário de Gabinete"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-400">
            Defina um novo horário disponível para os voluntários agendarem atendimento pastoral.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">
                Data *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">
                Hora *
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">
              Duração do Atendimento *
            </label>
            <select
              value={formData.duration_minutes}
              onChange={e => setFormData(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
            >
              {DURATION_OPTIONS.map(duration => (
                <option key={duration} value={duration}>
                  {duration} minutos
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-700/40 rounded p-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
            >
              Adicionar Horário
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirmar Exclusão */}
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Excluir Horário"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
            <p className="text-stone-200 text-sm">
              Deseja excluir o horário de <strong className="text-red-300">
                {deleteTarget && formatDateTime(deleteTarget.date, deleteTarget.time)}
              </strong>?
            </p>
            <p className="text-stone-500 text-xs mt-2">
              Se houver agendamento neste horário, a ação será recusada.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
