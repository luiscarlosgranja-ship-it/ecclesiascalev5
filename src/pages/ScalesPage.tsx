import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Printer, Zap, Trash2, CheckCircle, Repeat,
  Calendar, Users, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
} from 'lucide-react';
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

interface FillSlot {
  sector_id: number;
  sector_name: string;
  department_id: number | null;
  department_name: string;
  scale_id: number | null;
  member_id: number | null;
}

// ─── token salvo pelo api.ts ──────────────────────────────────────────────────
function getAuthToken(): string {
  try {
    const s = localStorage.getItem('ecclesia_user');
    return s ? JSON.parse(s).token : '';
  } catch { return ''; }
}
function authHeaders(): HeadersInit {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function cultLabel(c: Cult) {
  return `${c.name || c.type_name || 'Culto'} — ${c.date} ${c.time}`;
}

export default function ScalesPage({ user }: Props) {
  // ── seleção ────────────────────────────────────────────────────────────────
  const [selectedCult, setSelectedCult]   = useState<number | null>(null);
  const [viewMode, setViewMode]           = useState<'departments' | 'list'>('departments');
  const [printMonth, setPrintMonth]       = useState(new Date().toISOString().slice(0, 7));

  // ── blocos departamento ────────────────────────────────────────────────────
  const [deptBlocks, setDeptBlocks]       = useState<DeptBlock[]>([]);
  const [deptLoading, setDeptLoading]     = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  // ── modal: gerar automático ────────────────────────────────────────────────
  const [autoModal, setAutoModal]         = useState(false);
  const [autoType, setAutoType]           = useState<'month' | 'standard' | 'thematic'>('month');
  const [autoLoading, setAutoLoading]     = useState(false);
  const [autoError, setAutoError]         = useState('');
  const [autoSuccess, setAutoSuccess]     = useState<{ created: number; cultsCount?: number; label: string } | null>(null);

  // ── modal: preencher automático ────────────────────────────────────────────
  const [fillModal, setFillModal]         = useState(false);
  const [fillLoading, setFillLoading]     = useState(false);
  const [fillSaving, setFillSaving]       = useState(false);
  const [fillMsg, setFillMsg]             = useState('');
  const [fillSlots, setFillSlots]         = useState<FillSlot[]>([]);

  // ── modal: nova escala ─────────────────────────────────────────────────────
  const [newCultModal, setNewCultModal]   = useState(false);
  const [newCult, setNewCult]             = useState({ type_id: '', name: '', date: '', time: '' });
  const [savingCult, setSavingCult]       = useState(false);
  const [cultError, setCultError]         = useState('');

  // ── modal: adicionar voluntário ────────────────────────────────────────────
  const [addModal, setAddModal]           = useState(false);
  const [newScale, setNewScale]           = useState({ member_id: '', sector_id: '' });
  const [selDept, setSelDept]             = useState<number | null>(null);
  const [addLoading, setAddLoading]       = useState(false);
  const [addError, setAddError]           = useState('');

  // ── modal: troca ───────────────────────────────────────────────────────────
  const [swapModal, setSwapModal]         = useState(false);
  const [swapScaleId, setSwapScaleId]     = useState<number | null>(null);
  const [swapEmail, setSwapEmail]         = useState('');
  const [swapMsg, setSwapMsg]             = useState('');
  const [swapLoading, setSwapLoading]     = useState(false);

  // ── modal: remover escala ──────────────────────────────────────────────────
  const [deleteModal, setDeleteModal]     = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── modal: impressão ───────────────────────────────────────────────────────
  const [printModal, setPrintModal]       = useState(false);
  const [printMode, setPrintMode]         = useState<'cult' | 'month'>('cult');
  const [availableDepts, setAvailableDepts] = useState<{ id: number; name: string }[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<number[]>([]);
  const [printLoading, setPrintLoading]   = useState(false);

  // ── dados API ──────────────────────────────────────────────────────────────
  const { data: cults, refetch: refetchCults }   = useApi<Cult[]>('/cults?status=Agendado');
  const { data: scales, refetch: refetchScales } = useApi<Scale[]>(
    selectedCult ? `/scales?cult_id=${selectedCult}` : null, [selectedCult]
  );
  const { data: members }   = useApi<Member[]>('/members?is_active=1');
  const { data: sectors }   = useApi<Sector[]>('/sectors?is_active=1');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const availableCults = cults || [];

  // ── agrupamento client-side (fallback quando a API falha) ─────────────────
  function buildDeptBlocksFromScales(scaleList: Scale[]): DeptBlock[] {
    const map = new Map<string, DeptBlock>();
    for (const s of scaleList) {
      const deptName = s.department_name?.trim() || 'Sem Departamento';
      const deptId   = s.department_id ?? null;
      if (!map.has(deptName)) {
        map.set(deptName, { department_id: deptId, department_name: deptName, scales: [] });
      }
      map.get(deptName)!.scales.push({
        id:              s.id,
        status:          s.status,
        member_name:     s.member_name || '—',
        member_id:       s.member_id,
        sector_name:     s.sector_name || '—',
        department_id:   deptId,
        department_name: deptName,
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.department_id === null) return 1;
      if (b.department_id === null) return -1;
      return (a.department_id ?? 0) - (b.department_id ?? 0);
    });
  }

  // ── blocos por departamento (tenta API, fallback client-side) ──────────────
  const fetchDeptBlocks = useCallback(async () => {
    if (!selectedCult) { setDeptBlocks([]); return; }
    setDeptLoading(true);
    try {
      const data = await api.get<DeptBlock[]>(`/scales/by-department/${selectedCult}`);
      if (data && data.length > 0) {
        setDeptBlocks(data);
      } else {
        // API vazia: constrói dos scales planos
        const flat = await api.get<Scale[]>(`/scales?cult_id=${selectedCult}`);
        setDeptBlocks(buildDeptBlocksFromScales(flat || []));
      }
    } catch {
      // API com erro (502 etc): constrói client-side
      try {
        const flat = await api.get<Scale[]>(`/scales?cult_id=${selectedCult}`);
        setDeptBlocks(buildDeptBlocksFromScales(flat || []));
      } catch {
        setDeptBlocks([]);
      }
    } finally {
      setDeptLoading(false);
    }
  }, [selectedCult]);

  useEffect(() => { fetchDeptBlocks(); }, [fetchDeptBlocks]);

  // ── quando scales mudar, garante que deptBlocks seja preenchido ────────────
  useEffect(() => {
    if (scales && scales.length > 0 && deptBlocks.length === 0 && !deptLoading) {
      setDeptBlocks(buildDeptBlocksFromScales(scales));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scales]);

  // ── realtime ───────────────────────────────────────────────────────────────
  const suppressRT   = useRef(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refScalesRef = useRef(refetchScales);
  const refDeptsRef  = useRef(fetchDeptBlocks);
  const refCultsRef  = useRef(refetchCults);
  useEffect(() => { refScalesRef.current = refetchScales; }, [refetchScales]);
  useEffect(() => { refDeptsRef.current  = fetchDeptBlocks; }, [fetchDeptBlocks]);
  useEffect(() => { refCultsRef.current  = refetchCults;  }, [refetchCults]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb.channel('scales-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        if (suppressRT.current) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          refScalesRef.current();
          refDeptsRef.current();
        }, 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => {
        if (suppressRT.current) return;
        refCultsRef.current();
      })
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      sb.removeChannel(ch);
    };
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────
  function toggleBlock(key: string) {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  /** Recarrega cultos e seleciona o 1º do mês/culto gerado */
  async function reloadAfterGenerate(forMonth: string | null, forCultId: number | null) {
    await refetchCults();
    try {
      const fresh = await api.get<Cult[]>('/cults?status=Agendado');
      if (forCultId) {
        const exists = (fresh || []).find(c => c.id === forCultId);
        if (exists) { setSelectedCult(forCultId); return; }
      }
      if (forMonth) {
        const monthCults = (fresh || [])
          .filter(c => c.date.startsWith(forMonth))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (monthCults.length > 0) setSelectedCult(monthCults[0].id);
      }
    } catch { /* silently ignore */ }
  }

  // ── gerar automático ───────────────────────────────────────────────────────
  async function generateAuto() {
    if (!selectedCult && autoType !== 'month') {
      setAutoError('Selecione um culto antes de gerar');
      return;
    }
    setAutoLoading(true);
    setAutoError('');
    setAutoSuccess(null);
    const payload = autoType === 'month'
      ? { type: 'month', month: printMonth }
      : { type: autoType, cult_id: selectedCult };
    try {
      const res = await api.post<{
        created?: number; cults_count?: number; scales_count?: number;
      }>('/scales/auto-generate', payload);

      const created    = res?.scales_count ?? res?.created ?? 0;
      const cultsCount = res?.cults_count ?? (autoType !== 'month' ? 1 : undefined);
      const labels     = { month: 'Mês Inteiro', standard: 'Cultos Padrão', thematic: 'Cultos Temáticos' };
      setAutoSuccess({ created, cultsCount, label: labels[autoType] });

      if (autoType === 'month') {
        await reloadAfterGenerate(printMonth, null);
      } else {
        await reloadAfterGenerate(null, selectedCult);
        await refetchScales();
        await fetchDeptBlocks();
      }
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Erro ao gerar escala');
    } finally {
      setAutoLoading(false);
    }
  }

  // ── abrir modal de preenchimento com todos os setores/departamentos ─────────
  async function openFillModal() {
    if (!selectedCult) return;
    setFillLoading(true);
    setFillMsg('');
    setFillSlots([]);
    setFillModal(true);
    try {
      // Carrega escalas atuais do culto
      const currentScales = await api.get<Scale[]>(`/scales?cult_id=${selectedCult}`);
      // Monta mapa: sector_id → { scale_id, member_id }
      const scaleMap = new Map<number, { scale_id: number; member_id: number }>();
      (currentScales || []).forEach(s => {
        scaleMap.set(s.sector_id, { scale_id: s.id, member_id: s.member_id });
      });
      // Constrói slots para todos os setores ativos
      const allSectors = sectors || [];
      const slots: FillSlot[] = allSectors
        .sort((a, b) => {
          const dA = a.department_id ?? 999;
          const dB = b.department_id ?? 999;
          return dA !== dB ? dA - dB : a.name.localeCompare(b.name);
        })
        .map(s => {
          const existing = scaleMap.get(s.id);
          return {
            sector_id:       s.id,
            sector_name:     s.name,
            department_id:   s.department_id ?? null,
            department_name: s.department_name || 'Sem Departamento',
            scale_id:        existing?.scale_id ?? null,
            member_id:       existing?.member_id ?? null,
          };
        });
      setFillSlots(slots);
    } catch (e) {
      setFillMsg('❌ Erro ao carregar setores: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally { setFillLoading(false); }
  }

  // ── preencher automaticamente os slots vazios ──────────────────────────────
  async function autoFillCult() {
    if (!selectedCult) return;
    setFillLoading(true);
    setFillMsg('');
    try {
      const res = await api.post<{ message: string; created: number }>(
        '/scales/fill-cult', { cult_id: selectedCult }
      );
      setFillMsg('✅ ' + (res.message || `${res.created} escalas preenchidas`));
      // Recarrega slots com os novos dados
      const currentScales = await api.get<Scale[]>(`/scales?cult_id=${selectedCult}`);
      const scaleMap = new Map<number, { scale_id: number; member_id: number }>();
      (currentScales || []).forEach(s => scaleMap.set(s.sector_id, { scale_id: s.id, member_id: s.member_id }));
      setFillSlots(prev => prev.map(slot => {
        const existing = scaleMap.get(slot.sector_id);
        return existing
          ? { ...slot, scale_id: existing.scale_id, member_id: existing.member_id }
          : slot;
      }));
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) {
      setFillMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao preencher'));
    } finally { setFillLoading(false); }
  }

  // ── salvar alterações manuais nos slots ────────────────────────────────────
  async function saveFillSlots() {
    if (!selectedCult) return;
    setFillSaving(true);
    setFillMsg('');
    try {
      // Recarrega escalas atuais para comparar
      const currentScales = await api.get<Scale[]>(`/scales?cult_id=${selectedCult}`);
      const scaleMap = new Map<number, { scale_id: number; member_id: number }>();
      (currentScales || []).forEach(s => scaleMap.set(s.sector_id, { scale_id: s.id, member_id: s.member_id }));

      // Conta escalas no mês para cada voluntário novo/alterado
      const month = selectedCultData?.date.slice(0, 7) || '';
      const monthCults = availableCults.filter(c => month && c.date.startsWith(month) && c.id !== selectedCult);
      const monthScaleResults = await Promise.all(
        monthCults.map(c => api.get<Scale[]>(`/scales?cult_id=${c.id}`).catch(() => [] as Scale[]))
      );
      const monthScalesFlat = monthScaleResults.flat();
      const monthCountMap = new Map<number, number>();
      monthScalesFlat.forEach(s => {
        monthCountMap.set(s.member_id, (monthCountMap.get(s.member_id) || 0) + 1);
      });

      const warnings: string[] = [];
      const ops: Promise<any>[] = [];
      for (const slot of fillSlots) {
        const existing = scaleMap.get(slot.sector_id);
        if (slot.member_id && !existing) {
          // Novo: verificar regra 3x antes
          const monthCount = monthCountMap.get(slot.member_id) || 0;
          if (monthCount >= 3) {
            const m = (members || []).find(m => m.id === slot.member_id);
            warnings.push(`${m?.name || 'Voluntário'} já tem ${monthCount} escala(s) no mês — setor ${slot.sector_name} ignorado.`);
          } else {
            ops.push(api.post('/scales', { cult_id: selectedCult, member_id: slot.member_id, sector_id: slot.sector_id }));
          }
        } else if (slot.member_id && existing && existing.member_id !== slot.member_id) {
          // Alterado: verifica novo voluntário (remove o antigo sem verificar — já estava)
          const monthCount = monthCountMap.get(slot.member_id) || 0;
          if (monthCount >= 3) {
            const m = (members || []).find(m => m.id === slot.member_id);
            warnings.push(`${m?.name || 'Voluntário'} já tem ${monthCount} escala(s) no mês — setor ${slot.sector_name} mantido.`);
          } else {
            ops.push(api.delete(`/scales/${existing.scale_id}`).then(() =>
              api.post('/scales', { cult_id: selectedCult, member_id: slot.member_id, sector_id: slot.sector_id })
            ));
          }
        } else if (!slot.member_id && existing) {
          // Limpo: remover escala
          ops.push(api.delete(`/scales/${existing.scale_id}`));
        }
      }
      await Promise.all(ops);
      const warnText = warnings.length > 0 ? `
⚠️ ${warnings.join(' ')}` : '';
      setFillMsg('✅ Alterações salvas com sucesso!' + warnText);
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) {
      setFillMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao salvar'));
    } finally { setFillSaving(false); }
  }

  // ── criar culto ────────────────────────────────────────────────────────────
  async function createNewCult() {
    if (!newCult.date || !newCult.time) { setCultError('Data e Horário são obrigatórios'); return; }
    setSavingCult(true);
    setCultError('');
    try {
      const cult = await api.post<{ id: number }>('/cults', {
        type_id: newCult.type_id ? Number(newCult.type_id) : null,
        name:    newCult.name || null,
        date:    newCult.date,
        time:    newCult.time,
        status:  'Agendado',
      });
      setSelectedCult(cult.id);
      setNewCultModal(false);
      setNewCult({ type_id: '', name: '', date: '', time: '' });
      await refetchCults();
    } catch (e) {
      setCultError(e instanceof Error ? e.message : 'Erro ao criar');
    } finally { setSavingCult(false); }
  }

  // ── contagem de escalas do voluntário no mês do culto selecionado ──────────
  async function countMemberMonthScales(memberId: number): Promise<number> {
    if (!selectedCultData) return 0;
    const month = selectedCultData.date.slice(0, 7);
    // Usa os cultos já carregados + outros que possam existir
    const monthCults = availableCults.filter(c => c.date.startsWith(month));
    const cultIds = [...new Set([...monthCults.map(c => c.id)])];
    if (!cultIds.length) return 0;
    try {
      const results = await Promise.all(
        cultIds.map(id => api.get<Scale[]>(`/scales?cult_id=${id}`).catch(() => [] as Scale[]))
      );
      return results.flat().filter(s => s.member_id === memberId).length;
    } catch { return 0; }
  }

  // ── adicionar voluntário ───────────────────────────────────────────────────
  async function addToScale() {
    if (!selectedCult || !newScale.member_id || !newScale.sector_id) {
      setAddError('Voluntário e Setor são obrigatórios');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      // Verifica regra 3x/mês
      const count = await countMemberMonthScales(Number(newScale.member_id));
      if (count >= 3) {
        const m = (members || []).find(m => m.id === Number(newScale.member_id));
        setAddError(`${m?.name || 'Este voluntário'} já está em ${count} escala(s) neste mês (máx. 3).`);
        return;
      }
      await api.post('/scales', {
        cult_id:   selectedCult,
        member_id: Number(newScale.member_id),
        sector_id: Number(newScale.sector_id),
      });
      setAddModal(false);
      setNewScale({ member_id: '', sector_id: '' });
      setSelDept(null);
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally { setAddLoading(false); }
  }

  // ── confirmar escala ───────────────────────────────────────────────────────
  async function confirmScale(id: number) {
    try {
      await api.put(`/scales/${id}/confirm`, {});
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro'); }
  }

  // ── remover voluntário (culto permanece) ──────────────────────────────────
  async function removeScale(id: number) {
    if (!confirm('Remover este voluntário da escala?')) return;
    try {
      await api.delete(`/scales/${id}`);
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao remover');
    }
  }

  // ── remover escala inteira (culto permanece) ─────────────────────────────
  async function deleteEntireScale() {
    if (!selectedCult) return;
    setDeleteLoading(true);
    try {
      const fresh = await api.get<{ id: number }[]>(`/scales?cult_id=${selectedCult}`);
      if (fresh && fresh.length > 0) {
        await Promise.all(fresh.map(s => api.delete(`/scales/${s.id}`)));
      }
      setDeleteModal(false);
      setDeptBlocks([]);
      await refetchScales();
      await fetchDeptBlocks();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro ao remover'); }
    finally { setDeleteLoading(false); }
  }

  // ── troca ──────────────────────────────────────────────────────────────────
  async function confirmSwap() {
    if (!swapScaleId) return;
    setSwapLoading(true);
    setSwapMsg('');
    try {
      await api.post('/swaps', { scale_id: swapScaleId, suggested_email: swapEmail.trim() || undefined });
      setSwapMsg('✅ Solicitação enviada!');
      setTimeout(() => { setSwapModal(false); setSwapScaleId(null); }, 1500);
    } catch (e) {
      setSwapMsg('❌ ' + (e instanceof Error ? e.message : 'Erro'));
    } finally { setSwapLoading(false); }
  }

  // ── impressão ──────────────────────────────────────────────────────────────
  async function fetchDeptsForPrint(): Promise<{ id: number; name: string }[]> {
    try {
      const res = await fetch('/api/departments', { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch { /* usa fallback */ }
    return [
      { id: 1, name: 'Diáconos / Obreiros' }, { id: 2, name: 'Mídia' },
      { id: 3, name: 'Infantil' },             { id: 4, name: 'Louvor' },
      { id: 5, name: 'Una' },                  { id: 6, name: 'Bem-Vindos' },
    ];
  }

  async function openPrintModal(mode: 'cult' | 'month') {
    if (mode === 'cult' && (!scales || scales.length === 0 || !selectedCultData)) {
      alert('Selecione um culto com voluntários escalados antes de imprimir.');
      return;
    }
    const depts = await fetchDeptsForPrint();
    setAvailableDepts(depts);
    setSelectedDepts(depts.map(d => d.id));
    setPrintMode(mode);
    setPrintModal(true);
  }

  async function executePrint() {
    setPrintLoading(true);
    try {
      // Nomes dos departamentos selecionados (filtro por nome, não por ID hardcoded)
      const selectedDeptNames = selectedDepts.length > 0
        ? availableDepts.filter(d => selectedDepts.includes(d.id)).map(d => d.name)
        : null;

      // Filtra escala por nome de departamento
      function filterByDept(scaleList: Scale[]): Scale[] {
        if (!selectedDeptNames || selectedDeptNames.length === 0) return scaleList;
        return scaleList.filter(s => {
          const deptName = s.department_name?.trim() || s.sector_name || '';
          return selectedDeptNames.some(n => deptName.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(deptName.toLowerCase()));
        });
      }

      if (printMode === 'cult') {
        if (!scales || !selectedCultData) return;
        const filtered = filterByDept(scales);
        if (filtered.length === 0) {
          alert('Nenhuma escala encontrada para os departamentos selecionados.');
          return;
        }
        await exportScalePDF(
          filtered,
          selectedCultData,
          `${selectedCultData.name || selectedCultData.type_name || 'Culto'} — ${selectedCultData.date}`,
          undefined, undefined, undefined, undefined,
        );
      } else {
        const monthCults = availableCults
          .filter(c => c.date.startsWith(printMonth))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (monthCults.length === 0) {
          alert(`Nenhum culto agendado em ${printMonth}.`);
          return;
        }
        const token = getAuthToken();
        const results = await Promise.all(
          monthCults.map(c =>
            fetch(`/api/scales?cult_id=${c.id}`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : [])
              .then((s: Scale[]) => s)
              .catch(() => [] as Scale[])
          )
        );
        const allScales = filterByDept(results.flat());
        if (allScales.length === 0) {
          alert('Nenhuma escala encontrada para o período/departamentos selecionados.');
          return;
        }
        await exportScalePDF(
          allScales, null,
          `Escalas — ${printMonth}`,
          allScales, monthCults, undefined, undefined,
        );
      }
      setPrintModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao gerar PDF');
    } finally { setPrintLoading(false); }
  }

  // ── derivados ──────────────────────────────────────────────────────────────
  const selectedCultData = availableCults.find(c => c.id === selectedCult);
  const canManage        = isAdmin(user.role) || isLeader(user.role);

  const BLOCK_COLORS = [
    'border-amber-600/40 bg-amber-900/10',   'border-blue-600/40 bg-blue-900/10',
    'border-emerald-600/40 bg-emerald-900/10','border-purple-600/40 bg-purple-900/10',
    'border-rose-600/40 bg-rose-900/10',     'border-cyan-600/40 bg-cyan-900/10',
    'border-orange-600/40 bg-orange-900/10', 'border-teal-600/40 bg-teal-900/10',
  ];
  const HEADER_COLORS = [
    'bg-amber-900/30 text-amber-300',    'bg-blue-900/30 text-blue-300',
    'bg-emerald-900/30 text-emerald-300','bg-purple-900/30 text-purple-300',
    'bg-rose-900/30 text-rose-300',      'bg-cyan-900/30 text-cyan-300',
    'bg-orange-900/30 text-orange-300',  'bg-teal-900/30 text-teal-300',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-stone-100">Escalas</h1>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setNewCultModal(true); setCultError(''); }}>
                <Calendar size={16} /> Nova Escala
              </Button>
              {selectedCult && (
                <>
                  <Button size="sm" variant="secondary" onClick={openFillModal}>
                    <Zap size={16} /> Preencher Automático
                  </Button>
                  <Button size="sm" onClick={() => { setAddModal(true); setAddError(''); }}>
                    <Plus size={16} /> Adicionar Voluntário
                  </Button>
                  {isAdmin(user.role) && (
                    <Button size="sm" variant="danger" onClick={() => setDeleteModal(true)}>
                      <Trash2 size={16} /> Remover Escala
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {selectedCult && scales && (
            <Button variant="outline" size="sm" onClick={() => openPrintModal('cult')}>
              <Printer size={16} /> Imprimir Culto
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => openPrintModal('month')}>
              <Printer size={16} /> Imprimir Mês
            </Button>
            <input type="month" value={printMonth} onChange={e => setPrintMonth(e.target.value)}
              className="bg-stone-800 border border-stone-600 rounded-lg px-2 py-1.5 text-stone-300 text-xs focus:outline-none focus:border-amber-500"
              title="Selecionar mês para impressão" />
          </div>
        </div>
      </div>

      {/* Seletor de culto */}
      <Card className="p-4">
        <label className="text-xs text-stone-400 uppercase tracking-wide mb-2 block">
          Selecionar Culto / Evento
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedCult || ''}
            onChange={e => setSelectedCult(Number(e.target.value) || null)}
            className="w-full md:w-auto md:min-w-96 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="">Selecione um culto...</option>
            {availableCults.map(c => (
              <option key={c.id} value={c.id}>{cultLabel(c)}</option>
            ))}
          </select>
          {selectedCult && isAdmin(user.role) && (
            <div className="flex rounded-lg overflow-hidden border border-stone-700">
              <button onClick={() => setViewMode('departments')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'departments' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}>
                <Users size={13} /> Por Departamento
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}>
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
            <span>👥 {scales?.length ?? 0} voluntário(s)</span>
          </div>
        )}
      </Card>

      {/* Vista por departamento */}
      {selectedCult && viewMode === 'departments' && (
        <>
          {deptLoading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : deptBlocks.filter(b => b.scales.length > 0).length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-stone-500 text-sm">Nenhuma escala cadastrada para este culto</p>
              <p className="text-stone-600 text-xs mt-1">
                {canManage ? 'Clique em "Adicionar Voluntário" ou "Preencher Automático"' : 'Aguardando os líderes montarem as escalas'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {deptBlocks.filter(b => b.scales.length > 0).map((block, idx) => {
                const key       = String(block.department_id ?? 'none');
                const collapsed = collapsedBlocks.has(key);
                const confirmed = block.scales.filter(s => s.status === 'Confirmado').length;
                return (
                  <div key={key} className={`rounded-xl border ${BLOCK_COLORS[idx % BLOCK_COLORS.length]} overflow-hidden`}>
                    <button onClick={() => toggleBlock(key)}
                      className={`w-full flex items-center justify-between px-4 py-3 ${HEADER_COLORS[idx % HEADER_COLORS.length]} transition-opacity hover:opacity-80`}>
                      <div className="flex items-center gap-2">
                        <Users size={15} />
                        <span className="font-semibold text-sm">{block.department_name}</span>
                        <span className="text-xs opacity-70 ml-1">{block.scales.length} vol. · {confirmed} conf.</span>
                      </div>
                      {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </button>
                    {!collapsed && (
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
                              <Badge label={s.status}
                                color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'} />
                              {canManage && (
                                <>
                                  {s.status === 'Pendente' && isAdmin(user.role) && (
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

      {/* Lista completa */}
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
                    <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
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
                      <td className="p-3 text-stone-400 text-xs">{s.department_name || '—'}</td>
                      <td className="p-3">
                        <Badge label={s.status}
                          color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'} />
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {s.status === 'Pendente' && (
                            <button onClick={() => confirmScale(s.id)} title="Confirmar"
                              className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          <button onClick={() => { setSwapScaleId(s.id); setSwapEmail(''); setSwapMsg(''); setSwapModal(true); }}
                            title="Solicitar Troca" className="text-blue-400 hover:text-blue-300 p-1 transition-colors">
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

      {/* ══ MODAIS ══════════════════════════════════════════════════════════ */}

      {/* Gerar Automático */}
      <Modal open={autoModal}
        onClose={() => { setAutoModal(false); setAutoSuccess(null); setAutoError(''); }}
        title="Gerar Escala Automática" size="sm">
        <div className="space-y-4">
          {autoSuccess ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-300 font-semibold text-sm">Escala gerada com sucesso!</p>
                </div>
                <div className="bg-stone-800/60 rounded-lg px-3 py-2 text-xs">
                  <span className="text-stone-400">Tipo: </span>
                  <span className="text-stone-200 font-medium">{autoSuccess.label}</span>
                </div>
                <div className={`grid gap-3 ${autoSuccess.cultsCount !== undefined ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {autoSuccess.cultsCount !== undefined && (
                    <div className="bg-amber-900/30 rounded-lg p-3 text-center">
                      <p className="text-amber-200 text-2xl font-bold">{autoSuccess.cultsCount}</p>
                      <p className="text-amber-400 text-xs mt-0.5">{autoSuccess.cultsCount === 1 ? 'culto processado' : 'cultos processados'}</p>
                    </div>
                  )}
                  <div className="bg-emerald-900/30 rounded-lg p-3 text-center">
                    <p className="text-emerald-200 text-2xl font-bold">{autoSuccess.created}</p>
                    <p className="text-emerald-400 text-xs mt-0.5">{autoSuccess.created === 1 ? 'escala gerada' : 'escalas geradas'}</p>
                  </div>
                </div>
                <p className="text-stone-400 text-xs">
                  O primeiro culto do período foi selecionado — as escalas já estão visíveis na tela.
                </p>
              </div>
              <Button className="w-full" onClick={() => { setAutoModal(false); setAutoSuccess(null); }}>
                ✓ Fechar e Ver Escalas
              </Button>
            </div>
          ) : (
            <>
              <p className="text-stone-400 text-sm">
                Respeita as regras de não-repetição (máx. 3×/mês) e evita duplicidade de setor.
              </p>
              <div className="space-y-2">
                {([
                  { value: 'month',    label: 'Mês Inteiro' },
                  { value: 'standard', label: 'Cultos Padrão' },
                  { value: 'thematic', label: 'Cultos Temáticos' },
                ] as const).map(opt => (
                  <label key={opt.value}
                    className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-stone-700 hover:border-amber-600 transition-all">
                    <input type="radio" value={opt.value} checked={autoType === opt.value}
                      onChange={() => setAutoType(opt.value)} className="accent-amber-500" />
                    <span className="text-stone-200 text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {autoType === 'month' && (
                <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2 text-xs">
                  <span className="text-stone-400">Mês:</span>
                  <input type="month" value={printMonth} onChange={e => setPrintMonth(e.target.value)}
                    className="bg-transparent text-amber-300 focus:outline-none" />
                </div>
              )}
              {!selectedCult && autoType !== 'month' && (
                <p className="text-amber-400 text-xs">
                  ⚠️ Para gerar Cultos Padrão ou Temáticos, selecione um culto na tela principal primeiro.
                </p>
              )}
              {autoError && <p className="text-red-400 text-xs">{autoError}</p>}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setAutoModal(false)}>Cancelar</Button>
                <Button onClick={generateAuto} loading={autoLoading}
                  disabled={!selectedCult && autoType !== 'month'}>Gerar</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Preencher Automático — tabela completa por departamento */}
      <Modal open={fillModal} onClose={() => { setFillModal(false); setFillMsg(''); setFillSlots([]); }}
        title="Preencher Escala por Setor" size="xl">
        <div className="space-y-4">
          {/* Info do culto */}
          {selectedCultData && (
            <div className="flex flex-wrap items-center gap-4 bg-stone-800 border border-stone-600 rounded-lg px-4 py-3 text-xs">
              <span className="text-stone-400">Culto: <span className="text-stone-200 font-semibold">{selectedCultData.name || selectedCultData.type_name}</span></span>
              <span className="text-stone-400">Data: <span className="text-stone-200">{selectedCultData.date}</span></span>
              <span className="text-stone-400">Horário: <span className="text-stone-200">{selectedCultData.time}</span></span>
            </div>
          )}

          {/* Botão de preencher automático + status */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-stone-400 space-y-0.5">
              <p>Setores preenchidos: <span className="text-emerald-400 font-semibold">{fillSlots.filter(s => s.member_id).length}</span></p>
              <p>Setores vazios: <span className="text-amber-400 font-semibold">{fillSlots.filter(s => !s.member_id).length}</span></p>
            </div>
            <Button variant="secondary" size="sm" onClick={autoFillCult} loading={fillLoading}>
              <Zap size={14} /> Preencher Vazios Automaticamente
            </Button>
          </div>

          {fillMsg && (
            <p className={`text-sm font-medium ${fillMsg.startsWith('❌') ? 'text-red-400' : 'text-emerald-400'}`}>{fillMsg}</p>
          )}

          {/* Tabela de setores agrupados por departamento */}
          {fillLoading && fillSlots.length === 0 ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              {(() => {
                // Agrupa slots por departamento
                const deptMap = new Map<string, typeof fillSlots>();
                fillSlots.forEach(slot => {
                  const key = slot.department_name;
                  if (!deptMap.has(key)) deptMap.set(key, []);
                  deptMap.get(key)!.push(slot);
                });
                return Array.from(deptMap.entries()).map(([deptName, slots]) => (
                  <div key={deptName} className="rounded-xl border border-stone-700 overflow-hidden">
                    {/* Cabeçalho do departamento */}
                    <div className="bg-stone-800 px-4 py-2.5 flex items-center gap-2">
                      <Users size={13} className="text-amber-400" />
                      <span className="text-amber-300 font-semibold text-sm">{deptName}</span>
                      <span className="text-stone-500 text-xs ml-auto">
                        {slots.filter(s => s.member_id).length}/{slots.length} preenchido(s)
                      </span>
                    </div>
                    {/* Linhas de setor */}
                    <div className="divide-y divide-stone-800">
                      {slots.map(slot => (
                        <div key={slot.sector_id}
                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${slot.member_id ? 'bg-emerald-900/5' : 'bg-amber-900/5'}`}>
                          {/* Status dot */}
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.member_id ? 'bg-emerald-500' : 'bg-amber-500/50'}`} />
                          {/* Nome do setor */}
                          <span className="text-stone-300 text-sm w-36 flex-shrink-0">{slot.sector_name}</span>
                          {/* Select de membro */}
                          {isAdmin(user.role) ? (
                            <select
                              value={slot.member_id?.toString() || ''}
                              onChange={e => {
                                const newMemberId = e.target.value ? Number(e.target.value) : null;
                                setFillSlots(prev => prev.map(s =>
                                  s.sector_id === slot.sector_id ? { ...s, member_id: newMemberId } : s
                                ));
                              }}
                              className="flex-1 bg-stone-800 border border-stone-600 rounded-lg px-2 py-1.5 text-stone-100 text-xs focus:outline-none focus:border-amber-500 min-w-0">
                              <option value="">— Vazio —</option>
                              {(members || []).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`flex-1 text-sm ${slot.member_id ? 'text-stone-200' : 'text-stone-600 italic'}`}>
                              {slot.member_id
                                ? (members || []).find(m => m.id === slot.member_id)?.name || '—'
                                : 'Vazio'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t border-stone-800">
            <Button variant="outline" onClick={() => { setFillModal(false); setFillMsg(''); setFillSlots([]); }}>
              Fechar
            </Button>
            {isAdmin(user.role) && (
              <Button onClick={saveFillSlots} loading={fillSaving}>
                Salvar Alterações
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Nova Escala */}
      <Modal open={newCultModal} onClose={() => setNewCultModal(false)} title="Nova Escala" size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-xs">Preencha os dados do culto/evento.</p>
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wide mb-1 block">Tipo de Culto</label>
            <select value={newCult.type_id}
              onChange={e => {
                const ct = (cultTypes || []).find(c => c.id === Number(e.target.value));
                setNewCult(n => ({ ...n, type_id: e.target.value, time: ct?.default_time || n.time }));
              }}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
              <option value="">Selecionar tipo...</option>
              {(cultTypes || []).map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>
          </div>
          <Input label="Nome personalizado (opcional)" value={newCult.name}
            onChange={e => setNewCult(n => ({ ...n, name: e.target.value }))}
            placeholder="Ex: Culto de Aniversário" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data *" type="date" value={newCult.date}
              onChange={e => setNewCult(n => ({ ...n, date: e.target.value }))} />
            <Input label="Horário *" type="time" value={newCult.time}
              onChange={e => setNewCult(n => ({ ...n, time: e.target.value }))} />
          </div>
          {cultError && <p className="text-red-400 text-xs">{cultError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setNewCultModal(false)}>Cancelar</Button>
            <Button onClick={createNewCult} loading={savingCult}>Criar Escala</Button>
          </div>
        </div>
      </Modal>

      {/* Adicionar Voluntário */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setSelDept(null); }}
        title="Adicionar Voluntário à Escala" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date}</p>
            </div>
          )}
          <Select label="Voluntário *" value={newScale.member_id}
            onChange={e => setNewScale(n => ({ ...n, member_id: e.target.value }))}
            placeholder="Selecionar voluntário..."
            options={(members || []).map(m => ({ value: m.id, label: m.name }))} />
          <Select label="Departamento (filtro)" value={selDept?.toString() || ''}
            onChange={e => { setSelDept(e.target.value ? Number(e.target.value) : null); setNewScale(n => ({ ...n, sector_id: '' })); }}
            placeholder="Todos os departamentos"
            options={(sectors || [])
              .filter((s, i, arr) => s.department_id && arr.findIndex(x => x.department_id === s.department_id) === i)
              .map(s => ({ value: s.department_id!.toString(), label: s.department_name || 'Sem Departamento' }))} />
          <Select label="Setor / Local *" value={newScale.sector_id}
            onChange={e => setNewScale(n => ({ ...n, sector_id: e.target.value }))}
            placeholder="Selecionar setor..."
            options={(sectors || [])
              .filter(s => !selDept || s.department_id === selDept)
              .map(s => ({ value: s.id, label: s.name }))} />
          {addError && <p className="text-red-400 text-xs">{addError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setAddModal(false); setSelDept(null); }}>Cancelar</Button>
            <Button onClick={addToScale} loading={addLoading}>Adicionar</Button>
          </div>
        </div>
      </Modal>

      {/* Solicitar Troca */}
      <Modal open={swapModal} onClose={() => setSwapModal(false)} title="Solicitar Troca" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Informe o e-mail do voluntário sugerido, ou deixe em branco para qualquer disponível.
          </p>
          <Input label="E-mail sugerido (opcional)" type="email"
            value={swapEmail} onChange={e => setSwapEmail(e.target.value)}
            placeholder="voluntario@email.com" />
          {swapMsg && (
            <p className={`text-sm ${swapMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{swapMsg}</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSwapModal(false)}>Cancelar</Button>
            <Button onClick={confirmSwap} loading={swapLoading}>Confirmar Troca</Button>
          </div>
        </div>
      </Modal>

      {/* Remover Voluntários da Escala (culto permanece) */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remover Voluntários da Escala" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/40 rounded-lg p-4">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 text-sm font-semibold">Remover todos os voluntários</p>
              <p className="text-amber-400/80 text-xs mt-1">
                Todos os voluntários serão removidos desta escala. O culto continuará agendado.
                Para excluir o culto, acesse a tela <strong>Cultos / Eventos</strong>.
              </p>
            </div>
          </div>
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date} às {selectedCultData.time}</p>
              <p><span className="text-stone-300">Voluntários que serão removidos:</span> {scales?.length ?? 0}</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={deleteEntireScale} loading={deleteLoading}>
              <Trash2 size={15} /> Remover Voluntários
            </Button>
          </div>
        </div>
      </Modal>

      {/* Configurar Impressão */}
      <Modal open={printModal} onClose={() => setPrintModal(false)}
        title={printMode === 'cult' ? 'Imprimir Culto' : `Imprimir Mês — ${printMonth}`}
        size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Selecione os departamentos a incluir:</p>
          <div className="bg-stone-800 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
            {availableDepts.map(dept => (
              <label key={dept.id}
                className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-stone-700 transition-colors">
                <input type="checkbox" checked={selectedDepts.includes(dept.id)}
                  onChange={e => setSelectedDepts(prev =>
                    e.target.checked ? [...prev, dept.id] : prev.filter(id => id !== dept.id)
                  )}
                  className="w-4 h-4 accent-amber-500" />
                <span className="text-stone-200 text-sm">{dept.name}</span>
              </label>
            ))}
          </div>
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
            <p className="text-amber-200 text-xs">
              ✓ {selectedDepts.length} de {availableDepts.length} departamento(s) selecionado(s)
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSelectedDepts(availableDepts.map(d => d.id))}
              className="text-amber-400 hover:text-amber-300 transition-colors">Selecionar todos</button>
            <span className="text-stone-600">•</span>
            <button onClick={() => setSelectedDepts([])}
              className="text-stone-500 hover:text-stone-400 transition-colors">Limpar</button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPrintModal(false)}>Cancelar</Button>
            <Button onClick={executePrint} loading={printLoading} disabled={selectedDepts.length === 0}>
              <Printer size={16} /> Imprimir Agora
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
