import { useState } from 'react';
import { Plus, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, Button, Modal, Input, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, Ministry, Department, Sector, CultType } from '../types';

interface Props { user: AuthUser; }
type Tab = 'ministries' | 'departments' | 'sectors' | 'cult_types';

const DEPT_ICONS = ['Users', 'Volume2', 'Baby', 'Heart', 'Zap', 'Shield', 'Home', 'Monitor', 'Music', 'Star'];

export default function RegistriesPage({ user }: Props) {
  const [tab, setTab] = useState<Tab>('ministries');
  const [editItem, setEditItem] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    setEditItem(tab === 'cult_types' ? { name: '', default_time: '' } : { name: '', icon: '', is_active: 1 });
    setModalOpen(true);
  }

  async function save() {
    if (!editItem?.name) return;
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
    if (!confirm('Excluir este item?')) return;
    await api.delete(`${pathMap[tab]}/${id}`);
    refetchMap[tab]();
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Cadastros</h1>
        <Button size="sm" onClick={openNew}><Plus size={16} />Novo</Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700 bg-stone-800/50">
                <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Nome</th>
                {tab !== 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Ícone</th>}
                {tab === 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Horário</th>}
                {tab !== 'cult_types' && <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>}
                <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dataMap[tab].map((item: any, i: number) => (
                <tr key={item.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                  <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                  <td className="p-3 text-stone-200">{item.name}</td>
                  {tab !== 'cult_types' && <td className="p-3 text-stone-400 text-xs">{item.icon || '—'}</td>}
                  {tab === 'cult_types' && <td className="p-3 text-stone-400 text-xs">{item.default_time || '—'}</td>}
                  {tab !== 'cult_types' && (
                    <td className="p-3">
                      <Badge label={item.is_active ? 'Ativo' : 'Inativo'} color={item.is_active ? 'green' : 'gray'} />
                    </td>
                  )}
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {tab !== 'cult_types' && (
                        <button onClick={() => toggleActive(item)} title="Ativar/Desativar" className="text-stone-400 hover:text-stone-200 p-1 transition-colors">
                          {item.is_active ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                        </button>
                      )}
                      <button onClick={() => { setEditItem(item); setModalOpen(true); }} className="text-amber-400 hover:text-amber-300 p-1 transition-colors"><Edit size={15} /></button>
                      <button onClick={() => remove(item.id)} className="text-red-400 hover:text-red-300 p-1 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dataMap[tab].length === 0 && (
            <p className="text-center text-stone-500 text-sm py-10">Nenhum item cadastrado</p>
          )}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem?.id ? 'Editar' : 'Novo Item'} size="sm">
        {editItem && (
          <div className="space-y-4">
            <Input label="Nome *" value={editItem.name || ''} onChange={e => setEditItem((i: any) => ({ ...i, name: e.target.value }))} />
            {tab !== 'cult_types' && (
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {DEPT_ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setEditItem((i: any) => ({ ...i, icon }))}
                      className={`px-2 py-1 text-xs rounded border transition-all ${editItem.icon === icon ? 'bg-amber-600/20 border-amber-500 text-amber-300' : 'bg-stone-800 border-stone-600 text-stone-400'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === 'cult_types' && (
              <>
                <Input label="Horário padrão" type="time" value={editItem.default_time || ''} onChange={e => setEditItem((i: any) => ({ ...i, default_time: e.target.value }))} />
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Dia padrão</label>
                  <select value={editItem.default_day ?? ''} onChange={e => setEditItem((i: any) => ({ ...i, default_day: Number(e.target.value) }))}
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
                    <option value="">Qualquer</option>
                    {['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
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
