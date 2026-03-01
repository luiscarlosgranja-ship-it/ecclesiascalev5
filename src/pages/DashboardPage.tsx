import { useState, useEffect } from 'react';
import { Users, Calendar, CheckCircle, Clock, Repeat, Settings, Eye, EyeOff } from 'lucide-react';
import { Card, Badge, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useTrialStatus } from '../hooks/useTrialStatus';
import { getSupabase } from '../utils/supabaseClient';
import type { AuthUser, DashboardStats, DashboardWidget, Scale, Cult } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardPageProps {
  user: AuthUser;
  setPage?: (p: string) => void;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'stats', title: 'Estatísticas', visible: true, order: 0 },
  { id: 'quick-actions', title: 'Ações Rápidas', visible: true, order: 1 },
  { id: 'upcoming-events', title: 'Próximos Eventos', visible: true, order: 2 },
  { id: 'my-scales', title: 'Minhas Escalas', visible: true, order: 3 },
  { id: 'pending-swaps', title: 'Trocas Pendentes', visible: true, order: 4 },
];

export default function DashboardPage({ user, setPage }: DashboardPageProps) {
  const [customizing, setCustomizing] = useState(false);

  // ─── Preferências de widgets em memória (sem localStorage) ──────────────────
  // Sincroniza entre dispositivos pois não persiste localmente
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);

  const trial = useTrialStatus();
  // Só mostra o banner quando o status foi carregado do servidor (evita flash falso)
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useApi<DashboardStats>('/dashboard/stats');
  const { data: upcomingCults, refetch: refetchCults } = useApi<Cult[]>('/cults?status=Agendado&limit=5');
  const { data: myScales, refetch: refetchScales } = useApi<Scale[]>(
    user.member_id ? `/scales?member_id=${user.member_id}&limit=5` : null
  );

  // ─── Supabase Realtime (opcional) ────────────────────────────────────────────
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return; // Realtime desativado se env vars não configuradas

    const channel = sb
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => {
        refetchCults();
        refetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        refetchScales();
        refetchStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, () => {
        refetchStats();
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [refetchCults, refetchScales, refetchStats]);

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const visibleWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {/* Trial Banner */}
      {trial.loaded && trial.isTrial && !trial.isExpired && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-xl px-4 py-3 flex items-center gap-3">
          <Clock className="text-amber-400 flex-shrink-0" size={18} />
          <p className="text-amber-300 text-sm">
            <strong>Versão de Teste:</strong> {trial.daysLeft} dia(s) restante(s). Insira uma chave de ativação em Segurança para uso contínuo.
          </p>
        </div>
      )}

      {trial.loaded && trial.isExpired && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-center">
          <p className="text-red-300 font-semibold">Período de teste expirado. Acesse Segurança → Ativação para inserir sua chave.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-100">
            Olá, {user.name || user.email.split('@')[0]}!
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        {(isAdmin(user.role) || isLeader(user.role)) && (
          <button
            onClick={() => setCustomizing(!customizing)}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-sm bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Settings size={14} />
            {customizing ? 'Concluir' : 'Personalizar'}
          </button>
        )}
      </div>

      {/* Widget Customizer */}
      {customizing && (
        <Card className="p-4">
          <p className="text-stone-300 text-sm font-medium mb-3">Escolha os painéis visíveis:</p>
          <div className="flex flex-wrap gap-2">
            {widgets.map(w => (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  w.visible
                    ? 'bg-amber-600/20 border-amber-600/40 text-amber-300'
                    : 'bg-stone-800 border-stone-600 text-stone-500'
                }`}
              >
                {w.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                {w.title}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Widgets */}
      <div className="grid grid-cols-1 gap-6">
        {visibleWidgets.map(widget => {
          switch (widget.id) {
            case 'stats': return <StatsWidget key="stats" stats={stats} loading={statsLoading} />;
            case 'quick-actions': return <QuickActionsWidget key="qa" user={user} setPage={setPage} />;
            case 'upcoming-events': return <UpcomingEventsWidget key="ue" cults={upcomingCults || []} />;
            case 'my-scales': return <MyScalesWidget key="ms" scales={myScales || []} />;
            case 'pending-swaps': return (isAdmin(user.role) || isLeader(user.role)) ? <PendingSwapsWidget key="ps" userId={user.id} role={user.role} /> : null;
            default: return null;
          }
        })}
      </div>
    </div>
  );
}

// ─── Stats Widget ─────────────────────────────────────────────────────────────
function StatsWidget({ stats, loading }: { stats: DashboardStats | null; loading: boolean }) {
  const items = [
    { label: 'Eventos Futuros', value: stats?.futureEvents ?? 0, icon: <Calendar className="text-amber-400" size={20} />, color: 'amber' },
    { label: 'Voluntários Ativos', value: stats?.activeVolunteers ?? 0, icon: <Users className="text-emerald-400" size={20} />, color: 'emerald' },
    { label: 'Vagas Preenchidas', value: stats?.filledSlots ?? 0, icon: <CheckCircle className="text-blue-400" size={20} />, color: 'blue' },
    { label: 'Confirmações Pendentes', value: stats?.pendingConfirmations ?? 0, icon: <Clock className="text-yellow-400" size={20} />, color: 'yellow' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(item => (
        <Card key={item.label} className="p-4">
          <div className="flex items-center justify-between mb-2">
            {item.icon}
            {loading && <Spinner className="w-4 h-4" />}
          </div>
          <p className="text-2xl font-bold text-stone-100">{loading ? '—' : item.value}</p>
          <p className="text-stone-500 text-xs mt-0.5">{item.label}</p>
        </Card>
      ))}
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
function QuickActionsWidget({ user, setPage }: { user: AuthUser; setPage?: (p: string) => void }) {
  const actions = [
    { label: 'Escalas', icon: <Calendar size={18} />, page: 'scales', roles: ['SuperAdmin','Admin','Líder'] },
    { label: 'Eventos', icon: <Calendar size={18} />, page: 'cults', roles: ['SuperAdmin','Admin'] },
    { label: 'Voluntários', icon: <Users size={18} />, page: 'members', roles: ['SuperAdmin','Admin','Líder'] },
    { label: 'Cadastros', icon: <Settings size={18} />, page: 'registries', roles: ['SuperAdmin','Admin'] },
    { label: 'Trocas', icon: <Repeat size={18} />, page: 'swaps', roles: ['SuperAdmin','Admin','Líder','Membro'] },
  ].filter(a => a.roles.includes(user.role));

  return (
    <Card className="p-4">
      <h3 className="text-stone-300 font-medium text-sm mb-3">Ações Rápidas</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={() => setPage?.(a.page)}
            className="flex items-center gap-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-xs font-medium px-3 py-2 rounded-lg transition-all"
          >
            {a.icon}{a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─── Upcoming Events ──────────────────────────────────────────────────────────
function UpcomingEventsWidget({ cults }: { cults: Cult[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-stone-300 font-medium text-sm mb-3">Próximos Eventos</h3>
      {cults.length === 0 ? (
        <p className="text-stone-500 text-xs">Nenhum evento agendado</p>
      ) : (
        <div className="space-y-2">
          {cults.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
              <div>
                <p className="text-stone-200 text-sm font-medium">{c.name || c.type_name}</p>
                <p className="text-stone-500 text-xs">{c.date} às {c.time}</p>
              </div>
              <Badge label={c.status} color={c.status === 'Agendado' ? 'blue' : c.status === 'Confirmado' ? 'green' : 'gray'} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── My Scales ────────────────────────────────────────────────────────────────
function MyScalesWidget({ scales }: { scales: Scale[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-stone-300 font-medium text-sm mb-3">Minhas Escalas</h3>
      {scales.length === 0 ? (
        <p className="text-stone-500 text-xs">Você não está escalado ainda</p>
      ) : (
        <div className="space-y-2">
          {scales.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
              <div>
                <p className="text-stone-200 text-sm font-medium">{s.cult_name}</p>
                <p className="text-stone-500 text-xs">{s.cult_date} • {s.sector_name}</p>
              </div>
              <Badge
                label={s.status}
                color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Pending Swaps ────────────────────────────────────────────────────────────
function PendingSwapsWidget({ userId, role }: { userId: number; role: string }) {
  const { data: swaps, refetch } = useApi<import('../types').Swap[]>('/swaps?status=Pendente&limit=5');

  // Realtime para trocas pendentes (opcional)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel('swaps-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps' }, () => {
        refetch();
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [refetch]);

  return (
    <Card className="p-4">
      <h3 className="text-stone-300 font-medium text-sm mb-3">Solicitações de Troca Pendentes</h3>
      {!swaps || swaps.length === 0 ? (
        <p className="text-stone-500 text-xs">Nenhuma solicitação pendente</p>
      ) : (
        <div className="space-y-2">
          {swaps.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
              <div>
                <p className="text-stone-200 text-sm">{s.requester_name} → {s.suggested_member_name || 'Qualquer'}</p>
                <p className="text-stone-500 text-xs">{s.cult_name} • {s.sector_name}</p>
              </div>
              <Badge label="Pendente" color="yellow" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
