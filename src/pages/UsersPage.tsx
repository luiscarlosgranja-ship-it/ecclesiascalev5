import { useState } from 'react';
import {
  Users, Shield, Search, Edit2, Trash2, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Loader2, Mail,
  KeyRound, Clock, UserCheck,
} from 'lucide-react';
import { Card, Button, Badge, Modal } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, Role } from '../types';

interface Props { user: AuthUser; }

interface UserRow {
  id: number;
  email: string;
  role: Role;
  is_active: boolean;
  last_login: string | null;
  must_change_password: boolean;
  created_at: string;
  member_id: number | null;
  member_name: string | null;
}

const ROLES: Role[] = ['SuperAdmin', 'Admin', 'Líder', 'Membro', 'Secretaria'];

const ROLE_COLOR: Record<string, 'red' | 'yellow' | 'blue' | 'green' | 'gray'> = {
  SuperAdmin: 'red',
  Admin:      'yellow',
  Líder:      'blue',
  Membro:     'green',
  Secretaria: 'gray',
};

const ROLE_DESC: Record<string, string> = {
  SuperAdmin: 'Acesso total + gerador de chaves',
  Admin:      'Gestão geral, backup, reset de senhas',
  Líder:      'Escalas, membros do depto, trocas',
  Membro:     'Cultos, trocas, meu painel, gabinete',
  Secretaria: 'Apenas Gabinete Pastoral',
};

