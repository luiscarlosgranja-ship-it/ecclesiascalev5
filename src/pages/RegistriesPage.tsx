import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ToggleLeft, ToggleRight, Clock, AlertTriangle, ShieldOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Button, Modal, Input, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useTrialStatus } from '../hooks/useTrialStatus';
import api from '../utils/api';
import type { AuthUser, Ministry, Department, Sector, CultType } from '../types';

interface Props { user: AuthUser; initialTab?: string; }
type Tab = 'ministries' | 'departments' | 'sectors' | 'cult_types';

function resolveTab(raw?: string): Tab {
  if (raw === 'cult-types') return 'cult_types';
  if (raw === 'ministries' || raw === 'departments' || raw === 'sectors' || raw === 'cult_types') return raw as Tab;
  return 'ministries';
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];


// ─── Setores agrupados por departamento ───────────────────────────────────────
function SectorsView({ sectors, departments, onRefetch, user }: {
  sectors: any[];
  departments: any[];
  onRefetch: () => void;
  user: AuthUser;
}) {
  const canManage = ['SuperAdmin', 'Admin', 'Líder'].includes(user.role);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function openNew(departmentId: number) {
    setEditItem({ name: '', is_active: 1, department_id: departmentId });
    setError('');
    setModalOpen(true);
  }

  function openEdit(sector: any) {
    setEditItem({ ...sector });
    setError('');
    setModalOpen(true);
  }

  async function save() {
    if (!editItem?.name?.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true); setError('');
    try {
      if (editItem.id) {
        await api.put(`/sectors/${editItem.id}`, editItem);
      } else {
        await api.post('/sectors', editItem);
      }
      setModalOpen(false);
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function toggleActive(sector: any) {
    await api.put(`/sectors/${sector.id}`, { ...sector, is_active: sector.is_active ? 0 : 1 });
    onRefetch();
  }

  async function remove(id: number) {
    if (!confirm('Excluir este setor? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/sectors/${id}`);
      onRefetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  // Group sectors by department_id
  const grouped: Record<string, { dept: any; sectors: any[] }> = {};

  // Init all departments
  for (const dept of departments) {
    grouped[dept.id] = { dept, sectors: [] };
  }
  // Sem departamento
  grouped['none'] = { dept: { id: null, name: 'Sem Departamento' }, sectors: [] };

  for (const s of sectors) {
    const key = s.department_id && grouped[s.department_id] ? String(s.department_id) : 'none';
    grouped[key].sectors.push(s);
  }

  const groups = Object.entries(grouped)
    .filter(([, g]) => g.sectors.length > 0 || g.dept.id !== null)
    .sort(([, a], [, b]) => {
      if (a.dept.id === null) return 1;
      if (b.dept.id === null) return -1;
      return a.dept.name.localeCompare(b.dept.name);
    });

  return (
    <>
      <div className="space-y-3">
        {groups.map(([key, { dept, sectors: deptSectors }]) => {
          const isCollapsed = collapsed.has(key);
          const activeCount = deptSectors.filter(s => s.is_active).length;

          return (
            <Card key={key} className="overflow-hidden">
              {/* Block header */}
              <div className="flex items-center justify-between px-4 py-3 bg-stone-800/50 border-b border-stone-700">
                <button
                  onClick={() => toggleCollapse(key)}
                  className="flex items-center gap-2 text-left flex-1"
                >
                  {isCollapsed ? <ChevronDown size={15} className="text-stone-500" /> : <ChevronUp size={15} className="text-stone-500" />}
                  <span className="text-stone-200 font-semibold text-sm">{dept.name}</span>
                  <span className="text-stone-500 text-xs">
                    {activeCount}/{deptSectors.length} ativo(s)
                  </span>
                </button>
                {dept.id !== null && canManage && (
                  <Button size="sm" onClick={() => openNew(dept.id)}>
                    <Plus size={13} /> Novo Setor
                  </Button>
                )}
              </div>

              {/* Sectors table */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  {deptSectors.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-stone-600 text-xs">Nenhum setor cadastrado neste departamento</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-800">
                          <th className="text-left p-3 text-stone-500 font-medium text-xs">#</th>
                          <th className="text-left p-3 text-stone-500 font-medium text-xs">Nome</th>
                          <th className="text-left p-3 text-stone-500 font-medium text-xs">Status</th>
                          {canManage && <th className="text-right p-3 text-stone-500 font-medium text-xs">Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {deptSectors.map((s: any, i: number) => (
                          <tr key={s.id} className="border-b border-stone-800/60 hover:bg-stone-800/20 transition-colors">
                            <td className="p-3 text-stone-600 text-xs">{i + 1}</td>
                            <td className="p-3 text-stone-200 font-medium">{s.name}</td>
                            <td className="p-3">
                              <Badge label={s.is_active ? 'Ativo' : 'Inativo'} color={s.is_active ? 'green' : 'gray'} />
                            </td>
                            <td className="p-3">
                              {canManage && (
                              <div className="flex justify-end gap-1">
                                <button onClick={() => toggleActive(s)} title="Ativar/Desativar"
                                  className="text-stone-400 hover:text-stone-200 p-1 transition-colors">
                                  {s.is_active
                                    ? <ToggleRight size={16} className="text-emerald-400" />
                                    : <ToggleLeft size={16} />}
                                </button>
                                <button onClick={() => openEdit(s)}
                                  className="text-amber-400 hover:text-amber-300 p-1 transition-colors">
                                  <Edit size={15} />
                                </button>
                                <button onClick={() => remove(s.id)}
                                  className="text-red-400 hover:text-red-300 p-1 transition-colors">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Modal Novo / Editar Setor */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editItem?.id ? 'Editar Setor' : 'Novo Setor'} size="sm">
        {editItem && (
          <div className="space-y-4">
            <Input
              label="Nome *"
              value={editItem.name || ''}
              onChange={e => { setEditItem((i: any) => ({ ...i, name: e.target.value })); setError(''); }}
              placeholder="Digite o nome do setor..."
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-700 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={save} loading={saving}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function RegistriesPage({ user, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab));
  useEffect(() => { if (initialTab) setTab(resolveTab(initialTab)); }, [initialTab]);
  const [editItem, setEditItem] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trial = useTrialStatus();

  const { data: ministries, refetch: rMin } = useApi<Ministry[]>('/ministries');
  const { data: departments, refetch: rDept } = useApi<Department[]>('/departments');
  const { data: sectors, refetch: rSec } = useApi<Sector[]>('/sectors');
  const { data: cultTypes, refetch: rCT } = useApi<CultType[]>('/cult_types');

  const refetchMap: Record<Tab, () => void> = {
    ministries: rMin, departments: rDept, sectors: rSec, cult_types: rCT,
  };
  const dataMap: Record<Tab, any[]> = {
    ministries: ministries || [],
    departments: departments || [],
    sectors: sectors || [],
    cult_types: cultTypes || [],
  };
  const pathMap: Record<Tab, string> = {
    ministries: '/ministries', departments: '/departments',
    sectors: '/sectors', cult_types: '/cult_types',
  };

  function openNew() {
    setEditItem(tab === 'cult_types'
      ? { name: '', default_time: '', default_day: '' }
      : { name: '', is_active: 1 });
    setError('');
    setModalOpen(true);
  }

  async function save() {
    if (!editItem?.name?.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true); setError('');
    try {
      if (editItem.id) {
        await api.put(`${pathMap[tab]}/${editItem.id}`, editItem);
      } else {
        await api.post(pathMap[tab], editItem);
      }
      setModalOpen(false);
      refetchMap[tab]();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm('Excluir este item? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`${pathMap[tab]}/${id}`);
      refetchMap[tab]();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  async function toggleActive(item: any) {
    await api.put(`${pathMap[tab]}/${item.id}`, { ...item, is_active: item.is_active ? 0 : 1 });
    refetchMap[tab]();
  }


  const TABS: { id: Tab; label: string }[] = [
    { id: 'ministries', label: 'Ministérios' },
    { id: 'departments', label: 'Departamentos' },
    { id: 'sectors', label: 'Setores' },
    { id: 'cult_types', label: 'Tipos de Culto' },
  ];

  // ─── Trial bloqueado: mostra apenas tela de bloqueio ─────────────────────────
  if (trial.isExpired) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-stone-100">Cadastros</h1>
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-20 h-20 rounded-full bg-red-900/30 flex items-center justify-center">
            <ShieldOff className="text-red-400" size={40} />
          </div>
          <div className="text-center space-y-2">
            <p className="text-red-300 text-lg font-semibold">Sistema Bloqueado</p>
            <p className="text-stone-400 text-sm max-w-md">
              O período de avaliação expirou. Para continuar usando o EcclesiaScale, insira uma chave de ativação em <strong className="text-amber-400">Segurança → Ativar Sistema</strong>.
            </p>
          </div>
          <div className="bg-red-900/20 border border-red-700 rounded-xl px-6 py-4 text-center">
            <p className="text-red-300 text-xs">Entre em contato para obter sua chave de ativação.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Cadastros</h1>
        <div className="flex gap-2 flex-wrap">
          {tab !== 'sectors' && (
            <Button size="sm" onClick={openNew}>
              <Plus size={16} /> Novo
            </Button>
          )}
        </div>
      </div>

      {/* Banner Trial */}
      {trial.isTrial && !trial.isExpired && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${
          trial.daysLeft <= 3
            ? 'bg-red-900/30 border-red-700'
            : trial.daysLeft <= 7
            ? 'bg-amber-900/30 border-amber-700'
            : 'bg-stone-800 border-stone-600'
        }`}>
          {trial.daysLeft <= 7 ? (
            <AlertTriangle className={trial.daysLeft <= 3 ? 'text-red-400' : 'text-amber-400'} size={18} />
          ) : (
            <Clock className="text-stone-400" size={18} />
          )}
          <div className="flex-1">
            <p className={`text-sm font-medium ${trial.daysLeft <= 3 ? 'text-red-300' : trial.daysLeft <= 7 ? 'text-amber-300' : 'text-stone-300'}`}>
              Período de Avaliação
            </p>
            <p className={`text-xs mt-0.5 ${trial.daysLeft <= 3 ? 'text-red-400' : trial.daysLeft <= 7 ? 'text-amber-400' : 'text-stone-500'}`}>
              {trial.daysLeft === 0
                ? '⚠️ Último dia! Ative o sistema hoje.'
                : `Restam ${trial.daysLeft} dia(s) de avaliação gratuita.`}
              {' '}Acesse <strong>Segurança → Ativar Sistema</strong> para continuar sem interrupção.
            </p>
          </div>
          {/* Contador visual */}
          <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center ${
            trial.daysLeft <= 3 ? 'border-red-500 bg-red-900/30' :
            trial.daysLeft <= 7 ? 'border-amber-500 bg-amber-900/30' :
            'border-stone-500 bg-stone-800'
          }`}>
            <span className={`text-lg font-bold leading-none ${trial.daysLeft <= 3 ? 'text-red-300' : trial.daysLeft <= 7 ? 'text-amber-300' : 'text-stone-300'}`}>
              {trial.daysLeft}
            </span>
            <span className="text-xs text-stone-500 leading-none">dias</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-stone-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({dataMap[t.id].length})</span>
          </button>
        ))}
      </div>

      <div className="text-xs text-stone-500 px-1">
        {tab === 'ministries' && 'Gerencie os ministérios da igreja (Louvor, Homens, Mulheres, Família, etc.)'}
        {tab === 'departments' && 'Gerencie os departamentos (Família, Som, Infantil, Jovens, etc.)'}
        {tab === 'sectors' && 'Gerencie os setores de escala agrupados por departamento.'}
        {tab === 'cult_types' && 'Gerencie os tipos de culto com dia e horário padrão'}
      </div>

      {/* ─── Aba Setores: blocos por departamento ─────────────────────────── */}
      {tab === 'sectors' ? (
        <SectorsView
          sectors={sectors || []}
          departments={departments || []}
          onRefetch={rSec}
          user={user}
        />
      ) : (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700 bg-stone-800/50">
                <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Nome</th>
                {tab === 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Dia Padrão</th>}
                {tab === 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Horário</th>}
                {tab !== 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>}
                <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dataMap[tab].map((item: any, i: number) => (
                <tr key={item.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                  <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                  <td className="p-3 text-stone-200 font-medium">{item.name}</td>
                  {tab === 'cult_types' && (
                    <td className="p-3 text-stone-400 text-xs">
                      {item.default_day != null ? DIAS_SEMANA[item.default_day] : '—'}
                    </td>
                  )}
                  {tab === 'cult_types' && <td className="p-3 text-stone-400 text-xs">{item.default_time || '—'}</td>}
                  {tab !== 'cult_types' && (
                    <td className="p-3">
                      <Badge label={item.is_active ? 'Ativo' : 'Inativo'} color={item.is_active ? 'green' : 'gray'} />
                    </td>
                  )}
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {tab !== 'cult_types' && (
                        <button onClick={() => toggleActive(item)} title="Ativar/Desativar"
                          className="text-stone-400 hover:text-stone-200 p-1 transition-colors">
                          {item.is_active
                            ? <ToggleRight size={16} className="text-emerald-400" />
                            : <ToggleLeft size={16} />}
                        </button>
                      )}
                      <button onClick={() => { setEditItem({ ...item }); setError(''); setModalOpen(true); }}
                        className="text-amber-400 hover:text-amber-300 p-1 transition-colors">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(item.id)}
                        className="text-red-400 hover:text-red-300 p-1 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dataMap[tab].length === 0 && (
            <div className="py-10 text-center">
              <p className="text-stone-500 text-sm">Nenhum item cadastrado</p>
            </div>
          )}
        </div>
      </Card>
      )}

      {/* Modal Novo / Editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editItem?.id ? 'Editar Item' : 'Novo Item'} size="sm">
        {editItem && (
          <div className="space-y-4">
            <Input
              label="Nome *"
              value={editItem.name || ''}
              onChange={e => { setEditItem((i: any) => ({ ...i, name: e.target.value })); setError(''); }}
              placeholder="Digite o nome..."
              autoFocus
            />

            {tab === 'cult_types' && (
              <>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Dia padrão</label>
                  <select
                    value={editItem.default_day ?? ''}
                    onChange={e => setEditItem((i: any) => ({
                      ...i,
                      default_day: e.target.value === '' ? null : Number(e.target.value)
                    }))}
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
                    <option value="">Qualquer dia</option>
                    {DIAS_SEMANA.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Horário padrão"
                  type="time"
                  value={editItem.default_time || ''}
                  onChange={e => setEditItem((i: any) => ({ ...i, default_time: e.target.value }))}
                />
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-700 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={save} loading={saving}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
