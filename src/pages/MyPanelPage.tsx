import { useState } from 'react';
import { Printer, Repeat, CheckCircle, HeartHandshake } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, Scale, Swap } from '../types';
import VolunteerCabinetBookings from '../components/VolunteerCabinetBookings';
import { exportMemberScalePDF } from '../utils/pdf';
import { isAdmin, isLeader } from '../utils/permissions';

interface Props { user: AuthUser; setPage?: (p: string) => void; }

export default function MyPanelPage({ user, setPage }: Props) {
  const { data: scales, refetch } = useApi<Scale[]>(user.member_id ? `/scales?member_id=${user.member_id}` : null);
  const { data: swaps } = useApi<Swap[]>(user.member_id ? `/swaps?member_id=${user.member_id}` : null);
  const [tab, setTab] = useState<'scales' | 'swaps' | 'pastoral'>('scales');

  async function confirm(id: number) {
    await api.put(`/scales/${id}/confirm`, {});
    refetch();
  }

  async function requestSwap(scaleId: number) {
    try {
      await api.post('/swaps', { scale_id: scaleId });
      alert('Solicitação enviada!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function printMyScale() {
    if (!scales) return;
    await exportMemberScalePDF(scales, user.name || user.email);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Meu Painel</h1>
        <div className="flex gap-2">
          {(isAdmin(user.role) || isLeader(user.role)) && setPage && (
            <Button variant="secondary" size="sm" onClick={() => setPage('scales')}>
              Ver Escalas dos Departamentos
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={printMyScale}>
            <Printer size={16} /> Imprimir Escala
          </Button>
        </div>
      </div>

      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('scales')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === 'scales' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          Minha Escala
        </button>
        <button onClick={() => setTab('swaps')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === 'swaps' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          Trocas
        </button>
        {user.member_id && (
          <button onClick={() => setTab('pastoral')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${tab === 'pastoral' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            <HeartHandshake size={14} /> Gabinete Pastoral
          </button>
        )}
      </div>

      {tab === 'scales' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-700 bg-stone-800/50">
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Culto</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Data</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Horário</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                  <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(scales || []).map(s => (
                  <tr key={s.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                    <td className="p-3 text-stone-200">{s.cult_name}</td>
                    <td className="p-3 text-stone-400 text-xs">{s.cult_date}</td>
                    <td className="p-3 text-stone-400 text-xs">{s.cult_time}</td>
                    <td className="p-3 text-stone-400 text-xs">{s.sector_name}</td>
                    <td className="p-3">
                      <Badge label={s.status} color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'} />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {s.status === 'Pendente' && (
                          <button onClick={() => confirm(s.id)} title="Confirmar presença" className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {s.status !== 'Troca' && (
                          <button onClick={() => requestSwap(s.id)} title="Solicitar troca" className="text-blue-400 hover:text-blue-300 p-1 transition-colors">
                            <Repeat size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!scales || scales.length === 0) && <p className="text-center text-stone-500 text-sm py-10">Você não está escalado</p>}
          </div>
        </Card>
      )}

      {tab === 'pastoral' && user.member_id && (
        <VolunteerCabinetBookings volunteerId={user.member_id} />
      )}

      {tab === 'swaps' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-700 bg-stone-800/50">
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Culto</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Solicitado</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Membro</th>
                </tr>
              </thead>
              <tbody>
                {(swaps || []).map(s => (
                  <tr key={s.id} className="border-b border-stone-800">
                    <td className="p-3 text-stone-200">{s.cult_name}</td>
                    <td className="p-3 text-stone-400 text-xs">{s.sector_name}</td>
                    <td className="p-3 text-stone-500 text-xs">{s.created_at.slice(0, 10)}</td>
                    <td className="p-3"><Badge label={s.status} color={s.status === 'Aprovado' ? 'green' : s.status === 'Recusado' ? 'red' : 'yellow'} /></td>
                    <td className="p-3"><Badge label={s.member_status} color={s.member_status === 'Aceito' ? 'green' : s.member_status === 'Recusado' ? 'red' : 'yellow'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!swaps || swaps.length === 0) && <p className="text-center text-stone-500 text-sm py-10">Nenhuma troca solicitada</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
