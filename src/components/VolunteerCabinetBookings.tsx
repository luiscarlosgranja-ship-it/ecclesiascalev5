import { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Card, Badge } from './ui';
import api from '../utils/api';
import type { PastoralCabinetBooking } from '../types';

interface Props {
  volunteerId: number;
  onRefresh?: () => void;
}

const STATUS_COLOR: Record<string, 'green' | 'yellow' | 'red' | 'blue'> = {
  'Agendado': 'blue',
  'Confirmado': 'green',
  'Realizado': 'green',
  'Cancelado': 'red',
};

export default function VolunteerCabinetBookings({ volunteerId, onRefresh }: Props) {
  const [bookings, setBookings] = useState<PastoralCabinetBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBookings();
  }, [volunteerId]);

  async function loadBookings() {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<PastoralCabinetBooking[]>(
        `/api/pastoral-cabinet/bookings/volunteer/${volunteerId}`
      );
      if (response) {
        setBookings(response);
      }
    } catch (e) {
      console.error('Erro ao carregar agendamentos:', e);
      setError(e instanceof Error ? e.message : 'Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function formatDateTime(date: string, time: string) {
    const [y, m, day] = date.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
    const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${day} de ${new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('pt-BR', { month: 'long' })} às ${time}`;
  }

  const upcoming = bookings.filter(b => 
    b.status === 'Agendado' || b.status === 'Confirmado'
  ).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const completed = bookings.filter(b =>
    b.status === 'Realizado' || b.status === 'Cancelado'
  ).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  if (loading) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-200">Meus Agendamentos de Gabinete</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-amber-500" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
          <Calendar size={16} /> Meus Agendamentos de Gabinete
        </h2>
        <button
          onClick={() => {
            loadBookings();
            onRefresh?.();
          }}
          className="text-stone-400 hover:text-stone-200 transition-colors p-1"
          title="Atualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-8 text-stone-500">
          <Calendar size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Você ainda não tem agendamentos de gabinete</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Próximos Agendamentos */}
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                Próximos Agendamentos ({upcoming.length})
              </h3>
              <div className="space-y-2">
                {upcoming.map(booking => (
                  <div
                    key={booking.id}
                    className="bg-stone-800/50 border border-amber-700/30 rounded-lg p-3 hover:bg-stone-800 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock size={14} className="text-amber-400 flex-shrink-0" />
                          <p className="text-sm font-semibold text-stone-200">
                            {formatDateTime(booking.date, booking.time)}
                          </p>
                        </div>
                        {booking.notes && (
                          <p className="text-xs text-stone-400 mt-1">{booking.notes}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge color={STATUS_COLOR[booking.status] || 'blue'}>
                            {booking.status}
                          </Badge>
                          <span className="text-xs text-stone-500">
                            {booking.duration_minutes}min
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {booking.status === 'Confirmado' && (
                          <CheckCircle size={18} className="text-emerald-400" />
                        )}
                        {booking.status === 'Agendado' && (
                          <Clock size={18} className="text-amber-400" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico */}
          {completed.length > 0 && (
            <div className="space-y-3 border-t border-stone-700 pt-4">
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                Histórico ({completed.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {completed.map(booking => (
                  <div
                    key={booking.id}
                    className="bg-stone-900/50 border border-stone-700/50 rounded-lg p-3 opacity-75"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock size={14} className="text-stone-500 flex-shrink-0" />
                          <p className="text-sm text-stone-400">
                            {formatDate(booking.date)} às {booking.time}
                          </p>
                        </div>
                        <Badge color={STATUS_COLOR[booking.status] || 'gray'} className="text-xs">
                          {booking.status}
                        </Badge>
                      </div>
                      {booking.status === 'Realizado' && (
                        <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
                      )}
                      {booking.status === 'Cancelado' && (
                        <XCircle size={18} className="text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
