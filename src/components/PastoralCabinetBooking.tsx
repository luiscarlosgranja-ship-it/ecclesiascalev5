import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { Card, Button, Modal, Badge } from './ui';
import api from '../utils/api';
import type { AvailableTimeSlot, PastoralCabinetBooking } from '../types';

interface Props {
  user: { member_id?: number | null; name?: string; email?: string };
  onBookingSuccess: () => void;
}

interface MonthAvailability {
  date: string;
  hasAvailable: boolean;
}

export default function PastoralCabinetBooking({ user, onBookingSuccess }: Props) {
  const volunteerId = user.member_id ?? null;
  const volunteerName = user.name || user.email || 'Voluntário';
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [availableSlots, setAvailableSlots] = useState<AvailableTimeSlot[]>([]);
  const [monthDays, setMonthDays] = useState<MonthAvailability[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Carregar disponibilidade para o mês selecionado
  useEffect(() => {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const monthStr = `${year}-${month}`;
    
    loadMonthAvailability(monthStr);
  }, [currentMonth]);

  // Carregar horários disponíveis quando a data for selecionada
  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots(selectedDate);
    }
  }, [selectedDate]);

  async function loadMonthAvailability(monthStr: string) {
    try {
      setLoading(true);
      const response = await api.get<MonthAvailability[]>(
        `/pastoral-cabinet/availability/${monthStr}`
      );
      if (response) {
        setMonthDays(response);
      }
    } catch (e) {
      console.error('Erro ao carregar disponibilidade do mês:', e);
      setError('Erro ao carregar calendário');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableSlots(date: string) {
    try {
      setLoading(true);
      setAvailableSlots([]);
      const response = await api.get<AvailableTimeSlot[]>(
        `/pastoral-cabinet/available-slots/${date}`
      );
      if (response) {
        setAvailableSlots(response);
      }
    } catch (e) {
      console.error('Erro ao carregar horários:', e);
      setError('Erro ao carregar horários disponíveis');
    } finally {
      setLoading(false);
    }
  }

  async function handleBook() {
    if (!selectedDate || !selectedTime || !selectedScheduleId) {
      setError('Selecione data, hora e horário');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const booking: Partial<PastoralCabinetBooking> = {
        volunteer_id: volunteerId,
        schedule_id: selectedScheduleId,
        date: selectedDate,
        time: selectedTime,
        status: 'Agendado',
        notes: notes || undefined,
      };

      await api.post('/pastoral-cabinet/bookings', booking);
      
      setSuccess(true);
      setTimeout(() => {
        setModalOpen(false);
        resetForm();
        onBookingSuccess();
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao agendar');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedDate('');
    setSelectedTime('');
    setSelectedScheduleId(null);
    setNotes('');
    setError('');
    setSuccess(false);
  }

  function handleOpenModal() {
    resetForm();
    const today = new Date().toISOString().slice(0, 10);
    setSelectedDate(today);
    setCurrentMonth(new Date());
    setModalOpen(true);
  }

  function goToPreviousMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  }

  function goToNextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function formatDateTime(date: string, time: string) {
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y} às ${time}`;
  }

  const selectedSlot = availableSlots.find(
    slot => slot.time === selectedTime && slot.schedule_id === selectedScheduleId
  );

  const monthStr = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <>
      <Button onClick={handleOpenModal} variant="outline" size="sm">
        <Calendar size={16} /> Agendar Gabinete
      </Button>

      <Modal 
        open={modalOpen} 
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={`Agendar Gabinete Pastoral - ${volunteerName}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Etapa: Selecionar Data */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Calendar size={16} /> Escolher Data
            </h3>
            
            <div className="bg-stone-800/50 border border-stone-700 rounded-lg p-4">
              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={goToPreviousMonth}
                  className="text-stone-400 hover:text-stone-200 transition-colors px-2 py-1"
                >
                  ←
                </button>
                <span className="text-sm font-semibold text-stone-200 capitalize">
                  {monthStr}
                </span>
                <button
                  onClick={goToNextMonth}
                  className="text-stone-400 hover:text-stone-200 transition-colors px-2 py-1"
                >
                  →
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-amber-500" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(day => (
                    <div
                      key={day}
                      className="text-center text-xs font-semibold text-stone-500 py-2"
                    >
                      {day}
                    </div>
                  ))}

                  {monthDays.length === 0 ? (
                    <div className="col-span-7 text-center py-4 text-stone-500 text-sm">
                      Nenhuma disponibilidade neste mês
                    </div>
                  ) : (
                    monthDays.map(dayInfo => {
                      const dayNum = parseInt(dayInfo.date.split('-')[2]);
                      const isSelected = dayInfo.date === selectedDate;
                      const hasAvailable = dayInfo.hasAvailable;

                      return (
                        <button
                          key={dayInfo.date}
                          onClick={() => {
                            if (hasAvailable) {
                              setSelectedDate(dayInfo.date);
                              setSelectedTime('');
                              setSelectedScheduleId(null);
                            }
                          }}
                          disabled={!hasAvailable}
                          className={`
                            aspect-square rounded-lg text-sm font-medium transition-all
                            ${isSelected
                              ? 'bg-amber-500 text-stone-900 shadow-lg'
                              : hasAvailable
                              ? 'bg-stone-700 text-stone-200 hover:bg-amber-500/30 cursor-pointer'
                              : 'bg-stone-900 text-stone-600 cursor-not-allowed'
                            }
                          `}
                        >
                          {dayNum}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Etapa: Selecionar Hora */}
          {selectedDate && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                <Clock size={16} /> Horários Disponíveis para {formatDate(selectedDate)}
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-amber-500" />
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-200">Nenhum horário disponível para esta data</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={`${slot.time}-${slot.schedule_id}`}
                      onClick={() => {
                        setSelectedTime(slot.time);
                        setSelectedScheduleId(slot.schedule_id);
                      }}
                      className={`
                        px-4 py-3 rounded-lg text-sm font-medium transition-all border
                        ${
                          selectedTime === slot.time && selectedScheduleId === slot.schedule_id
                            ? 'bg-amber-500 text-stone-900 border-amber-400 shadow-lg'
                            : 'bg-stone-800 text-stone-200 border-stone-700 hover:bg-stone-700 hover:border-stone-600'
                        }
                      `}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Clock size={14} />
                        {slot.time}
                      </div>
                      <div className="text-xs opacity-75 mt-0.5">
                        {slot.duration_minutes}min
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview do Agendamento */}
          {selectedDate && selectedTime && selectedScheduleId && !loading && (
            <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-200">Horário Selecionado</p>
                  <p className="text-emerald-300 text-sm mt-1">
                    {formatDateTime(selectedDate, selectedTime)}
                  </p>
                  {selectedSlot && (
                    <p className="text-emerald-600 text-xs mt-1">
                      Duração: {selectedSlot.duration_minutes} minutos
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <label className="text-xs text-stone-400 uppercase tracking-wide font-medium">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Descreva o motivo do atendimento ou outras observações..."
              rows={3}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Mensagens */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-red-300 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-emerald-300 text-sm flex items-start gap-2">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              Gabinete agendado com sucesso!
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBook}
              loading={saving}
              disabled={!selectedDate || !selectedTime || !selectedScheduleId}
            >
              Confirmar Agendamento
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
