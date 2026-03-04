import { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight, Calendar, CheckCircle, XCircle, CalendarClock } from 'lucide-react';
import { Card, Button, Modal, Badge } from '../components/ui';
import api from '../utils/api';
import type { PastoralCabinetSchedule } from '../types';

interface Props { title?: string; }
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function PastoralCabinetSchedules({ title = 'Gerenciar Disponibilidade de Gabinete' }: Props) {
  const [schedules, setSchedules] = useState<PastoralCabinetSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PastoralCabinetSchedule | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
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
    setFormData({ date: date || todayStr, time: '09:00', duration_minutes: 60 });
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
      .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
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

  const future = schedules.filter(s => s.date >= todayStr);
  const available = future.filter(s => s.is_available);
  const occupied  = future.filter(s => !s.is_available);
  const thisWeek  = future.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return d >= start && d <= end;
  });

  // Maps
  const availByDate: Record<string, PastoralCabinetSchedule[]> = {};
  const occByDate: Record<string, PastoralCabinetSchedule[]> = {};
  available.forEach(s => { availByDate[s.date] = [...(availByDate[s.date]||[]), s]; });
  occupied.forEach(s => { occByDate[s.date] = [...(occByDate[s.date]||[]), s]; });

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  // List to show on right panel
  const listData = (() => {
    if (selectedDay) {
      const a = availByDate[selectedDay] || [];
      const o = occByDate[selectedDay] || [];
      return [...a, ...o].sort((x,y) => x.time.localeCompare(y.time));
    }
    const base = filter === 'available' ? available : filter === 'occupied' ? occupied : future;
    return base.slice(0, 20);
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-bold text-stone-100">{title}</h2>
        <Button onClick={() => openNew()} size="sm"><Plus size={16} /> Adicionar Horário</Button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => { setFilter('available'); setSelectedDay(null); }}
          className={`rounded-xl p-3 border text-left transition-all ${filter === 'available' && !selectedDay ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-stone-800/50 border-stone-700/50 hover:border-emerald-500/30'}`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-xs text-stone-400 uppercase tracking-wide">Disponíveis</span>
          </div>
          <p className="text-2xl font-bold text-emerald-300">{available.length}</p>
          <p className="text-xs text-stone-500 mt-0.5">horários livres</p>
        </button>

        <button onClick={() => { setFilter('occupied'); setSelectedDay(null); }}
          className={`rounded-xl p-3 border text-left transition-all ${filter === 'occupied' && !selectedDay ? 'bg-red-500/20 border-red-500/50' : 'bg-stone-800/50 border-stone-700/50 hover:border-red-500/30'}`}>
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={16} className="text-red-400" />
            <span className="text-xs text-stone-400 uppercase tracking-wide">Ocupados</span>
          </div>
          <p className="text-2xl font-bold text-red-300">{occupied.length}</p>
          <p className="text-xs text-stone-500 mt-0.5">agendamentos</p>
        </button>

        <button onClick={() => { setFilter('all'); setSelectedDay(null); }}
          className={`rounded-xl p-3 border text-left transition-all ${filter === 'all' && !selectedDay ? 'bg-amber-500/20 border-amber-500/50' : 'bg-stone-800/50 border-stone-700/50 hover:border-amber-500/30'}`}>
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock size={16} className="text-amber-400" />
            <span className="text-xs text-stone-400 uppercase tracking-wide">Esta semana</span>
          </div>
          <p className="text-2xl font-bold text-amber-300">{thisWeek.length}</p>
          <p className="text-xs text-stone-500 mt-0.5">horários</p>
        </button>
      </div>

      {/* ── Main Grid: Calendar + List ── */}
      {loading ? (
        <Card className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-amber-500" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Compact Calendar */}
          <Card className="lg:col-span-2 p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-700 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-stone-200 font-semibold text-sm">{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} className="p-1 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-700 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-stone-600 py-0.5">{d[0]}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const av = availByDate[ds]?.length || 0;
                const oc = occByDate[ds]?.length || 0;
                const isToday = ds === todayStr;
                const isSel = selectedDay === ds;
                const isPast = ds < todayStr;

                return (
                  <button key={ds} onClick={() => !isPast && setSelectedDay(isSel ? null : ds)}
                    disabled={isPast}
                    title={av || oc ? `${av} livre(s), ${oc} ocupado(s)` : 'Sem horários'}
                    className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-medium transition-all
                      ${isPast ? 'opacity-25 cursor-default' : 'cursor-pointer'}
                      ${isSel ? 'bg-amber-500 text-stone-900 shadow-md' :
                        isToday ? 'ring-1 ring-amber-500 text-amber-300' :
                        (av||oc) ? 'hover:bg-stone-700' : 'text-stone-500 hover:bg-stone-800'}
                    `}>
                    <span className={isSel ? 'text-stone-900' : isToday ? 'text-amber-300' : 'text-stone-300'}>{day}</span>
                    {(av > 0 || oc > 0) && !isSel && (
                      <div className="flex gap-0.5 mt-0.5">
                        {av > 0 && <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />}
                        {oc > 0 && <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mini legend */}
            <div className="flex items-center gap-3 mt-3 pt-2 border-t border-stone-800">
              <span className="flex items-center gap-1 text-xs text-stone-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Livre
              </span>
              <span className="flex items-center gap-1 text-xs text-stone-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Ocupado
              </span>
              {selectedDay && (
                <button onClick={() => openNew(selectedDay)}
                  className="ml-auto text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                  <Plus size={11} /> Horário em {formatDate(selectedDay)}
                </button>
              )}
            </div>
          </Card>

          {/* Right Panel: List */}
          <Card className="lg:col-span-3 p-4 flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                {selectedDay ? (
                  <>
                    <p className="text-stone-200 font-semibold text-sm">{formatDate(selectedDay)}</p>
                    <p className="text-stone-500 text-xs">
                      {(availByDate[selectedDay]?.length||0)} livre(s) · {(occByDate[selectedDay]?.length||0)} ocupado(s)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-stone-200 font-semibold text-sm">
                      {filter === 'available' ? 'Horários Disponíveis' : filter === 'occupied' ? 'Horários Ocupados' : 'Todos os Horários'}
                    </p>
                    <p className="text-stone-500 text-xs">Selecione um dia no calendário para filtrar</p>
                  </>
                )}
              </div>
              {selectedDay && (
                <button onClick={() => setSelectedDay(null)}
                  className="text-xs text-stone-500 hover:text-stone-300 transition-colors px-2 py-1 rounded-lg hover:bg-stone-700">
                  Ver todos
                </button>
              )}
            </div>

            {/* Scrollable list */}
            <div className="space-y-2 overflow-y-auto max-h-80 pr-1">
              {listData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Calendar size={32} className="text-stone-700 mb-2" />
                  <p className="text-stone-500 text-sm">Nenhum horário encontrado</p>
                  {selectedDay && (
                    <button onClick={() => openNew(selectedDay)}
                      className="mt-3 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors">
                      <Plus size={12} /> Adicionar horário neste dia
                    </button>
                  )}
                </div>
              ) : listData.map(s => (
                <div key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    s.is_available
                      ? 'bg-emerald-500/8 border-emerald-500/20 hover:border-emerald-500/40'
                      : 'bg-red-500/8 border-red-500/20'
                  }`}>
                  {/* Date badge */}
                  {!selectedDay && (
                    <div className="flex-shrink-0 w-10 text-center">
                      <p className="text-xs text-stone-500">{s.date.slice(5).replace('-','/')}</p>
                    </div>
                  )}
                  {/* Time */}
                  <div className={`flex-shrink-0 flex items-center gap-1.5 ${s.is_available ? 'text-emerald-300' : 'text-red-300'}`}>
                    <Clock size={13} />
                    <span className="text-sm font-semibold">{s.time.slice(0,5)}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge color={s.is_available ? 'green' : 'red'}>
                        {s.is_available ? 'Livre' : 'Ocupado'}
                      </Badge>
                      <span className="text-xs text-stone-500">{s.duration_minutes} min</span>
                    </div>
                    {(s as any).booked_by_name && (
                      <p className="text-xs text-amber-400/80 mt-0.5 truncate">👤 {(s as any).booked_by_name}</p>
                    )}
                  </div>
                  {/* Actions */}
                  {s.is_available && (
                    <button onClick={() => { setDeleteTarget(s); setDeleteModal(true); }}
                      className="flex-shrink-0 text-stone-600 hover:text-red-400 p-1 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Modal: Adicionar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Adicionar Horário de Gabinete" size="md">
        <div className="space-y-4">
          <p className="text-sm text-stone-400">Defina um novo horário disponível para os voluntários agendarem atendimento pastoral.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Data *</label>
              <input type="date" value={formData.date} min={todayStr}
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
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Duração *</label>
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

      {/* Modal: Excluir */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir Horário" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
            <p className="text-stone-200 text-sm">Deseja excluir o horário de <strong className="text-red-300">
              {deleteTarget && `${formatDate(deleteTarget.date)} às ${deleteTarget.time.slice(0,5)}`}
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
