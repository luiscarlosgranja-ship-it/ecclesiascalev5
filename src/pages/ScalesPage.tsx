import { useState } from 'react';
import { Plus, Printer, Zap, Trash2, CheckCircle, Repeat, ChevronDown } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import type { AuthUser, Scale, Cult, Member, Sector } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';
import { exportScalePDF } from '../utils/pdf';

interface Props { user: AuthUser; }

export default function ScalesPage({ user }: Props) {
  const [selectedCult, setSelectedCult] = useState<number | null>(null);
  const [autoModal, setAutoModal] = useState(false);
  const [autoType, setAutoType] = useState<'month' | 'standard' | 'thematic'>('month');
  const [addModal, setAddModal] = useState(false);
  const [newScale, setNewScale] = useState({ member_id: '', sector_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: cults } = useApi<Cult[]>('/cults?status=Agendado');
  const { data: scales, refetch: refetchScales } = useApi<Scale[]>(selectedCult ? `/scales?cult_id=${selectedCult}` : null, [selectedCult]);
  const { data: members } = useApi<Member[]>('/members?is_active=1');
  const { data: sectors } = useApi<Sector[]>('/sectors?is_active=1');

  // Filter cults by dept for leaders
  const availableCults = cults || [];

  async function generateAuto() {
    if (!selectedCult && autoType !== 'month') { setError('Selecione um culto'); return; }
    setSaving(true); setError('');
    try {
      const payload = autoType === 'month'
        ? { type: 'month', month: new Date().toISOString().slice(0, 7) }
        : { type: autoType, cult_id: selectedCult };
      await api.post('/scales/auto-generate', payload);
      setAutoModal(false);
      refetchScales();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar escala');
    } finally { setSaving(false); }
  }

  async function confirmScale(id: number) {
    await api.put(`/scales/${id}/confirm`, {});
    refetchScales();
  }

  async function removeScale(id: number) {
    if (!confirm('Remover desta escala? O membro ficará disponível novamente.')) return;
    await api.delete(`/scales/${id}`);
    refetchScales();
  }

  async function addToScale() {
    if (!selectedCult || !newScale.member_id || !newScale.sector_id) return;
    setSaving(true); setError('');
    try {
      await api.post('/scales', { cult_id: selectedCult, member_id: Number(newScale.member_id), sector_id: Number(newScale.sector_id) });
      setAddModal(false);
      setNewScale({ member_id: '', sector_id: '' });
      refetchScales();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally { setSaving(false); }
  }

  async function requestSwap(scaleId: number) {
    const suggested = prompt('E-mail do voluntário para troca (opcional):');
    try {
      await api.post('/swaps', { scale_id: scaleId, suggested_email: suggested || undefined });
      alert('Solicitação de troca enviada!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao solicitar troca');
    }
  }

  const selectedCultData = availableCults.find(c => c.id === selectedCult);

  function handlePrint() {
    if (!scales || !selectedCultData) return;
    exportScalePDF(scales, selectedCultData, `Escala - ${selectedCultData.name || selectedCultData.type_name}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Escalas</h1>
        <div className="flex gap-2 flex-wrap">
          {(isAdmin(user.role) || isLeader(user.role)) && (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setAutoModal(true); setError(''); }}>
                <Zap size={16} /> Gerar Automático
              </Button>
              {selectedCult && (
                <Button size="sm" onClick={() => { setAddModal(true); setError(''); }}>
                  <Plus size={16} /> Adicionar
                </Button>
              )}
            </>
          )}
          {selectedCult && scales && (
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={16} /> Imprimir PDF
            </Button>
          )}
        </div>
      </div>

      {/* Cult selector */}
      <Card className="p-4">
        <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Selecionar Culto</label>
        <select
          value={selectedCult || ''}
          onChange={e => setSelectedCult(Number(e.target.value) || null)}
          className="w-full md:w-96 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="">Selecione um culto...</option>
          {availableCults.map(c => (
            <option key={c.id} value={c.id}>
              {c.name || c.type_name} — {c.date} {c.time}
            </option>
          ))}
        </select>
      </Card>

      {/* Scale table */}
      {selectedCult && (
        <Card className="overflow-hidden">
          {!scales ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-700 bg-stone-800/50">
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Voluntário</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                    <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {scales.map((s, i) => (
                    <tr key={s.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                      <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                      <td className="p-3 text-stone-200">{s.member_name}</td>
                      <td className="p-3 text-stone-400 text-xs">{s.sector_name}</td>
                      <td className="p-3">
                        <Badge
                          label={s.status}
                          color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {s.status === 'Pendente' && (
                            <button onClick={() => confirmScale(s.id)} title="Confirmar" className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          <button onClick={() => requestSwap(s.id)} title="Solicitar Troca" className="text-blue-400 hover:text-blue-300 p-1 transition-colors">
                            <Repeat size={15} />
                          </button>
                          {(isAdmin(user.role) || isLeader(user.role)) && (
                            <button onClick={() => removeScale(s.id)} title="Remover" className="text-red-400 hover:text-red-300 p-1 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scales.length === 0 && (
                <p className="text-center text-stone-500 text-sm py-10">Nenhum voluntário nesta escala</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Auto Generate Modal */}
      <Modal open={autoModal} onClose={() => setAutoModal(false)} title="Gerar Escala Automática" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Selecione o tipo de escala a gerar. O sistema respeitará as regras de não-repetição (máx. 3x/mês) e evitará duplicidade de setor.</p>
          <div className="space-y-2">
            {[
              { value: 'month', label: 'Mês Inteiro' },
              { value: 'standard', label: 'Cultos Padrão' },
              { value: 'thematic', label: 'Cultos Temáticos' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-stone-700 hover:border-amber-600 transition-all">
                <input type="radio" value={opt.value} checked={autoType === opt.value} onChange={() => setAutoType(opt.value as any)} className="accent-amber-500" />
                <span className="text-stone-200 text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAutoModal(false)}>Cancelar</Button>
            <Button onClick={generateAuto} loading={saving}>Gerar</Button>
          </div>
        </div>
      </Modal>

      {/* Add to Scale Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Adicionar à Escala" size="sm">
        <div className="space-y-4">
          <Select
            label="Voluntário"
            value={newScale.member_id}
            onChange={e => setNewScale(n => ({ ...n, member_id: e.target.value }))}
            placeholder="Selecionar..."
            options={(members || []).map(m => ({ value: m.id, label: m.name }))}
          />
          <Select
            label="Setor"
            value={newScale.sector_id}
            onChange={e => setNewScale(n => ({ ...n, sector_id: e.target.value }))}
            placeholder="Selecionar..."
            options={(sectors || []).map(s => ({ value: s.id, label: s.name }))}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAddModal(false)}>Cancelar</Button>
            <Button onClick={addToScale} loading={saving}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
