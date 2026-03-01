import { useState, useMemo, useEffect } from 'react';
import { Search, SortAsc, Filter, Plus, Edit, UserX, UserCheck, KeyRound, MessageSquare, Loader2, UserMinus, Copy, Check } from 'lucide-react';
import { Card, Button, Modal, Badge, Input, Select } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import type { AuthUser, Member, Department, Ministry, CultType } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';

interface Props { user: AuthUser; }
type Tab = 'active' | 'deactivated';

export default function MembersPage({ user }: Props) {
  const { data: members, loading, refetch } = useApi<Member[]>('/members');
  const { data: departments } = useApi<Department[]>('/departments');
  const { data: ministries } = useApi<Ministry[]>('/ministries');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [sortAlpha, setSortAlpha] = useState(false);
  const [filterDept, setFilterDept] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editMember, setEditMember] = useState<Partial<Member> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pwModal, setPwModal] = useState<number | null>(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ─── Modal de credenciais geradas ───────────────────────────────────────────
  const [credModal, setCredModal] = useState(false);
  const [credInfo, setCredInfo] = useState<{ email: string; password: string } | null>(null);

  // ─── Modal de confirmação de desativação / reativação ───────────────────────
  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null);
  const [deactivateModal, setDeactivateModal] = useState(false);

  // ─── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('members-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        () => { refetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  // ─── Membros ativos e desativados ───────────────────────────────────────────
  const activeMembers = useMemo(() => (members || []).filter(m => m.is_active), [members]);
  const deactivatedMembers = useMemo(() => (members || []).filter(m => !m.is_active), [members]);

  const filtered = useMemo(() => {
    let list = tab === 'active' ? activeMembers : deactivatedMembers;
    if (search) list = list.filter(m =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
    );
    if (filterDept.length > 0) list = list.filter(m => m.department_id && filterDept.includes(m.department_id));
    if (isLeader(user.role) && !isAdmin(user.role) && user.member_id) {
      const myDept = members?.find(m => m.id === user.member_id)?.department_id;
      if (myDept) list = list.filter(m => m.department_id === myDept);
    }
    if (sortAlpha) list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [members, tab, search, filterDept, sortAlpha, user, activeMembers, deactivatedMembers]);

  function openNew() {
    setEditMember({ role: 'Membro', status: 'Ativo', availability: {}, is_active: 1, ministries: [] });
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditMember({ ...m });
    setModalOpen(true);
  }

  async function saveMember() {
    if (!editMember?.name) return;
    setSaving(true); setError('');
    try {
      if (editMember.id) {
        await api.put(`/members/${editMember.id}`, editMember);
        setModalOpen(false);
        refetch();
      } else {
        const res = await api.post<{
          id: number; message: string;
          user_created?: boolean; default_password?: string;
        }>('/members', editMember);
        setModalOpen(false);
        refetch();
        // ✅ Se um acesso foi criado, exibe as credenciais ao Admin
        if (res.user_created && res.default_password && editMember.email) {
          setCredInfo({ email: editMember.email, password: res.default_password });
          setCredModal(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  // ─── Abre modal de confirmação de desativação / reativação ──────────────────
  function askToggleActive(m: Member) {
    setDeactivateTarget(m);
    setDeactivateModal(true);
  }

  // ─── Confirma desativação / reativação ──────────────────────────────────────
  async function confirmToggleActive() {
    if (!deactivateTarget) return;
    setSaving(true);
    try {
      const isDeactivating = !!deactivateTarget.is_active;
      await api.put(`/members/${deactivateTarget.id}`, {
        ...deactivateTarget,
        is_active: isDeactivating ? 0 : 1,
        status: isDeactivating ? 'Inativo' : 'Ativo',
        // Envia data e responsável pela desativação
        deactivated_at: isDeactivating ? new Date().toISOString() : null,
        deactivated_by: isDeactivating ? (user.name || user.email) : null,
      });
      setDeactivateModal(false);
      setDeactivateTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar membro');
    } finally { setSaving(false); }
  }

  async function changePassword() {
    if (newPw !== confirmPw) { setError('Senhas não coincidem'); return; }
    if (newPw.length < 8) { setError('Mínimo 8 caracteres'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/users/${pwModal}/password`, { password: newPw });
      setPwModal(null); setNewPw(''); setConfirmPw('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally { setSaving(false); }
  }

  function sendWhatsApp(m: Member) {
    if (!m.whatsapp) return;
    const phone = m.whatsapp.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá ${m.name}! Você foi escalado. Confirme sua presença no sistema EcclesiaScale.`);
    window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${msg}`, '_blank');
  }

  function formatDate(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-stone-100">Voluntários</h1>
        {(isAdmin(user.role) || isLeader(user.role)) && (
          <Button onClick={openNew} size="sm"><Plus size={16} />Novo Voluntário</Button>
        )}
      </div>

      {/* Tabs Ativos / Desativados */}
      <div className="flex border-b border-stone-700">
        <button onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${tab === 'active' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          Ativos
          <span className="ml-1.5 text-xs opacity-60">({activeMembers.length})</span>
        </button>
        <button onClick={() => setTab('deactivated')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${tab === 'deactivated' ? 'border-red-500 text-red-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <UserMinus size={14} /> Desativados
          <span className="text-xs opacity-60">({deactivatedMembers.length})</span>
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
          <input
            type="text" placeholder="Buscar voluntário..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-4 py-2 text-stone-200 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          onClick={() => setSortAlpha(!sortAlpha)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${sortAlpha ? 'bg-amber-600/20 border-amber-600/40 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400'}`}
        >
          <SortAsc size={15} /> A-Z
        </button>
        <button
          onClick={() => setFilterOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${filterDept.length > 0 ? 'bg-amber-600/20 border-amber-600/40 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400'}`}
        >
          <Filter size={15} /> Filtros {filterDept.length > 0 && `(${filterDept.length})`}
        </button>
      </div>

      {/* Tabela Ativos */}
      {tab === 'active' && (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-amber-500" size={24} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-700 bg-stone-800/50">
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Nome</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">E-mail</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs hidden md:table-cell">WhatsApp</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs hidden lg:table-cell">Departamento</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs hidden lg:table-cell">Ministérios</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Nível</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                    {isAdmin(user.role) && <th className="text-left p-3 text-stone-400 font-medium text-xs">Cadastro</th>}
                    <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={m.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                      <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                      <td className="p-3 text-stone-200 font-medium">{m.name}</td>
                      <td className="p-3 text-stone-400 text-xs">{m.email || '—'}</td>
                      <td className="p-3 text-stone-400 text-xs hidden md:table-cell">{m.whatsapp || '—'}</td>
                      <td className="p-3 text-stone-400 text-xs hidden lg:table-cell">{m.department_name || '—'}</td>
                      <td className="p-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(m.ministries || []).slice(0, 2).map(min => (
                            <span key={min.id} className="px-1.5 py-0.5 bg-stone-800 border border-stone-600 rounded text-xs text-stone-400">{min.name}</span>
                          ))}
                          {(m.ministries || []).length > 2 && (
                            <span className="px-1.5 py-0.5 text-xs text-stone-500">+{(m.ministries || []).length - 2}</span>
                          )}
                          {(m.ministries || []).length === 0 && <span className="text-stone-600 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge label={m.role} color={m.role === 'Admin' || m.role === 'SuperAdmin' ? 'red' : m.role === 'Líder' ? 'blue' : 'gray'} />
                      </td>
                      <td className="p-3">
                        <Badge label={m.status} color={m.status === 'Ativo' ? 'green' : 'gray'} />
                      </td>
                      {isAdmin(user.role) && (
                        <td className="p-3 text-stone-500 text-xs">{m.created_at?.slice(0, 10) || '—'}</td>
                      )}
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {m.whatsapp && (
                            <button onClick={() => sendWhatsApp(m)} title="Notificar via WhatsApp" className="text-emerald-500 hover:text-emerald-400 p-1 transition-colors">
                              <MessageSquare size={15} />
                            </button>
                          )}
                          {(isAdmin(user.role) || isLeader(user.role)) && (
                            <>
                              <button onClick={() => openEdit(m)} className="text-amber-400 hover:text-amber-300 p-1 transition-colors" title="Editar"><Edit size={15} /></button>
                              <button onClick={() => askToggleActive(m)} title="Desativar" className="text-red-400 hover:text-red-300 p-1 transition-colors"><UserX size={15} /></button>
                            </>
                          )}
                          {isAdmin(user.role) && (
                            <button onClick={() => { setPwModal(m.id); setError(''); }} className="text-blue-400 hover:text-blue-300 p-1 transition-colors" title="Alterar senha"><KeyRound size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center text-stone-500 text-sm py-10">Nenhum voluntário ativo encontrado</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Tabela Desativados */}
      {tab === 'deactivated' && (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-amber-500" size={24} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-700 bg-stone-800/50">
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Nome</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">E-mail</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs hidden md:table-cell">Departamento</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Data Desativação</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Desativado por</th>
                    <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => (
                    <tr key={m.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors opacity-75">
                      <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                      <td className="p-3 text-stone-300 font-medium">{m.name}</td>
                      <td className="p-3 text-stone-500 text-xs">{m.email || '—'}</td>
                      <td className="p-3 text-stone-500 text-xs hidden md:table-cell">{m.department_name || '—'}</td>
                      <td className="p-3 text-stone-400 text-xs">{formatDate(m.deactivated_at)}</td>
                      <td className="p-3 text-stone-400 text-xs">{m.deactivated_by || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {(isAdmin(user.role) || isLeader(user.role)) && (
                            <button onClick={() => askToggleActive(m)} title="Reativar membro"
                              className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                              <UserCheck size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center text-stone-500 text-sm py-10">Nenhum voluntário desativado</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Modal: Confirmar Desativação / Reativação */}
      <Modal
        open={deactivateModal}
        onClose={() => { setDeactivateModal(false); setDeactivateTarget(null); }}
        title={deactivateTarget?.is_active ? '⚠️ Desativar Voluntário' : '✅ Reativar Voluntário'}
        size="sm"
      >
        {deactivateTarget && (
          <div className="space-y-4">
            {deactivateTarget.is_active ? (
              <>
                <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 space-y-2">
                  <p className="text-stone-200 text-sm font-medium">
                    Deseja realmente desativar <span className="text-red-300">{deactivateTarget.name}</span>?
                  </p>
                  <p className="text-stone-400 text-xs">
                    O voluntário será movido para a aba <strong className="text-stone-300">Desativados</strong> e não aparecerá mais nas escalas. Esta ação pode ser revertida a qualquer momento.
                  </p>
                </div>
                <div className="text-xs text-stone-500 space-y-1">
                  <p>📅 Data: <span className="text-stone-400">{new Date().toLocaleDateString('pt-BR')}</span></p>
                  <p>👤 Responsável: <span className="text-stone-400">{user.name || user.email}</span></p>
                </div>
              </>
            ) : (
              <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-xl p-4 space-y-2">
                <p className="text-stone-200 text-sm font-medium">
                  Deseja reativar <span className="text-emerald-300">{deactivateTarget.name}</span>?
                </p>
                <p className="text-stone-400 text-xs">
                  O voluntário voltará a aparecer na lista de ativos e poderá ser escalado normalmente.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setDeactivateModal(false); setDeactivateTarget(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={confirmToggleActive}
                loading={saving}
              >
                {deactivateTarget.is_active ? 'Sim, desativar' : 'Sim, reativar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Filtrar por Departamento */}
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrar por Departamento" size="sm">
        <div className="space-y-2">
          {(departments || []).map(d => (
            <label key={d.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-stone-800 transition-colors">
              <input
                type="checkbox"
                checked={filterDept.includes(d.id)}
                onChange={e => setFilterDept(prev => e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id))}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-stone-200 text-sm">{d.name}</span>
            </label>
          ))}
          <div className="flex gap-2 pt-3">
            <Button variant="outline" size="sm" onClick={() => setFilterDept([])}>Limpar</Button>
            <Button size="sm" onClick={() => setFilterOpen(false)}>Aplicar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar / Novo Voluntário */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editMember?.id ? 'Editar Voluntário' : 'Novo Voluntário'} size="lg">
        {editMember && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome *" value={editMember.name || ''} onChange={e => setEditMember(m => ({ ...m!, name: e.target.value }))} />
              <Input label="E-mail" type="email" value={editMember.email || ''} onChange={e => setEditMember(m => ({ ...m!, email: e.target.value }))} />
              <Input label="WhatsApp" value={editMember.whatsapp || ''} onChange={e => setEditMember(m => ({ ...m!, whatsapp: e.target.value }))} placeholder="(11) 99999-0000" />
              <Select
                label="Nível de Acesso"
                value={editMember.role || 'Membro'}
                onChange={e => setEditMember(m => ({ ...m!, role: e.target.value as any }))}
                options={[
                  { value: 'Membro', label: 'Membro' },
                  { value: 'Líder', label: 'Líder' },
                  ...(isAdmin(user.role) ? [{ value: 'Admin', label: 'Admin' }] : []),
                ]}
              />
              <Select
                label="Departamento"
                value={editMember.department_id || ''}
                onChange={e => setEditMember(m => ({ ...m!, department_id: Number(e.target.value) }))}
                placeholder="Selecionar..."
                options={(departments || []).map(d => ({ value: d.id, label: d.name }))}
              />
              <Select
                label="Status"
                value={editMember.status || 'Ativo'}
                onChange={e => setEditMember(m => ({ ...m!, status: e.target.value as any }))}
                options={[{ value: 'Ativo', label: 'Ativo' }, { value: 'Inativo', label: 'Inativo' }]}
              />
            </div>

            {/* Ministérios */}
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Ministérios</label>
              {(ministries || []).length === 0 ? (
                <p className="text-stone-600 text-xs">Nenhum ministério cadastrado. Acesse Cadastros → Ministérios.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(ministries || []).map(min => {
                    const selected = editMember.ministries?.some(mm => mm.id === min.id);
                    return (
                      <button
                        key={min.id}
                        type="button"
                        onClick={() => {
                          const curr = editMember.ministries || [];
                          setEditMember(m => ({
                            ...m!,
                            ministries: selected ? curr.filter(mm => mm.id !== min.id) : [...curr, min]
                          }));
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${selected ? 'bg-amber-600/20 border-amber-500 text-amber-300' : 'bg-stone-800 border-stone-600 text-stone-400 hover:border-stone-500'}`}
                      >
                        {min.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Disponibilidade */}
            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Disponibilidade</label>
              {(cultTypes || []).length === 0 ? (
                <p className="text-stone-600 text-xs">Nenhum tipo de culto cadastrado. Acesse Cadastros → Tipos de Culto.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {(cultTypes || []).map(ct => (
                    <label key={ct.id} className="flex items-center gap-2 cursor-pointer bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 hover:border-amber-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={!!(editMember.availability?.[ct.id])}
                        onChange={e => setEditMember(m => ({ ...m!, availability: { ...m!.availability, [ct.id]: e.target.checked } }))}
                        className="w-3.5 h-3.5 accent-amber-500"
                      />
                      <span className="text-stone-300 text-xs leading-tight">{ct.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={saveMember} loading={saving}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Credenciais do novo voluntário */}
      <Modal open={credModal} onClose={() => setCredModal(false)} title="🔐 Acesso Criado!" size="sm">
        {credInfo && (
          <div className="space-y-4">
            <p className="text-stone-400 text-sm">
              O acesso foi criado automaticamente. Repasse as credenciais abaixo ao voluntário e oriente-o a trocar a senha no primeiro acesso.
            </p>
            <div className="bg-stone-800 border border-stone-700 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-stone-500 text-xs uppercase tracking-wide mb-1">E-mail</p>
                <p className="text-stone-200 text-sm font-medium">{credInfo.email}</p>
              </div>
              <div>
                <p className="text-stone-500 text-xs uppercase tracking-wide mb-1">Senha inicial</p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-amber-300 font-mono text-sm">{credInfo.password}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`E-mail: ${credInfo.email}\nSenha: ${credInfo.password}`);
                    }}
                    className="text-stone-400 hover:text-stone-200 transition-colors p-1"
                    title="Copiar credenciais"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2 text-xs text-amber-300">
              ⚠️ Esta senha só é exibida uma vez. Copie e repasse ao voluntário agora.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCredModal(false)}>Fechar</Button>
              <Button onClick={() => {
                navigator.clipboard.writeText(`E-mail: ${credInfo.email}\nSenha: ${credInfo.password}`);
              }}>
                <Copy size={15} /> Copiar Credenciais
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Alterar Senha */}
      <Modal open={!!pwModal} onClose={() => { setPwModal(null); setError(''); }} title="Alterar Senha" size="sm">
        <div className="space-y-4">
          <Input label="Nova Senha" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <Input label="Confirmar Senha" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPwModal(null)}>Cancelar</Button>
            <Button onClick={changePassword} loading={saving}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
