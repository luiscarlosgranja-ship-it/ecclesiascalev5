import { useState, useEffect } from 'react';
import { Plus, Printer, Zap, Trash2, CheckCircle, Repeat, Calendar } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Spinner, Input } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { getSupabase } from '../utils/supabaseClient';
import type { AuthUser, Scale, Cult, Member, Sector, CultType } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';
import { exportScalePDF } from '../utils/pdf';

interface Props { user: AuthUser; }

export default function ScalesPage({ user }: Props) {
  const [selectedCult, setSelectedCult] = useState<number | null>(null);
  const [autoModal, setAutoModal] = useState(false);
  const [autoType, setAutoType] = useState<'month' | 'standard' | 'thematic'>('month');
  const [addModal, setAddModal] = useState(false);
  const [newCultModal, setNewCultModal] = useState(false);
  const [newScale, setNewScale] = useState({ member_id: '', sector_id: '' });
  const [newCult, setNewCult] = useState({ type_id: '', name: '', date: '', time: '', sector_id: '' });
  const [saving, setSaving] = useState(false);
  const [savingCult, setSavingCult] = useState(false);
  const [error, setError] = useState('');
  const [cultError, setCultError] = useState('');

  // ─── Modal de troca (substitui prompt/alert nativos) ─────────────────────────
  const [swapModal, setSwapModal] = useState(false);
  const [swapScaleId, setSwapScaleId] = useState<number | null>(null);
  const [swapEmail, setSwapEmail] = useState('');
  const [swapMsg, setSwapMsg] = useState('');
  const [swapSaving, setSwapSaving] = useState(false);

  const { data: cults, refetch: refetchCults } = useApi<Cult[]>('/cults?status=Agendado');
  const { data: scales, refetch: refetchScales } = useApi<Scale[]>(
    selectedCult ? `/scales?cult_id=${selectedCult}` : null, [selectedCult]
  );
  const { data: members } = useApi<Member[]>('/members?is_active=1');
  const { data: sectors } = useApi<Sector[]>('/sectors?is_active=1');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const availableCults = cults || [];

  // ─── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return; // Realtime desativado se env vars não configuradas

    const channel = sb
      .channel('scales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        refetchScales();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => {
        refetchCults();
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [refetchScales, refetchCults]);

  // ─── Auto gerar escala ───────────────────────────────────────────────────────
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

  // ─── Confirmar escala ────────────────────────────────────────────────────────
  async function confirmScale(id: number) {
    await api.put(`/scales/${id}/confirm`, {});
    refetchScales();
  }

  // ─── Remover escala ──────────────────────────────────────────────────────────
  async function removeScale(id: number) {
    if (!confirm('Remover desta escala? O membro ficará disponível novamente.')) return;
    await api.delete(`/scales/${id}`);
    refetchScales();
  }

  // ─── Adicionar membro à escala ───────────────────────────────────────────────
  async function addToScale() {
    if (!selectedCult || !newScale.member_id || !newScale.sector_id) {
      setError('Voluntário e Setor são obrigatórios'); return;
    }
    setSaving(true); setError('');
    try {
      await api.post('/scales', {
        cult_id: selectedCult,
        member_id: Number(newScale.member_id),
        sector_id: Number(newScale.sector_id),
      });
      setAddModal(false);
      setNewScale({ member_id: '', sector_id: '' });
      refetchScales();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally { setSaving(false); }
  }

  // ─── Criar nova escala ───────────────────────────────────────────────────────
  async function createNewCultScale() {
    if (!newCult.date || !newCult.time) {
      setCultError('Data e Horário são obrigatórios'); return;
    }
    setSavingCult(true); setCultError('');
    try {
      const cult = await api.post<{ id: number }>('/cults', {
        type_id: newCult.type_id ? Number(newCult.type_id) : null,
        name: newCult.name || null,
        date: newCult.date,
        time: newCult.time,
        status: 'Agendado',
      });
      setSelectedCult(cult.id);
      setNewCultModal(false);
      setNewCult({ type_id: '', name: '', date: '', time: '', sector_id: '' });
      refetchCults();
    } catch (e) {
      setCultError(e instanceof Error ? e.message : 'Erro ao criar escala');
    } finally { setSavingCult(false); }
  }

  // ─── Abrir modal de troca ────────────────────────────────────────────────────
  function openSwapModal(scaleId: number) {
    setSwapScaleId(scaleId);
    setSwapEmail('');
    setSwapMsg('');
    setSwapModal(true);
  }

  // ─── Confirmar solicitação de troca ──────────────────────────────────────────
  async function confirmSwap() {
    if (!swapScaleId) return;
    setSwapSaving(true); setSwapMsg('');
    try {
      await api.post('/swaps', {
        scale_id: swapScaleId,
        suggested_email: swapEmail.trim() || undefined,
      });
      setSwapMsg('✅ Solicitação enviada com sucesso!');
      setTimeout(() => { setSwapModal(false); setSwapScaleId(null); }, 1500);
    } catch (e) {
      setSwapMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao solicitar troca'));
    } finally { setSwapSaving(false); }
  }

  const selectedCultData = availableCults.find(c => c.id === selectedCult);

  async function handlePrint() {
    if (!scales || !selectedCultData) return;
    await exportScalePDF(scales, selectedCultData, `Escala - ${selectedCultData.name || selectedCultData.type_name}`);
  }

  function getCultLabel(c: Cult) {
    const nome = c.name || c.type_name || 'Culto';
    return `${nome} — ${c.date} ${c.time}`;
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
              <Button variant="secondary" size="sm" onClick={() => { setNewCultModal(true); setCultError(''); }}>
                <Calendar size={16} /> Nova Escala
              </Button>
              {selectedCult && (
                <Button size="sm" onClick={() => { setAddModal(true); setError(''); }}>
                  <Plus size={16} /> Adicionar Voluntário
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

      {/* Seletor de Culto */}
      <Card className="p-4">
        <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Selecionar Culto / Evento</label>
        <select
          value={selectedCult || ''}
          onChange={e => setSelectedCult(Number(e.target.value) || null)}
          className="w-full md:w-auto md:min-w-96 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="">Selecione um culto...</option>
          {availableCults.map(c => (
            <option key={c.id} value={c.id}>{getCultLabel(c)}</option>
          ))}
        </select>
        {selectedCultData && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-400">
            <span>📅 {selectedCultData.date}</span>
            <span>🕐 {selectedCultData.time}</span>
            <span>📋 {selectedCultData.name || selectedCultData.type_name}</span>
            <span>👥 {scales?.length ?? 0} voluntário(s) escalado(s)</span>
          </div>
        )}
      </Card>

      {/* Tabela de Escala */}
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
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor / Local</th>
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
                    <th className="text-right p-3 text-stone-400 font-medium text-xs">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {scales.map((s, i) => (
                    <tr key={s.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                      <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                      <td className="p-3 text-stone-200">{s.member_name}</td>
                      <td className="p-3 text-stone-400 text-xs">{s.sector_name || '—'}</td>
                      <td className="p-3">
                        <Badge
                          label={s.status}
                          color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {s.status === 'Pendente' && (
                            <button onClick={() => confirmScale(s.id)} title="Confirmar"
                              className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          <button onClick={() => openSwapModal(s.id)} title="Solicitar Troca"
                            className="text-blue-400 hover:text-blue-300 p-1 transition-colors">
                            <Repeat size={15} />
                          </button>
                          {(isAdmin(user.role) || isLeader(user.role)) && (
                            <button onClick={() => removeScale(s.id)} title="Remover"
                              className="text-red-400 hover:text-red-300 p-1 transition-colors">
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
                <div className="py-10 text-center">
                  <p className="text-stone-500 text-sm">Nenhum voluntário nesta escala</p>
                  <p className="text-stone-600 text-xs mt-1">Clique em "Adicionar Voluntário" para escalar alguém</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Modal: Solicitar Troca */}
      <Modal open={swapModal} onClose={() => setSwapModal(false)} title="Solicitar Troca" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Informe o e-mail do voluntário sugerido para a troca, ou deixe em branco para qualquer disponível.
          </p>
          <Input
            label="E-mail do voluntário sugerido (opcional)"
            type="email"
            value={swapEmail}
            onChange={e => setSwapEmail(e.target.value)}
            placeholder="voluntario@email.com"
          />
          {swapMsg && (
            <p className={`text-sm ${swapMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{swapMsg}</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSwapModal(false)}>Cancelar</Button>
            <Button onClick={confirmSwap} loading={swapSaving}>Confirmar Troca</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Escala */}
      <Modal open={newCultModal} onClose={() => setNewCultModal(false)} title="Nova Escala" size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-xs">Preencha os dados do culto/evento para criar uma nova escala.</p>
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Tipo de Culto</label>
            <select
              value={newCult.type_id}
              onChange={e => {
                const ct = (cultTypes || []).find(c => c.id === Number(e.target.value));
                setNewCult(n => ({ ...n, type_id: e.target.value, time: ct?.default_time || n.time }));
              }}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">Selecionar tipo...</option>
              {(cultTypes || []).map(ct => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Nome personalizado (opcional)"
            value={newCult.name}
            onChange={e => setNewCult(n => ({ ...n, name: e.target.value }))}
            placeholder="Ex: Culto de Aniversário"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data *" type="date" value={newCult.date}
              onChange={e => setNewCult(n => ({ ...n, date: e.target.value }))} />
            <Input label="Horário *" type="time" value={newCult.time}
              onChange={e => setNewCult(n => ({ ...n, time: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Local / Setor Principal</label>
            <select
              value={newCult.sector_id}
              onChange={e => setNewCult(n => ({ ...n, sector_id: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">Selecionar setor (opcional)...</option>
              {(sectors || []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {cultError && <p className="text-red-400 text-xs">{cultError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setNewCultModal(false)}>Cancelar</Button>
            <Button onClick={createNewCultScale} loading={savingCult}>Criar Escala</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Gerar Escala Automática */}
      <Modal open={autoModal} onClose={() => setAutoModal(false)} title="Gerar Escala Automática" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            O sistema respeitará as regras de não-repetição (máx. 3x/mês) e evitará duplicidade de setor.
          </p>
          <div className="space-y-2">
            {[
              { value: 'month', label: 'Mês Inteiro' },
              { value: 'standard', label: 'Cultos Padrão' },
              { value: 'thematic', label: 'Cultos Temáticos' },
            ].map(opt => (
              <label key={opt.value}
                className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-stone-700 hover:border-amber-600 transition-all">
                <input type="radio" value={opt.value} checked={autoType === opt.value}
                  onChange={() => setAutoType(opt.value as any)} className="accent-amber-500" />
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

      {/* Modal: Adicionar Voluntário à Escala */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Adicionar Voluntário à Escala" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date}</p>
              <p><span className="text-stone-300">Horário:</span> {selectedCultData.time}</p>
            </div>
          )}
          <Select
            label="Voluntário *"
            value={newScale.member_id}
            onChange={e => setNewScale(n => ({ ...n, member_id: e.target.value }))}
            placeholder="Selecionar voluntário..."
            options={(members || []).map(m => ({ value: m.id, label: m.name }))}
          />
          <Select
            label="Setor / Local *"
            value={newScale.sector_id}
            onChange={e => setNewScale(n => ({ ...n, sector_id: e.target.value }))}
            placeholder="Selecionar setor..."
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