export default function UsersPage({ user }: Props) {
  const { data: users, loading, refetch } = useApi<UserRow[]>('/users');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [target, setTarget] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<Role>('Membro');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  function openEdit(u: UserRow) {
    setTarget(u); setEditRole(u.role); setEditActive(u.is_active);
    setError(''); setEditModal(true);
  }
  function openDelete(u: UserRow) { setTarget(u); setDeleteModal(true); }
  function openReset(u: UserRow)  { setTarget(u); setResetModal(true); }

  async function saveEdit() {
    if (!target) return;
    setSaving(true); setError('');
    try {
      await api.put(`/users/${target.id}/role`, { role: editRole, is_active: editActive });
      setEditModal(false);
      setSuccessMsg('Usuário atualizado com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!target) return;
    try {
      await api.delete(`/users/${target.id}`);
      setDeleteModal(false);
      setSuccessMsg('Conta removida.');
      setTimeout(() => setSuccessMsg(''), 3000);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  async function confirmReset() {
    if (!target) return;
    setSaving(true);
    try {
      await api.post(`/users/${target.id}/reset-password`, {});
      setResetModal(false);
      setSuccessMsg(`Senha redefinida e e-mail enviado para ${target.email}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao redefinir');
    } finally { setSaving(false); }
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const filtered = (users || []).filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.member_name || '').toLowerCase().includes(search.toLowerCase());
    const matchRole   = filterRole === 'all' || u.role === filterRole;
    const matchActive = filterActive === 'all' ||
      (filterActive === 'active' ? u.is_active : !u.is_active);
    return matchSearch && matchRole && matchActive;
  });

  const counts = {
    total:    (users || []).length,
    active:   (users || []).filter(u => u.is_active).length,
    inactive: (users || []).filter(u => !u.is_active).length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
          <Users size={20} className="text-amber-400" /> Gerenciamento de Usuários
        </h1>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {successMsg && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-200 text-sm">{successMsg}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">Total</p>
          <p className="text-2xl font-bold text-stone-200">{counts.total}</p>
          <p className="text-xs text-stone-500">usuários cadastrados</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">Ativos</p>
          <p className="text-2xl font-bold text-emerald-300">{counts.active}</p>
          <p className="text-xs text-stone-500">com acesso</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">Inativos</p>
          <p className="text-2xl font-bold text-red-300">{counts.inactive}</p>
          <p className="text-xs text-stone-500">sem acesso</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full bg-stone-800 border border-stone-600 rounded-lg pl-8 pr-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)}
            className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
            <option value="all">Todos os roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)}
            className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-amber-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Users size={36} className="text-stone-700 mb-3" />
            <p className="text-stone-500 text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-700 bg-stone-800/50">
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Usuário</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Role</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs hidden md:table-cell">Último acesso</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs hidden lg:table-cell">Criado em</th>
                  <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                  <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className={`border-b border-stone-800 hover:bg-stone-800/30 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="p-3">
                      <div>
                        <p className="text-stone-200 font-medium">
                          {u.member_name || <span className="text-stone-500 italic">Sem membro</span>}
                        </p>
                        <p className="text-stone-500 text-xs flex items-center gap-1 mt-0.5">
                          <Mail size={10} /> {u.email}
                        </p>
                        {u.must_change_password && (
                          <span className="text-xs text-orange-400 flex items-center gap-1 mt-0.5">
                            <KeyRound size={10} /> Troca de senha pendente
                          </span>
                        )}
                        {u.id === user.id && (
                          <span className="text-xs text-amber-400">(você)</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge color={ROLE_COLOR[u.role] || 'gray'}>{u.role}</Badge>
                    </td>
                    <td className="p-3 text-stone-500 text-xs hidden md:table-cell">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {formatDate(u.last_login)}
                      </span>
                    </td>
                    <td className="p-3 text-stone-500 text-xs hidden lg:table-cell">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="p-3">
                      {u.is_active
                        ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={12} /> Ativo</span>
                        : <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={12} /> Inativo</span>
                      }
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} title="Editar role / status"
                          className="text-stone-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openReset(u)} title="Redefinir senha"
                          className="text-stone-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors">
                          <Shield size={14} />
                        </button>
                        {u.id !== user.id && (
                          <button onClick={() => openDelete(u)} title="Remover conta"
                            className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-stone-700 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-stone-600 text-right px-4 py-2">{filtered.length} de {counts.total} usuários</p>
          </div>
        )}
      </Card>

      {/* Role Legend */}
      <Card className="p-4">
        <p className="text-xs text-stone-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <UserCheck size={13} /> Legenda de Roles
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLES.map(r => (
            <div key={r} className="flex items-start gap-2 p-2 rounded-lg bg-stone-800/40">
              <Badge color={ROLE_COLOR[r] || 'gray'}>{r}</Badge>
              <p className="text-xs text-stone-500 mt-0.5">{ROLE_DESC[r]}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Edit Modal ── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Editar Usuário" size="md">
        {target && (
          <div className="space-y-4">
            <div className="bg-stone-800/50 rounded-lg p-3 border border-stone-700">
              <p className="text-stone-200 font-medium">{target.member_name || target.email}</p>
              <p className="text-stone-500 text-xs mt-0.5">{target.email}</p>
            </div>

            <div>
              <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Role *</label>
              <div className="grid grid-cols-1 gap-2">
                {ROLES.map(r => (
                  <button key={r} onClick={() => setEditRole(r)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      editRole === r
                        ? 'bg-amber-500/15 border-amber-500/50'
                        : 'bg-stone-800/40 border-stone-700 hover:border-stone-500'
                    } ${r === 'SuperAdmin' && target.id === user.id ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={r === 'SuperAdmin' && target.id === user.id}>
                    <Badge color={ROLE_COLOR[r] || 'gray'}>{r}</Badge>
                    <p className="text-xs text-stone-400 mt-0.5">{ROLE_DESC[r]}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-stone-800/50 rounded-lg border border-stone-700">
              <div>
                <p className="text-stone-200 text-sm font-medium">Conta Ativa</p>
                <p className="text-stone-500 text-xs">Usuário pode fazer login</p>
              </div>
              <button onClick={() => setEditActive(!editActive)}
                className={`relative w-10 h-5 rounded-full transition-colors ${editActive ? 'bg-emerald-500' : 'bg-stone-600'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${editActive ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-red-200 text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setEditModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={saveEdit} loading={saving}>Salvar Alterações</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reset Password Modal ── */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Redefinir Senha" size="sm">
        {target && (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4">
              <p className="text-stone-200 text-sm">
                Será gerada uma senha temporária para <strong className="text-blue-300">{target.member_name || target.email}</strong> e enviada por e-mail.
              </p>
              <p className="text-stone-500 text-xs mt-2">O usuário precisará criar uma nova senha no próximo acesso.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setResetModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={confirmReset} loading={saving}>
                <Shield size={14} /> Redefinir e Enviar E-mail
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remover Conta" size="sm">
        {target && (
          <div className="space-y-4">
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
              <p className="text-stone-200 text-sm">
                Deseja remover a conta de <strong className="text-red-300">{target.member_name || target.email}</strong>?
              </p>
              <p className="text-stone-500 text-xs mt-2">O registro do membro é mantido. Apenas o acesso ao sistema será removido.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteModal(false)}>Cancelar</Button>
              <Button variant="danger" onClick={confirmDelete}>Remover Conta</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
