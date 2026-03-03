import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Printer, Zap, Trash2, CheckCircle, Repeat, Calendar, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Spinner, Input } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { getSupabase } from '../utils/supabaseClient';
import type { AuthUser, Scale, Cult, Member, Sector, CultType } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';
import { exportScalePDF } from '../utils/pdf';

interface Props { user: AuthUser; }

interface DeptBlock {
  department_id: number | null;
  department_name: string;
  scales: {
    id: number;
    status: string;
    member_name: string;
    member_id: number;
    sector_name: string;
    department_id: number | null;
    department_name: string;
  }[];
}

export default function ScalesPage({ user }: Props) {
  const [selectedCult, setSelectedCult] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'departments' | 'list'>('departments');

  // Department blocks state
  const [deptBlocks, setDeptBlocks] = useState<DeptBlock[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  // Modals
  const [autoModal, setAutoModal] = useState(false);
  const [fillModal, setFillModal] = useState(false);
  const [fillLoading, setFillLoading] = useState(false);
  const [fillMsg, setFillMsg] = useState('');
  const [autoType, setAutoType] = useState<'month' | 'standard' | 'thematic'>('month');
  const [addModal, setAddModal] = useState(false);
  const [newCultModal, setNewCultModal] = useState(false);
  const [newScale, setNewScale] = useState({ member_id: '', sector_id: '' });
  const [newCult, setNewCult] = useState({ type_id: '', name: '', date: '', time: '' });
  const [saving, setSaving] = useState(false);
  const [savingCult, setSavingCult] = useState(false);
  const [error, setError] = useState('');
  const [cultError, setCultError] = useState('');

  // Swap modal
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

  // ─── Load department blocks ──────────────────────────────────────────────────
  const fetchDeptBlocks = useCallback(async () => {
    if (!selectedCult) { setDeptBlocks([]); return; }
    setDeptLoading(true);
    try {
      const data = await api.get<DeptBlock[]>(`/scales/by-department/${selectedCult}`);
      setDeptBlocks(data);
    } catch {
      setDeptBlocks([]);
    } finally {
      setDeptLoading(false);
    }
  }, [selectedCult]);

  useEffect(() => { fetchDeptBlocks(); }, [fetchDeptBlocks]);

  // ─── Supabase Realtime ───────────────────────────────────────────────────────
  // Usar refs para callbacks evita que o useEffect re-execute e recrie o canal
  // toda vez que refetchScales/fetchDeptBlocks mudam (causa do loop)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchScalesRef = useRef(refetchScales);
  const fetchDeptBlocksRef = useRef(fetchDeptBlocks);
  const refetchCultsRef = useRef(refetchCults);

  useEffect(() => { refetchScalesRef.current = refetchScales; }, [refetchScales]);
  useEffect(() => { fetchDeptBlocksRef.current = fetchDeptBlocks; }, [fetchDeptBlocks]);
  useEffect(() => { refetchCultsRef.current = refetchCults; }, [refetchCults]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel('scales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        // Debounce para evitar múltiplas chamadas em inserções bulk (auto-generate)
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          refetchScalesRef.current();
          fetchDeptBlocksRef.current();
        }, 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => {
        refetchCultsRef.current();
      })
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      sb.removeChannel(channel);
    };
  }, []); // Array vazio: canal criado uma única vez, sem risco de loop

  // ─── Toggle block collapse ───────────────────────────────────────────────────
  function toggleBlock(key: string) {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ─── Fill cult ───────────────────────────────────────────────────────────────
  async function fillCult() {
    if (!selectedCult) return;
    setFillLoading(true); setFillMsg('');
    try {
      const res = await api.post<{ message: string; created: number }>('/scales/fill-cult', { cult_id: selectedCult });
      setFillMsg(res.message);
      refetchScales(); fetchDeptBlocks();
    } catch (e) {
      setFillMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao preencher'));
    } finally { setFillLoading(false); }
  }

  // ─── Auto generate ───────────────────────────────────────────────────────────
  const [autoSuccess, setAutoSuccess] = useState('');

  async function generateAuto() {
    if (!selectedCult && autoType !== 'month') { setError('Selecione um culto antes de gerar'); return; }
    setSaving(true); setError(''); setAutoSuccess('');
    try {
      const payload = autoType === 'month'
        ? { type: 'month', month: new Date().toISOString().slice(0, 7) }
        : { type: autoType, cult_id: selectedCult };

      const res = await api.post<{ message?: string; created?: number }>('/scales/auto-generate', payload);

      // Monta mensagem de sucesso
      const msg = res?.message || (res?.created !== undefined ? `${res.created} escala(s) gerada(s) com sucesso!` : 'Escalas geradas com sucesso!');
      setAutoSuccess(msg);

      // Atualiza dados sem fechar o modal imediatamente (usuário vê o resultado)
      // O Supabase Realtime já vai disparar a atualização via debounce,
      // mas forçamos uma atualização manual como fallback
      if (autoType !== 'month') {
        // Para culto específico, atualiza direto
        refetchScales();
        fetchDeptBlocks();
      } else {
        // Para mês inteiro, apenas atualiza a lista de cultos disponíveis
        refetchCults();
      }

      // Fecha modal após 1.5s para o usuário ler o sucesso
      setTimeout(() => {
        setAutoModal(false);
        setAutoSuccess('');
      }, 1500);

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar escala');
    } finally { setSaving(false); }
  }

  // ─── Confirm scale ───────────────────────────────────────────────────────────
  async function confirmScale(id: number) {
    await api.put(`/scales/${id}/confirm`, {});
    refetchScales(); fetchDeptBlocks();
  }

  // ─── Remove scale ────────────────────────────────────────────────────────────
  async function removeScale(id: number) {
    if (!confirm('Remover desta escala? O membro ficará disponível novamente.')) return;
    await api.delete(`/scales/${id}`);
    refetchScales(); fetchDeptBlocks();
  }

  // ─── Add to scale ────────────────────────────────────────────────────────────
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
      refetchScales(); fetchDeptBlocks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally { setSaving(false); }
  }

  // ─── Create new cult ─────────────────────────────────────────────────────────
  async function createNewCultScale() {
    if (!newCult.date || !newCult.time) { setCultError('Data e Horário são obrigatórios'); return; }
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
      setNewCult({ type_id: '', name: '', date: '', time: '' });
      refetchCults();
    } catch (e) {
      setCultError(e instanceof Error ? e.message : 'Erro ao criar escala');
    } finally { setSavingCult(false); }
  }

  // ─── Swap ────────────────────────────────────────────────────────────────────
  function openSwapModal(scaleId: number) {
    setSwapScaleId(scaleId); setSwapEmail(''); setSwapMsg(''); setSwapModal(true);
  }

  async function confirmSwap() {
    if (!swapScaleId) return;
    setSwapSaving(true); setSwapMsg('');
    try {
      await api.post('/swaps', { scale_id: swapScaleId, suggested_email: swapEmail.trim() || undefined });
      setSwapMsg('✅ Solicitação enviada com sucesso!');
      setTimeout(() => { setSwapModal(false); setSwapScaleId(null); }, 1500);
    } catch (e) {
      setSwapMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao solicitar troca'));
    } finally { setSwapSaving(false); }
  }

  // ─── Print ───────────────────────────────────────────────────────────────────
  const selectedCultData = availableCults.find(c => c.id === selectedCult);

  async function handlePrint() {
    if (!scales || !selectedCultData) return;
    await exportScalePDF(scales, selectedCultData, `Escala — ${selectedCultData.type_name || selectedCultData.name || 'Culto'}`);
  }

  async function handlePrintMonth() {
    const month = new Date().toISOString().slice(0, 7);
    const monthCults = availableCults.filter(c => c.date.startsWith(month));
    if (monthCults.length === 0) return;
    const token = localStorage.getItem('token') || '';
    const results = await Promise.all(
      monthCults.map(c =>
        fetch(`/api/scales?cult_id=${c.id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then((s: Scale[]) => s).catch(() => [] as Scale[])
      )
    );
    await exportScalePDF(results.flat(), null, `Escalas — ${month}`, results.flat(), monthCults);
  }

  function getCultLabel(c: Cult) {
    return `${c.name || c.type_name || 'Culto'} — ${c.date} ${c.time}`;
  }

  // ─── Dept block colors ───────────────────────────────────────────────────────
  const BLOCK_COLORS = [
    'border-amber-600/40 bg-amber-900/10',
    'border-blue-600/40 bg-blue-900/10',
    'border-emerald-600/40 bg-emerald-900/10',
    'border-purple-600/40 bg-purple-900/10',
    'border-rose-600/40 bg-rose-900/10',
    'border-cyan-600/40 bg-cyan-900/10',
    'border-orange-600/40 bg-orange-900/10',
    'border-teal-600/40 bg-teal-900/10',
  ];
  const HEADER_COLORS = [
    'bg-amber-900/30 text-amber-300',
    'bg-blue-900/30 text-blue-300',
    'bg-emerald-900/30 text-emerald-300',
    'bg-purple-900/30 text-purple-300',
    'bg-rose-900/30 text-rose-300',
    'bg-cyan-900/30 text-cyan-300',
    'bg-orange-900/30 text-orange-300',
    'bg-teal-900/30 text-teal-300',
  ];

  const canManage = isAdmin(user.role) || isLeader(user.role);

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Escalas</h1>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setAutoModal(true); setError(''); }}>
                <Zap size={16} /> Gerar Automático
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setNewCultModal(true); setCultError(''); }}>
                <Calendar size={16} /> Nova Escala
              </Button>
              {selectedCult && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => { setFillModal(true); setFillMsg(''); }}>
                    <Zap size={16} /> Preencher Automático
                  </Button>
                  <Button size="sm" onClick={() => { setAddModal(true); setError(''); }}>
                    <Plus size={16} /> Adicionar Voluntário
                  </Button>
                </>
              )}
            </>
          )}
          {selectedCult && scales && (
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={16} /> Imprimir Culto
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrintMonth}>
            <Printer size={16} /> Imprimir Mês
          </Button>
        </div>
      </div>

      {/* ─── Cult selector ──────────────────────────────────────────────────── */}
      <Card className="p-4">
        <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">Selecionar Culto / Evento</label>
        <div className="flex flex-wrap items-center gap-4">
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

          {/* View mode toggle */}
          {selectedCult && isAdmin(user.role) && (
            <div className="flex rounded-lg overflow-hidden border border-stone-700">
              <button
                onClick={() => setViewMode('departments')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'departments' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}
              >
                <Users size={13} /> Por Departamento
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}
              >
                Lista Completa
              </button>
            </div>
          )}
        </div>

        {selectedCultData && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-400">
            <span>📅 {selectedCultData.date}</span>
            <span>🕐 {selectedCultData.time}</span>
            <span>📋 {selectedCultData.name || selectedCultData.type_name}</span>
            <span>👥 {scales?.length ?? 0} voluntário(s) escalado(s)</span>
          </div>
        )}
      </Card>

      {/* ─── Department Blocks View ──────────────────────────────────────────── */}
      {selectedCult && viewMode === 'departments' && (
        <>
          {deptLoading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : deptBlocks.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-stone-500 text-sm">Nenhuma escala cadastrada para este culto</p>
              <p className="text-stone-600 text-xs mt-1">
                {canManage ? 'Clique em "Adicionar Voluntário" para começar' : 'Aguardando os líderes montarem as escalas'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {deptBlocks
                .filter(b => b.scales.length > 0)
                .map((block, idx) => {
                  const blockKey = String(block.department_id ?? 'none');
                  const isCollapsed = collapsedBlocks.has(blockKey);
                  const colorClass = BLOCK_COLORS[idx % BLOCK_COLORS.length];
                  const headerClass = HEADER_COLORS[idx % HEADER_COLORS.length];
                  const confirmedCount = block.scales.filter(s => s.status === 'Confirmado').length;

                  return (
                    <div key={blockKey} className={`rounded-xl border ${colorClass} overflow-hidden`}>
                      {/* Block header */}
                      <button
                        onClick={() => toggleBlock(blockKey)}
                        className={`w-full flex items-center justify-between px-4 py-3 ${headerClass} transition-opacity hover:opacity-80`}
                      >
                        <div className="flex items-center gap-2">
                          <Users size={15} />
                          <span className="font-semibold text-sm">{block.department_name}</span>
                          <span className="text-xs opacity-70 ml-1">
                            {block.scales.length} vol. • {confirmedCount} confirmado(s)
                          </span>
                        </div>
                        {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                      </button>

                      {/* Block content */}
                      {!isCollapsed && (
                        <div className="divide-y divide-stone-800/60">
                          {block.scales.map((s, i) => (
                            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-stone-800/20 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-stone-600 text-xs w-4 flex-shrink-0">{i + 1}</span>
                                <div className="min-w-0">
                                  <p className="text-stone-200 text-sm font-medium truncate">{s.member_name}</p>
                                  <p className="text-stone-500 text-xs truncate">{s.sector_name}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <Badge
                                  label={s.status}
                                  color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'}
                                />
                                {isAdmin(user.role) && (
                                  <>
                                    {s.status === 'Pendente' && (
                                      <button onClick={() => confirmScale(s.id)} title="Confirmar"
                                        className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                                        <CheckCircle size={14} />
                                      </button>
                                    )}
                                    <button onClick={() => removeScale(s.id)} title="Remover"
                                      className="text-red-400 hover:text-red-300 p-1 transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* ─── List View (leader view or toggled) ─────────────────────────────── */}
      {selectedCult && (viewMode === 'list' || !isAdmin(user.role)) && (
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
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Departamento</th>
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
                      <td className="p-3 text-stone-400 text-xs">{(s as any).department_name || '—'}</td>
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
                          {canManage && (
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
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ─── Modal: Solicitar Troca ──────────────────────────────────────────── */}
      <Modal open={swapModal} onClose={() => setSwapModal(false)} title="Solicitar Troca" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Informe o e-mail do voluntário sugerido para a troca, ou deixe em branco para qualquer disponível.
          </p>
          <Input label="E-mail do voluntário sugerido (opcional)" type="email"
            value={swapEmail} onChange={e => setSwapEmail(e.target.value)} placeholder="voluntario@email.com" />
          {swapMsg && (
            <p className={`text-sm ${swapMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{swapMsg}</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSwapModal(false)}>Cancelar</Button>
            <Button onClick={confirmSwap} loading={swapSaving}>Confirmar Troca</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Nova Escala ──────────────────────────────────────────────── */}
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
          <Input label="Nome personalizado (opcional)" value={newCult.name}
            onChange={e => setNewCult(n => ({ ...n, name: e.target.value }))} placeholder="Ex: Culto de Aniversário" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data *" type="date" value={newCult.date}
              onChange={e => setNewCult(n => ({ ...n, date: e.target.value }))} />
            <Input label="Horário *" type="time" value={newCult.time}
              onChange={e => setNewCult(n => ({ ...n, time: e.target.value }))} />
          </div>
          {cultError && <p className="text-red-400 text-xs">{cultError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setNewCultModal(false)}>Cancelar</Button>
            <Button onClick={createNewCultScale} loading={savingCult}>Criar Escala</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Gerar Escala Automática ─────────────────────────────────── */}
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
          {!selectedCult && autoType !== 'month' && (
            <p className="text-amber-400 text-xs">⚠️ Para gerar Cultos Padrão ou Temáticos, selecione um culto na tela principal primeiro.</p>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {autoSuccess && <p className="text-emerald-400 text-sm font-medium">✅ {autoSuccess}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setAutoModal(false); setAutoSuccess(''); setError(''); }}>Cancelar</Button>
            <Button onClick={generateAuto} loading={saving} disabled={(!selectedCult && autoType !== 'month') || !!autoSuccess}>Gerar</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Preencher Automático ─────────────────────────────────────── */}
      <Modal open={fillModal} onClose={() => { setFillModal(false); setFillMsg(''); }} title="Preencher Voluntários Automaticamente" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date}</p>
            </div>
          )}
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
            <p className="text-amber-300 text-xs leading-relaxed">
              O sistema preencherá os setores padrão (exceto Som, Iluminação, Foto e Filmagem) com voluntários disponíveis.
            </p>
          </div>
          {fillMsg && (
            <p className={`text-sm font-medium ${fillMsg.startsWith('❌') ? 'text-red-400' : 'text-emerald-400'}`}>{fillMsg}</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setFillModal(false); setFillMsg(''); }}>Cancelar</Button>
            <Button onClick={fillCult} loading={fillLoading} disabled={!!fillMsg && !fillMsg.startsWith('❌')}>
              <Zap size={15} /> Preencher
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Adicionar Voluntário ─────────────────────────────────────── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Adicionar Voluntário à Escala" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date}</p>
              <p><span className="text-stone-300">Horário:</span> {selectedCultData.time}</p>
            </div>
          )}
          <Select label="Voluntário *" value={newScale.member_id}
            onChange={e => setNewScale(n => ({ ...n, member_id: e.target.value }))}
            placeholder="Selecionar voluntário..."
            options={(members || []).map(m => ({ value: m.id, label: m.name }))} />
          <Select label="Setor / Local *" value={newScale.sector_id}
            onChange={e => setNewScale(n => ({ ...n, sector_id: e.target.value }))}
            placeholder="Selecionar setor..."
            options={(sectors || []).map(s => ({ value: s.id, label: s.name }))} />
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
