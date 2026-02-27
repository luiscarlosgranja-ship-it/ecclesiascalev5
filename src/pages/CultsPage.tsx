import { useState } from 'react';
import { Plus, Edit, Ban, History, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Input } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, Cult, CultType } from '../types';
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { user: AuthUser; }

export default function CultsPage({ user }: Props) {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [generateModal, setGenerateModal] = useState(false);
  const [editModal, setEditModal] = useState<Partial<Cult> | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: cults, refetch } = useApi<Cult[]>('/cults');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const active = (cults || []).filter(c => c.status !== 'Cancelado');
  const history = (cults || []).filter(c => c.status === 'Cancelado' || c.status === 'Realizado');

  async function generateMonth() {
    if (selectedTypes.length === 0) { setError('Selecione ao menos um tipo de culto'); return; }
    setGenerating(true); setError('');
    try {
      await api.post('/cults/generate-month', {
        month: format(selectedMonth, 'yyyy-MM'),
        cult_type_ids: selectedTypes,
      });
      setGenerateModal(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar');
    } finally { setGenerating(false); }
  }

  async function cancelCult(id: number) {
    if (!confirm('Cancelar este culto?')) return;
    await api.put(`/cults/${id}`, { status: 'Cancelado' });
    refetch();
  }

  async function saveCult() {
    if (!editModal) return;
    setSaving(true); setError('');
    try {
      if (editModal.id) {
        await api.put(`/cults/${editModal.id}`, editModal);
      } else {
        await api.post('/cults', editModal);
      }
      setEditModal(null); refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Cultos / Eventos</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setGenerateModal(true); setError(''); }}>
            <Calendar size={16} /> Gerar Mês
          </Button>
          <Button size="sm" onClick={() => setEditModal({ status: 'Agendado' })}>
            <Plus size={16} /> Novo Culto
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-700">
        <button onClick={() => setActiveTab('active')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'active' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          Eventos Ativos
        </button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'history' ? 'border-amber-500 text-amber-400' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
          <History size={14} /> Histórico
        </button>
      </div>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700 bg-stone-800/50">
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Nome</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Data</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Horário</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'active' ? active : history).map(c => (
                <tr key={c.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                  <td className="p-3 text-stone-200">{c.name || c.type_name}</td>
                  <td className="p-3 text-stone-400 text-xs">{c.date}</td>
                  <td className="p-3 text-stone-400 text-xs">{c.time}</td>
                  <td className="p-3">
                    <Badge
                      label={c.status}
                      color={c.status === 'Agendado' ? 'blue' : c.status === 'Confirmado' ? 'green' : c.status === 'Cancelado' ? 'red' : 'gray'}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {activeTab === 'active' && (
                        <>
                          <button onClick={() => setEditModal(c)} className="text-amber-400 hover:text-amber-300 p-1 transition-colors"><Edit size={15} /></button>
                          <button onClick={() => cancelCult(c.id)} className="text-red-400 hover:text-red-300 p-1 transition-colors"><Ban size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(activeTab === 'active' ? active : history).length === 0 && (
            <p className="text-center text-stone-500 text-sm py-10">Nenhum evento</p>
          )}
        </div>
      </Card>

      {/* Generate Month Modal */}
      <Modal open={generateModal} onClose={() => setGenerateModal(false)} title="Gerar Cultos do Mês" size="md">
        <div className="space-y-5">
          {/* Month picker */}
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Mês de Referência</label>
            <div className="flex items-center gap-3 bg-stone-800 border border-stone-700 rounded-xl p-4">
              <button onClick={() => setSelectedMonth(prev => subMonths(prev, 1))} className="text-stone-400 hover:text-stone-200 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <p className="flex-1 text-center text-stone-200 font-medium">
                {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
              </p>
              <button onClick={() => setSelectedMonth(prev => addMonths(prev, 1))} className="text-stone-400 hover:text-stone-200 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Cult type selection */}
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Tipos de Culto</label>
            <div className="space-y-2">
              {(cultTypes || []).map(ct => (
                <label key={ct.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-stone-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(ct.id)}
                    onChange={e => setSelectedTypes(prev => e.target.checked ? [...prev, ct.id] : prev.filter(id => id !== ct.id))}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-stone-200 text-sm">{ct.name}</span>
                  {ct.default_time && <span className="text-stone-500 text-xs ml-auto">{ct.default_time}</span>}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setSelectedTypes((cultTypes || []).map(ct => ct.id))} className="text-amber-400 text-xs hover:text-amber-300 transition-colors">
                Selecionar todos
              </button>
              <span className="text-stone-600 text-xs">•</span>
              <button onClick={() => setSelectedTypes([])} className="text-stone-500 text-xs hover:text-stone-400 transition-colors">
                Limpar
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setGenerateModal(false)}>Cancelar</Button>
            <Button onClick={generateMonth} loading={generating}>Gerar Cultos</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Cult Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.id ? 'Editar Culto' : 'Novo Culto'} size="md">
        {editModal && (
          <div className="space-y-4">
            <Select
              label="Tipo de Culto"
              value={editModal.type_id || ''}
              onChange={e => setEditModal(m => ({ ...m!, type_id: Number(e.target.value) }))}
              placeholder="Selecionar tipo..."
              options={(cultTypes || []).map(ct => ({ value: ct.id, label: ct.name }))}
            />
            <Input label="Nome (opcional)" value={editModal.name || ''} onChange={e => setEditModal(m => ({ ...m!, name: e.target.value }))} placeholder="Ex: Culto Temático" />
            <Input label="Data *" type="date" value={editModal.date || ''} onChange={e => setEditModal(m => ({ ...m!, date: e.target.value }))} />
            <Input label="Horário *" type="time" value={editModal.time || ''} onChange={e => setEditModal(m => ({ ...m!, time: e.target.value }))} />
            {editModal.id && (
              <Select
                label="Status"
                value={editModal.status || 'Agendado'}
                onChange={e => setEditModal(m => ({ ...m!, status: e.target.value as any }))}
                options={[
                  { value: 'Agendado', label: 'Agendado' },
                  { value: 'Confirmado', label: 'Confirmado' },
                  { value: 'Cancelado', label: 'Cancelado' },
                ]}
              />
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button onClick={saveCult} loading={saving}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
