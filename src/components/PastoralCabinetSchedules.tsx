import { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, Loader2, AlertCircle, CheckCircle, XCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Card, Button, Modal, Badge } from '../components/ui';
import api from '../utils/api';
import type { PastoralCabinetSchedule } from '../types';

interface Props { title?: string; }
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
type Tab = 'calendar' | 'occupied' | 'history';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function PastoralCabinetSchedules({ title = 'Gerenciar Disponibilidade de Gabinete' }: Props) {
  const [schedules, setSchedules] = useState<PastoralCabinetSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('calendar');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PastoralCabinetSchedule | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

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

  function openNew(date?: string) {
    setFormData({ date: date || today.toISOString().slice(0, 10), time: '09:00', duration_minutes: 60 });
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

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const available = schedules.filter(s => s.is_available);
  const occupied  = schedules.filter(s => !s.is_available && s.date >= todayStr);
  const history   = schedules.filter(s => s.date < todayStr);

  // Map date -> available schedules
  const availByDate: Record<string, PastoralCabinetSchedule[]> = {};
  available.forEach(s => {
    if (!availByDate[s.date]) availByDate[s.date] = [];
    availByDate[s.date].push(s);
  });

  // Map date -> occupied schedules
  const occupiedByDate: Record<string, PastoralCabinetSchedule[]> = {};
  occupied.forEach(s => {
    if (!occupiedByDate[s.date]) occupiedByDate[s.date] = [];
    occupiedByDate[s.date].push(s);
  });

  const selectedSlots = selectedDay ? (availByDate[selectedDay] || []) : [];
  const selectedOccupied = selectedDay ? (occupiedByDate[selectedDay] || []) : [];

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-bold text-stone-100">{title}</h2>
        <Button onClick={() => openNew()} size="sm"><Plus size={16} /> Adicionar Horário</Button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('calendar')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'calendar' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <Calendar size={14} /> Disponíveis <span className="text-xs opacity-60">({available.length})</span>
        </button>
        <button onClick={() => setTab('occupied')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'occupied' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <XCircle size={14} /> Ocupados <span className="text-xs opacity-60">({occupied.length})</span>
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <Clock size={14} /> Histórico <span className="text-xs opacity-60">({history.length})</span>
        </button>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-amber-500" />
        </Card>
      ) : tab === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar */}
          <Card className="lg:col-span-2 p-4">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-700 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <h3 className="text-stone-100 font-semibold text-sm">
                {MONTHS[viewMonth]} de {viewYear}
              </h3>
              <button onClick={nextMonth} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-700 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-xs text-stone-500 font-medium py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />;
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const slots = availByDate[dateStr] || [];
                const occ = occupiedByDate[dateStr] || [];
                const hasSlots = slots.length > 0;
                const hasOcc = occ.length > 0;
                const hasAny = hasSlots || hasOcc;
                const isToday = dateStr === todayStr;
                const isSelected = selectedDay === dateStr;
                const isPast = dateStr < todayStr;

                // Build tooltip
                const tooltipLines: string[] = [];
                if (slots.length) tooltipLines.push(`✅ ${slots.length} disponível(is): ${slots.map(s => s.time).join(', ')}`);
                if (occ.length) tooltipLines.push(`🔴 ${occ.length} ocupado(s): ${occ.map(s => `${s.time}${(s as any).booked_by_name ? ' - ' + (s as any).booked_by_name : ''}`).join(', ')}`);
                const tooltipText = tooltipLines.join(' | ') || 'Clique para adicionar horário';

                return (
                  <button key={dateStr}
                    onClick={() => hasAny ? setSelectedDay(isSelected ? null : dateStr) : openNew(dateStr)}
                    className={`
                      relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all group
                      ${isPast ? 'opacity-30 cursor-default' : 'cursor-pointer'}
                      ${isSelected ? 'bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/30' :
                        isToday ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' :
                        hasSlots && hasOcc ? 'bg-gradient-to-br from-emerald-500/15 to-red-500/15 border border-stone-600/50 hover:border-stone-500 text-stone-200' :
                        hasSlots ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30' :
                        hasOcc ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20' :
                        'text-stone-400 hover:bg-stone-700/50'}
                    `}
                    disabled={isPast}
                    title={tooltipText}
                  >
                    <span>{day}</span>
                    {!isSelected && (hasSlots || hasOcc) && (
                      <div className="flex gap-0.5 mt-0.5">
                        {hasSlots && <span className="text-xs font-bold text-emerald-400">{slots.length}</span>}
                        {hasSlots && hasOcc && <span className="text-xs text-stone-500">/</span>}
                        {hasOcc && <span className="text-xs font-bold text-red-400">{occ.length}</span>}
                      </div>
                    )}
                    {/* Hover tooltip */}
                    {!isPast && hasAny && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-52 bg-stone-900 border border-stone-600 rounded-lg p-2.5 shadow-xl text-left pointer-events-none">
                        {slots.map(s => (
                          <div key={s.id} className="flex items-center gap-1.5 text-xs text-emerald-300 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span>{s.time} • {s.duration_minutes}min • Livre</span>
                          </div>
                        ))}
                        {occ.map(s => (
                          <div key={s.id} className="flex items-start gap-1.5 text-xs text-red-300 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-0.5" />
                            <span>{s.time} • {(s as any).booked_by_name || 'Ocupado'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-stone-700 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40 inline-block" /> Disponível
              </span>
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="w-3 h-3 rounded bg-red-500/15 border border-red-500/30 inline-block" /> Ocupado
              </span>
              <span className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/50 inline-block" /> Hoje
              </span>
            </div>
          </Card>

          {/* Day detail panel */}
          <Card className="p-4">
            {selectedDay ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-stone-200 font-semibold text-sm">{formatDate(selectedDay)}</h4>
                  <button onClick={() => openNew(selectedDay)}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-lg transition-colors">
                    <Plus size={12} /> Horário
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedSlots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-emerald-400" />
                          <span className="text-stone-200 text-sm font-medium">{slot.time}</span>
                          <Badge color="green">Livre</Badge>
                        </div>
                        <span className="text-xs text-stone-500 mt-0.5 block">{slot.duration_minutes} min</span>
                      </div>
                      <button onClick={() => { setDeleteTarget(slot); setDeleteModal(true); }}
                        className="text-stone-600 hover:text-red-400 p-1 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {selectedOccupied.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between p-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-red-400" />
                          <span className="text-stone-200 text-sm font-medium">{slot.time}</span>
                          <Badge color="red">Ocupado</Badge>
                        </div>
                        <span className="text-xs text-stone-500 mt-0.5 block">{slot.duration_minutes} min</span>
                        {(slot as any).booked_by_name && (
                          <span className="text-xs text-amber-400/80 mt-0.5 block">👤 {(slot as any).booked_by_name}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedSlots.length === 0 && selectedOccupied.length === 0 && (
                    <p className="text-stone-500 text-xs text-center py-4">Nenhum horário neste dia</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <Calendar size={32} className="text-stone-600 mb-3" />
                <p className="text-stone-500 text-sm">Selecione um dia no calendário para ver os horários</p>
                <p className="text-stone-600 text-xs mt-2">Dias em verde possuem horários disponíveis</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Occupied / History list */
        (tab === 'occupied' ? occupied : history).length === 0 ? (
          <Card className="text-center py-10">
            <Calendar size={36} className="mx-auto mb-3 text-stone-600" />
            <p className="text-stone-400 text-sm">
              {tab === 'occupied' ? 'Nenhum horário ocupado' : 'Nenhum registro no histórico'}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="space-y-2">
              {(tab === 'occupied' ? occupied : history).map(schedule => (
                <div key={schedule.id}
                  className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${
                    tab === 'history' ? 'bg-stone-900/40 border-stone-700/30 opacity-60' :
                    'bg-stone-800/30 border-stone-700/50'
                  }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={14} className={tab === 'history' ? 'text-stone-600' : 'text-amber-400'} />
                      <p className={`text-sm font-medium ${tab === 'history' ? 'text-stone-500' : 'text-stone-200'}`}>
                        {formatDate(schedule.date)} às {schedule.time}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge color={schedule.is_available ? 'green' : 'red'}>
                        {schedule.is_available ? 'Disponível' : 'Ocupado'}
                      </Badge>
                      <span className="text-xs text-stone-500">{schedule.duration_minutes} min</span>
                      {(schedule as any).booked_by_name && (
                        <span className="text-xs text-amber-400/80 flex items-center gap-1">
                          👤 Agendado por: {(schedule as any).booked_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {tab === 'history' && (
                    <button onClick={() => { setDeleteTarget(schedule); setDeleteModal(true); }}
                      className="text-stone-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors flex-shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {/* Modal: Adicionar Horário */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Adicionar Horário de Gabinete" size="md">
        <div className="space-y-4">
          <p className="text-sm text-stone-400">Defina um novo horário disponível para os voluntários agendarem atendimento pastoral.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Data *</label>
              <input type="date" value={formData.date} min={today.toISOString().slice(0, 10)}
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

      {/* Modal: Confirmar Exclusão */}
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
