import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Printer, Zap, Trash2, CheckCircle, Repeat, Calendar, Users, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Spinner, Input } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { getSupabase } from '../utils/supabaseClient';
import type { AuthUser, Scale, Cult, Member, Sector, CultType } from '../types';
import { isAdmin, isLeader, isSuperAdmin } from '../utils/permissions';
import { exportScalePDF, type DeptBlock as PdfDeptBlock } from '../utils/pdf';

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

interface AutoResult {
  created: number;
  cultsCount?: number;
  label: string; // descrição amigável do tipo gerado
}

export default function ScalesPage({ user }: Props) {
  const [selectedCult, setSelectedCult] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'departments' | 'list'>('departments');
  const [selectedDepartmentForScale, setSelectedDepartmentForScale] = useState<number | null>(null);

  const [deptBlocks, setDeptBlocks] = useState<DeptBlock[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

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

  const [swapModal, setSwapModal] = useState(false);
  const [swapScaleId, setSwapScaleId] = useState<number | null>(null);
  const [swapEmail, setSwapEmail] = useState('');
  const [swapMsg, setSwapMsg] = useState('');
  const [swapSaving, setSwapSaving] = useState(false);

  const [deleteScaleModal, setDeleteScaleModal] = useState(false);
  const [deletingScale, setDeletingScale] = useState(false);

  // Resultado detalhado da geração automática
  const [autoResult, setAutoResult] = useState<AutoResult | null>(null);

  // Modal de seleção de departamentos para impressão
  const [printConfigModal, setPrintConfigModal] = useState(false);
  const [availableDepartments, setAvailableDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedDepartmentsForPrint, setSelectedDepartmentsForPrint] = useState<number[]>([]);
  const [printingMode, setPrintingMode] = useState<'cult' | 'month'>('cult');

  const { data: cults, refetch: refetchCults } = useApi<Cult[]>('/cults?status=Agendado');
  const { data: scales, refetch: refetchScales } = useApi<Scale[]>(
    selectedCult ? `/scales?cult_id=${selectedCult}` : null, [selectedCult]
  );
  const { data: members } = useApi<Member[]>('/members?is_active=1');
  const { data: sectors } = useApi<Sector[]>('/sectors?is_active=1');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const availableCults = cults || [];

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

  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchScalesRef = useRef(refetchScales);
  const fetchDeptBlocksRef = useRef(fetchDeptBlocks);
  const refetchCultsRef = useRef(refetchCults);
  const suppressRealtimeRef = useRef(false);

  useEffect(() => { refetchScalesRef.current = refetchScales; }, [refetchScales]);
  useEffect(() => { fetchDeptBlocksRef.current = fetchDeptBlocks; }, [fetchDeptBlocks]);
  useEffect(() => { refetchCultsRef.current = refetchCults; }, [refetchCults]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('scales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        if (suppressRealtimeRef.current) return;
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          refetchScalesRef.current();
          fetchDeptBlocksRef.current();
        }, 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => {
        if (suppressRealtimeRef.current) return;
        refetchCultsRef.current();
      })
      .subscribe();
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      sb.removeChannel(channel);
    };
  }, []);

  function toggleBlock(key: string) {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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

  // ─── Auto generate com resultado detalhado ───────────────────────────────────
  function openAutoModal() {
    setAutoModal(true);
    setAutoResult(null);
    setError('');
  }

  function closeAutoModal() {
    setAutoModal(false);
    setAutoResult(null);
    setError('');
  }

  const AUTO_LABELS: Record<string, string> = {
    month: 'Mês Inteiro',
    standard: 'Cultos Padrão',
    thematic: 'Cultos Temáticos',
  };

  async function generateAuto() {
    if (!selectedCult && autoType !== 'month') { setError('Selecione um culto antes de gerar'); return; }
    setSaving(true); setError(''); setAutoResult(null);
    try {
      const payload = autoType === 'month'
        ? { type: 'month', month: new Date().toISOString().slice(0, 7) }
        : { type: autoType, cult_id: selectedCult };

      const res = await api.post<{ message?: string; created?: number; cults_count?: number; scales_count?: number }>(
        '/scales/auto-generate', payload
      );

      const created = res?.scales_count ?? res?.created ?? 0;
      const cultsCount = res?.cults_count ?? (autoType !== 'month' ? 1 : undefined);

      setAutoResult({
        created,
        cultsCount,
        label: AUTO_LABELS[autoType],
      });

      if (autoType !== 'month') {
        refetchScales();
        fetchDeptBlocks();
      } else {
        refetchCults();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar escala');
    } finally { setSaving(false); }
  }

  async function confirmScale(id: number) {
    await api.put(`/scales/${id}/confirm`, {});
    refetchScales(); fetchDeptBlocks();
  }

  async function removeScale(id: number) {
    if (!confirm('Remover desta escala? O membro ficará disponível novamente.')) return;
    const remaining = (scales || []).filter(s => s.id !== id);
    const cultToDelete = remaining.length === 0 ? selectedCult : null;
    if (cultToDelete) {
      suppressRealtimeRef.current = true;
      setSelectedCult(null);
      setDeptBlocks([]);
    }
    try {
      await api.delete(`/scales/${id}`);
      if (cultToDelete) {
        await api.delete(`/cults/${cultToDelete}`);
        await refetchCults();
      } else {
        refetchScales();
        fetchDeptBlocks();
      }
    } catch (e) {
      if (cultToDelete) setSelectedCult(cultToDelete);
      alert(e instanceof Error ? e.message : 'Erro ao remover membro');
    } finally {
      if (cultToDelete) setTimeout(() => { suppressRealtimeRef.current = false; }, 1500);
    }
  }

  async function deleteEntireScale() {
    if (!selectedCult) return;
    setDeletingScale(true);
    const cultToDelete = selectedCult;
    try {
      const freshScales = await api.get<{ id: number }[]>(`/scales?cult_id=${cultToDelete}`);
      suppressRealtimeRef.current = true;
      if (freshScales && freshScales.length > 0) {
        await Promise.all(freshScales.map(s => api.delete(`/scales/${s.id}`)));
      }
      await api.delete(`/cults/${cultToDelete}`);
      setDeleteScaleModal(false);
      setSelectedCult(null);
      setDeptBlocks([]);
      await refetchCults();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao remover escala');
    } finally {
      setDeletingScale(false);
      setTimeout(() => { suppressRealtimeRef.current = false; }, 1500);
    }
  }

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

  const selectedCultData = availableCults.find(c => c.id === selectedCult);

  async function handlePrint() {
    if (!scales || !selectedCultData) return;
    
    // Extrair departamentos únicos das escalas
    const { data: depts } = await api.get<Array<{ id: number; name: string }>>('/departments');
    const uniqueDepts = (depts || []).filter(d => 
      scales.some(s => s.sector_name && 
        (d.name === 'Diáconos / Obreiros' || 
         d.name === 'Mídia' || 
         d.name === 'Infantil' || 
         d.name === 'Louvor' || 
         d.name === 'Una' || 
         d.name === 'Bem-Vindos'))
    );
    
    setAvailableDepartments(uniqueDepts);
    setSelectedDepartmentsForPrint(uniqueDepts.map(d => d.id));
    setPrintingMode('cult');
    setPrintConfigModal(true);
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
    
    // Extrair departamentos únicos do mês
    const allMonthScales = results.flat();
    const { data: depts } = await api.get<Array<{ id: number; name: string }>>('/departments');
    const uniqueDepts = (depts || []).filter(d => 
      allMonthScales.some(s => s.sector_name && 
        (d.name === 'Diáconos / Obreiros' || 
         d.name === 'Mídia' || 
         d.name === 'Infantil' || 
         d.name === 'Louvor' || 
         d.name === 'Una' || 
         d.name === 'Bem-Vindos'))
    );
    
    setAvailableDepartments(uniqueDepts);
    setSelectedDepartmentsForPrint(uniqueDepts.map(d => d.id));
    setPrintingMode('month');
    setPrintConfigModal(true);
  }

  async function executePrint() {
    if (printingMode === 'cult') {
      if (!scales || !selectedCultData) return;
      await exportScalePDF(
        scales,
        selectedCultData,
        `Escala — ${selectedCultData.type_name || selectedCultData.name || 'Culto'}`,
        undefined,
        undefined,
        undefined,
        selectedDepartmentsForPrint,
        deptBlocks, // ← dados reais da API por departamento
      );
    } else {
      const month = new Date().toISOString().slice(0, 7);
      const monthCults = availableCults.filter(c => c.date.startsWith(month));
      if (monthCults.length === 0) return;

      const token = localStorage.getItem('token') || '';

      // Buscar deptBlocks para cada culto do mês via /scales/by-department
      const deptBlocksMap = new Map<number, DeptBlock[]>();
      await Promise.all(
        monthCults.map(async (c) => {
          try {
            const res = await fetch(`/api/scales/by-department/${c.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const blocks: DeptBlock[] = await res.json();
            deptBlocksMap.set(c.id, blocks);
          } catch {
            deptBlocksMap.set(c.id, []);
          }
        })
      );

      await exportScalePDF(
        [],
        null,
        `Escalas — ${month}`,
        undefined,
        monthCults,
        undefined,
        selectedDepartmentsForPrint,
        undefined,
        deptBlocksMap, // ← dados reais da API por culto
      );
    }
    setPrintConfigModal(false);
  }

  function getCultLabel(c: Cult) {
    return `${c.name || c.type_name || 'Culto'} — ${c.date} ${c.time}`;
  }

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
              <Button variant="secondary" size="sm" onClick={openAutoModal}>
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
                  {isAdmin(user.role) && (
                    <Button size="sm" variant="danger" onClick={() => setDeleteScaleModal(true)}>
                      <Trash2 size={16} /> Remover Escala
                    </Button>
                  )}
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

      {/* ─── List View ──────────────────────────────────────────────────────── */}
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
      <Modal open={autoModal} onClose={closeAutoModal} title="Gerar Escala Automática" size="sm">
        <div className="space-y-4">

          {/* ── Resultado de sucesso ─────────────────────────────────────────── */}
          {autoResult ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-300 font-semibold text-sm">Escala gerada com sucesso!</p>
                </div>

                {/* Tipo gerado */}
                <div className="bg-stone-800/60 rounded-lg px-3 py-2 text-xs">
                  <span className="text-stone-400">Tipo: </span>
                  <span className="text-stone-200 font-medium">{autoResult.label}</span>
                </div>

                {/* Contadores */}
                <div className={`grid gap-3 ${autoResult.cultsCount !== undefined ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {autoResult.cultsCount !== undefined && (
                    <div className="bg-amber-900/30 rounded-lg p-3 text-center">
                      <p className="text-amber-200 text-2xl font-bold">{autoResult.cultsCount}</p>
                      <p className="text-amber-400 text-xs mt-0.5">
                        {autoResult.cultsCount === 1 ? 'culto processado' : 'cultos processados'}
                      </p>
                    </div>
                  )}
                  <div className="bg-emerald-900/30 rounded-lg p-3 text-center">
                    <p className="text-emerald-200 text-2xl font-bold">{autoResult.created}</p>
                    <p className="text-emerald-400 text-xs mt-0.5">
                      {autoResult.created === 1 ? 'escala gerada' : 'escalas geradas'}
                    </p>
                  </div>
                </div>

                {/* Mensagem complementar por tipo */}
                <p className="text-stone-400 text-xs leading-relaxed">
                  {autoResult.label === 'Mês Inteiro' &&
                    'Todos os cultos do mês foram processados e as escalas distribuídas respeitando o limite de 3x/mês por voluntário.'}
                  {autoResult.label === 'Cultos Padrão' &&
                    'As escalas dos cultos padrão foram geradas com a distribuição automática de voluntários.'}
                  {autoResult.label === 'Cultos Temáticos' &&
                    'As escalas dos cultos temáticos foram geradas com a distribuição automática de voluntários.'}
                </p>
              </div>

              <Button onClick={closeAutoModal} className="w-full">Fechar</Button>
            </div>

          ) : (
            /* ── Formulário de geração ──────────────────────────────────────── */
            <>
              <p className="text-stone-400 text-sm">
                O sistema respeitará as regras de não-repetição (máx. 3x/mês) e evitará duplicidade de setor.
              </p>
              <div className="space-y-2">
                {[
                  { value: 'month',    label: 'Mês Inteiro' },
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
              <div className="flex gap-3">
                <Button variant="outline" onClick={closeAutoModal}>Cancelar</Button>
                <Button onClick={generateAuto} loading={saving}
                  disabled={!selectedCult && autoType !== 'month'}>
                  Gerar
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ─── Modal: Preencher Automático ─────────────────────────────────────── */}
      <Modal open={fillModal} onClose={() => { setFillModal(false); setFillMsg(''); }} title="Preencher Voluntários Automaticamente" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800 border border-stone-600 rounded-lg p-3 text-xs space-y-1">
              <p><span className="text-stone-200 font-semibold">Culto:</span> <span className="text-stone-300">{selectedCultData.name || selectedCultData.type_name}</span></p>
              <p><span className="text-stone-200 font-semibold">Data:</span> <span className="text-stone-300">{selectedCultData.date}</span></p>
            </div>
          )}
          <div className="bg-stone-800 border border-stone-600 rounded-lg p-3 space-y-2">
            <p className="text-stone-200 text-xs font-semibold">O sistema respeitará as seguintes regras:</p>
            <ul className="text-stone-300 text-xs space-y-1 list-disc list-inside leading-relaxed">
              <li>Não escalar o mesmo voluntário duas vezes no culto</li>
              <li>Máximo 3 escalas por voluntário no mês</li>
              <li>Setores já preenchidos serão mantidos</li>
            </ul>
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

      {/* ─── Modal: Remover Escala Inteira ──────────────────────────────────── */}
      <Modal open={deleteScaleModal} onClose={() => setDeleteScaleModal(false)} title="Remover Escala" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/40 rounded-lg p-4">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 text-sm font-semibold">Ação irreversível</p>
              <p className="text-red-400/80 text-xs mt-1">
                Todos os voluntários serão removidos desta escala e o culto será desfeito. Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date} às {selectedCultData.time}</p>
              <p><span className="text-stone-300">Voluntários:</span> {scales?.length ?? 0} escalado(s)</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteScaleModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={deleteEntireScale} loading={deletingScale}>
              <Trash2 size={15} /> Confirmar Remoção
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Adicionar Voluntário ─────────────────────────────────────── */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setSelectedDepartmentForScale(null); }} title="Adicionar Voluntário à Escala" size="sm">
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
          
          {/* Novo: Seletor de Departamento */}
          <Select label="Departamento *" value={selectedDepartmentForScale?.toString() || ''}
            onChange={e => setSelectedDepartmentForScale(e.target.value ? Number(e.target.value) : null)}
            placeholder="Selecionar departamento..."
            options={(sectors || [])
              .filter((s, i, arr) => arr.findIndex(x => x.department_id === s.department_id) === i)
              .sort((a, b) => (a.department_id || 0) - (b.department_id || 0))
              .map(s => ({ 
                value: s.department_id?.toString() || '', 
                label: s.department_name || 'Sem Departamento'
              }))
            } />
          
          {/* Filtrado: Seletor de Setor */}
          <Select label="Setor / Local *" value={newScale.sector_id}
            onChange={e => setNewScale(n => ({ ...n, sector_id: e.target.value }))}
            placeholder="Selecionar setor..."
            options={(sectors || [])
              .filter(s => !selectedDepartmentForScale || s.department_id === selectedDepartmentForScale)
              .map(s => ({ value: s.id, label: s.name }))
            } />
          
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setAddModal(false); setSelectedDepartmentForScale(null); }}>Cancelar</Button>
            <Button onClick={addToScale} loading={saving}>Adicionar</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Configurar Impressão ──────────────────────────────────────── */}
      <Modal open={printConfigModal} onClose={() => setPrintConfigModal(false)} 
        title={printingMode === 'cult' ? 'Configurar Impressão do Culto' : 'Configurar Impressão do Mês'} 
        size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Selecione quais departamentos deseja incluir na impressão:
          </p>

          <div className="bg-stone-800 rounded-lg p-3 space-y-2 max-h-96 overflow-y-auto">
            {availableDepartments.length === 0 ? (
              <p className="text-stone-500 text-sm italic">Nenhum departamento disponível</p>
            ) : (
              availableDepartments.map(dept => (
                <label key={dept.id} 
                  className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-stone-700 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedDepartmentsForPrint.includes(dept.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedDepartmentsForPrint(prev => [...prev, dept.id]);
                      } else {
                        setSelectedDepartmentsForPrint(prev => prev.filter(id => id !== dept.id));
                      }
                    }}
                    className="w-4 h-4 accent-amber-500" 
                  />
                  <span className="text-stone-200 text-sm">{dept.name}</span>
                </label>
              ))
            )}
          </div>

          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
            <p className="text-amber-200 text-xs">
              ✓ {selectedDepartmentsForPrint.length} de {availableDepartments.length} departamento(s) selecionado(s)
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setSelectedDepartmentsForPrint(availableDepartments.map(d => d.id))}
              className="text-amber-400 text-xs hover:text-amber-300 transition-colors">
              Selecionar todos
            </button>
            <span className="text-stone-600 text-xs">•</span>
            <button onClick={() => setSelectedDepartmentsForPrint([])}
              className="text-stone-500 text-xs hover:text-stone-400 transition-colors">
              Limpar
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPrintConfigModal(false)}>Cancelar</Button>
            <Button onClick={executePrint} disabled={selectedDepartmentsForPrint.length === 0}>
              <Printer size={16} /> Imprimir Agora
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
