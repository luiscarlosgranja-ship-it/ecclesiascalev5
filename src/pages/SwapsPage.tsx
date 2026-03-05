import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, History } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import type { AuthUser, Swap } from '../types';
import { isAdmin } from '../utils/permissions';

interface Props { user: AuthUser; }

export default function SwapsPage({ user }: Props) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const { data: swaps, refetch } = useApi<Swap[]>('/swaps');

  // ─── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return; // Realtime desativado se env vars não configuradas

    const channel = supabase
      .channel('swaps-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, () => {
        refetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const pending = (swaps || []).filter(s => s.status === 'Pendente');
  const history = (swaps || []).filter(s => s.status !== 'Pendente');

  async function respond(id: number, action: 'Aprovado' | 'Recusado') {
    await api.put(`/swaps/${id}`, { status: action });
    refetch();
  }

  async function memberRespond(id: number, action: 'Aceito' | 'Recusado') {
    await api.put(`/swaps/${id}/member`, { member_status: action });
    refetch();
  }

  const list = tab === 'pending' ? pending : history;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold theme-text-primary">Gerenciar Trocas</h1>

      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('pending')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === 'pending' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          Pendentes {pending.length > 0 && <span className="ml-1 bg-amber-600/30 text-amber-300 text-xs px-1.5 rounded">{pending.length}</span>}
        </button>
        <button onClick={() => setTab('history')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <History size={14} /> Histórico
        </button>
      </div>

      <Card className="overflow-hidden">
        {/* ── Desktop table ── */}
        <div className="rsp-table rsp-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700 bg-stone-800/50 theme-table-head">
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Solicitante</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Substituto</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Culto</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Membro</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Data</th>
                <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors theme-table-row">
                  <td className="p-3 text-stone-200 font-medium">{s.requester_name}</td>
                  <td className="p-3 text-stone-400 text-xs">{s.suggested_member_name || '—'}</td>
                  <td className="p-3 text-stone-400 text-xs">{s.cult_name}</td>
                  <td className="p-3 text-stone-400 text-xs">{s.sector_name}</td>
                  <td className="p-3"><Badge label={s.status} color={s.status === 'Aprovado' ? 'green' : s.status === 'Recusado' ? 'red' : 'yellow'} /></td>
                  <td className="p-3"><Badge label={s.member_status} color={s.member_status === 'Aceito' ? 'green' : s.member_status === 'Recusado' ? 'red' : 'yellow'} /></td>
                  <td className="p-3 text-stone-500 text-xs">{s.created_at.slice(0, 10)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {tab === 'pending' && (isAdmin(user.role) || user.role === 'Líder') && s.status === 'Pendente' && (
                        <>
                          <button onClick={() => respond(s.id, 'Aprovado')} title="Aprovar" className="text-emerald-400 hover:text-emerald-300 p-1.5 transition-colors"><CheckCircle size={15} /></button>
                          <button onClick={() => respond(s.id, 'Recusado')} title="Recusar" className="text-red-400 hover:text-red-300 p-1.5 transition-colors"><XCircle size={15} /></button>
                        </>
                      )}
                      {tab === 'pending' && user.member_id && s.suggested_member_id === user.member_id && s.member_status === 'Pendente' && (
                        <>
                          <button onClick={() => memberRespond(s.id, 'Aceito')} title="Aceitar" className="text-blue-400 hover:text-blue-300 p-1.5 transition-colors"><CheckCircle size={15} /></button>
                          <button onClick={() => memberRespond(s.id, 'Recusado')} title="Recusar" className="text-red-400 hover:text-red-300 p-1.5 transition-colors"><XCircle size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="text-center text-stone-500 text-sm py-10">Nenhuma solicitação</p>}
        </div>

        {/* ── Mobile cards ── */}
        <div className="rsp-cards p-3">
          {list.length === 0 && <p className="text-center text-stone-500 text-sm py-8">Nenhuma solicitação</p>}
          {list.map(s => (
            <div key={s.id} className="rounded-xl border border-stone-700 bg-stone-800/40 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-stone-200 font-semibold text-sm truncate">{s.requester_name}</p>
                  {s.suggested_member_name && <p className="text-stone-500 text-xs truncate">→ {s.suggested_member_name}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge label={s.status} color={s.status === 'Aprovado' ? 'green' : s.status === 'Recusado' ? 'red' : 'yellow'} />
                  <Badge label={s.member_status} color={s.member_status === 'Aceito' ? 'green' : s.member_status === 'Recusado' ? 'red' : 'yellow'} />
                </div>
              </div>
              {(s.cult_name || s.sector_name) && (
                <p className="text-stone-500 text-xs">{[s.cult_name, s.sector_name].filter(Boolean).join(' · ')}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-stone-600 text-xs">{s.created_at.slice(0,10)}</span>
                <div className="flex gap-2">
                  {tab === 'pending' && (isAdmin(user.role) || user.role === 'Líder') && s.status === 'Pendente' && (
                    <>
                      <button onClick={() => respond(s.id, 'Aprovado')} className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1"><CheckCircle size={12}/> Aprovar</button>
                      <button onClick={() => respond(s.id, 'Recusado')} className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1"><XCircle size={12}/> Recusar</button>
                    </>
                  )}
                  {tab === 'pending' && user.member_id && s.suggested_member_id === user.member_id && s.member_status === 'Pendente' && (
                    <>
                      <button onClick={() => memberRespond(s.id, 'Aceito')} className="text-xs text-blue-400 bg-blue-900/20 border border-blue-700/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1"><CheckCircle size={12}/> Aceitar</button>
                      <button onClick={() => memberRespond(s.id, 'Recusado')} className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1"><XCircle size={12}/> Recusar</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
