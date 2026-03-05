import { useState, useEffect, useRef } from 'react';
import {
  Wand2, Plus, Zap, UserPlus, Trash2, Printer, CalendarDays,
  ChevronDown, CheckCircle2, AlertCircle, Users, X, Calendar,
} from 'lucide-react';
import { Card, Button, Modal, Badge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AuthUser } from '../types';

interface Props { user: AuthUser; }

interface Cult {
  id: number;
  name?: string;
  type_name?: string;
  date: string;
  time: string;
  status: string;
}

interface Department {
  id: number;
  name: string;
  sector_name?: string;
  is_active?: number;
}

interface Sector {
  id: number;
  name: string;
  is_active?: number;
}

interface Scale {
  id: number;
  cult_id: number;
  volunteer_id?: number;
  volunteer_name?: string;
  sector_id?: number;
  sector_name?: string;
  department_id?: number;
  department_name?: string;
  role?: string;
  status?: string;
}

interface ScaleEntry {
  department_id: number;
  department_name: string;
  sector_name?: string;
  volunteers: Scale[];
}

// ─── Gerar Escala Automática modal types ─────────────────────────────────────
type GenerateMode = 'mes-inteiro' | 'culto-especifico' | 'culto-padrao' | 'culto-tematico';

export default function ScalesPage({ user }: Props) {
  const [selectedCultId, setSelectedCultId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'department' | 'full'>('department');

  // Modals
  const [generateModal, setGenerateModal] = useState(false);
  const [printCultModal, setPrintCultModal] = useState(false);
  const [printMonthModal, setPrintMonthModal] = useState(false);
  const [addVolModal, setAddVolModal] = useState(false);
  const [removeScaleModal, setRemoveScaleModal] = useState(false);

  // Generate modal state
  const [generateMode, setGenerateMode] = useState<GenerateMode>('mes-inteiro');
  const [generateRefMonth, setGenerateRefMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ cultsCreated: number } | null>(null);
  const [generateError, setGenerateError] = useState('');

  // Print modal state
  const [selectedPrintDepts, setSelectedPrintDepts] = useState<Set<number>>(new Set());

  // Scales data
  const [scales, setScales] = useState<ScaleEntry[]>([]);
  const [loadingScales, setLoadingScales] = useState(false);

  const { data: cults, refetch: refetchCults } = useApi<Cult[]>('/cults');
  const { data: departments } = useApi<Department[]>('/departments?is_active=1');
  const { data: sectors } = useApi<Sector[]>('/sectors?is_active=1');

  const activeCults = (cults || []).filter(c => c.status !== 'Cancelado' && c.status !== 'Realizado');

  // Auto-select first cult
  useEffect(() => {
    if (!selectedCultId && activeCults.length > 0) {
      setSelectedCultId(activeCults[0].id);
    }
  }, [activeCults, selectedCultId]);

  // Load scales for selected cult
  useEffect(() => {
    if (!selectedCultId) return;
    loadScales(selectedCultId);
  }, [selectedCultId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('scales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => {
        if (selectedCultId) loadScales(selectedCultId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCultId]);

  async function loadScales(cultId: number) {
    setLoadingScales(true);
    try {
      const data = await api.get<Scale[]>(`/scales?cult_id=${cultId}`);
      // Group by department
      const grouped: Record<number, ScaleEntry> = {};
      (data || []).forEach(s => {
        const dId = s.department_id || 0;
        if (!grouped[dId]) {
          grouped[dId] = {
            department_id: dId,
            department_name: s.department_name || 'Sem Departamento',
            sector_name: s.sector_name,
            volunteers: [],
          };
        }
        grouped[dId].volunteers.push(s);
      });
      setScales(Object.values(grouped));
    } catch (e) {
      console.error('Erro ao carregar escalas', e);
      setScales([]);
    } finally {
      setLoadingScales(false);
    }
  }

  function getCultLabel(c: Cult) {
    return `${c.name || c.type_name || 'Culto'} — ${c.date} ${c.time}`;
  }

  function getSelectedCult() {
    return (cults || []).find(c => c.id === selectedCultId);
  }

  // ─── Generate Automatic Scale ────────────────────────────────────────────────
  function openGenerateModal() {
    setGenerateModal(true);
    setGenerateMode('mes-inteiro');
    setGenerateRefMonth(format(new Date(), 'yyyy-MM'));
    setGenerateResult(null);
    setGenerateError('');
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError('');
    try {
      if (generateMode === 'mes-inteiro') {
        // Generate empty scales for all departments for all cults in the month
        const monthCults = (cults || []).filter(c => {
          return c.date && c.date.startsWith(generateRefMonth) && c.status !== 'Cancelado';
        });

        if (monthCults.length === 0) {
          setGenerateError('Nenhum culto encontrado para o mês selecionado.');
          return;
        }

        const allDepts = departments || [];
        let createdCount = 0;

        for (const cult of monthCults) {
          for (const dept of allDepts) {
            try {
              // Create an empty scale slot for this dept in this cult
              await api.post('/scales/generate-empty', {
                cult_id: cult.id,
                department_id: dept.id,
              });
              createdCount++;
            } catch {
              // ignore if already exists
            }
          }
        }

        setGenerateResult({ cultsCreated: monthCults.length });
        if (selectedCultId) loadScales(selectedCultId);

      } else if (generateMode === 'culto-especifico' && selectedCultId) {
        const res = await api.post<{ message?: string; created?: number }>(
          `/scales/generate`,
          { cult_id: selectedCultId }
        );
        const count = res?.created ?? 0;
        setGenerateResult({ cultsCreated: count });
        loadScales(selectedCultId);

      } else if (generateMode === 'culto-padrao') {
        const res = await api.post<{ message?: string; created?: number }>(
          `/scales/generate-default`,
          { cult_id: selectedCultId }
        );
        const count = res?.created ?? 0;
        setGenerateResult({ cultsCreated: count });
        if (selectedCultId) loadScales(selectedCultId);

      } else if (generateMode === 'culto-tematico') {
        const res = await api.post<{ message?: string; created?: number }>(
          `/scales/generate-thematic`,
          { cult_id: selectedCultId }
        );
        const count = res?.created ?? 0;
        setGenerateResult({ cultsCreated: count });
        if (selectedCultId) loadScales(selectedCultId);
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Erro ao gerar escala');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Print helpers ────────────────────────────────────────────────────────────
  function openPrintCultModal() {
    setSelectedPrintDepts(new Set());
    setPrintCultModal(true);
  }

  function openPrintMonthModal() {
    setSelectedPrintDepts(new Set());
    setPrintMonthModal(true);
  }

  function togglePrintDept(id: number) {
    setSelectedPrintDepts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllDepts() {
    setSelectedPrintDepts(new Set((departments || []).map(d => d.id)));
  }

  function clearDepts() {
    setSelectedPrintDepts(new Set());
  }

  function printCultNow() {
    const cult = getSelectedCult();
    if (!cult) return;
    const filteredDepts = selectedPrintDepts.size > 0
      ? scales.filter(s => selectedPrintDepts.has(s.department_id))
      : scales;
    doPrint(filteredDepts, `Escala do Culto — ${getCultLabel(cult)}`);
    setPrintCultModal(false);
  }

  async function printMonthNow() {
    const refMonth = format(new Date(), 'yyyy-MM');
    const monthCults = (cults || []).filter(c => c.date?.startsWith(refMonth) && c.status !== 'Cancelado');

    // Build print data
    const sections: { cult: Cult; depts: ScaleEntry[] }[] = [];
    for (const cult of monthCults) {
      try {
        const data = await api.get<Scale[]>(`/scales?cult_id=${cult.id}`);
        const grouped: Record<number, ScaleEntry> = {};
        (data || []).forEach(s => {
          const dId = s.department_id || 0;
          if (!grouped[dId]) {
            grouped[dId] = {
              department_id: dId,
              department_name: s.department_name || 'Sem Departamento',
              sector_name: s.sector_name,
              volunteers: [],
            };
          }
          grouped[dId].volunteers.push(s);
        });
        const depts = Object.values(grouped).filter(d =>
          selectedPrintDepts.size === 0 || selectedPrintDepts.has(d.department_id)
        );
        sections.push({ cult, depts });
      } catch { }
    }

    doMonthPrint(sections, `Escala do Mês — ${format(new Date(), 'MMMM yyyy', { locale: ptBR })}`);
    setPrintMonthModal(false);
  }

  function doPrint(depts: ScaleEntry[], title: string) {
    const html = buildPrintHtml(title, depts.map(dept => `
      <div class="dept-block">
        <h3>${dept.department_name}${dept.sector_name ? ` <small>(${dept.sector_name})</small>` : ''}</h3>
        ${dept.volunteers.length === 0
          ? '<p class="empty-row">Nenhum voluntário escalado</p>'
          : `<table><thead><tr><th>#</th><th>Voluntário</th><th>Função</th><th>Status</th></tr></thead><tbody>
              ${dept.volunteers.map((v, i) => `<tr><td>${i + 1}</td><td>${v.volunteer_name || '—'}</td><td>${v.role || '—'}</td><td>${v.status || 'Pendente'}</td></tr>`).join('')}
            </tbody></table>`
        }
      </div>
    `).join(''));
    openPrintWindow(html);
  }

  function doMonthPrint(sections: { cult: Cult; depts: ScaleEntry[] }[], title: string) {
    const content = sections.map(({ cult, depts }) => `
      <div class="cult-section">
        <h2>${cult.name || cult.type_name || 'Culto'} — ${cult.date} às ${cult.time}</h2>
        ${depts.map(dept => `
          <div class="dept-block">
            <h3>${dept.department_name}${dept.sector_name ? ` <small>(${dept.sector_name})</small>` : ''}</h3>
            ${dept.volunteers.length === 0
              ? '<p class="empty-row">Nenhum voluntário escalado</p>'
              : `<table><thead><tr><th>#</th><th>Voluntário</th><th>Função</th><th>Status</th></tr></thead><tbody>
                  ${dept.volunteers.map((v, i) => `<tr><td>${i + 1}</td><td>${v.volunteer_name || '—'}</td><td>${v.role || '—'}</td><td>${v.status || 'Pendente'}</td></tr>`).join('')}
                </tbody></table>`
            }
          </div>
        `).join('')}
      </div>
    `).join('');
    openPrintWindow(buildPrintHtml(title, content));
  }

  function buildPrintHtml(title: string, content: string) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; font-size: 12px; color: #1a1a1a; background: white; }
  .header { border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 18px; color: #b45309; font-weight: 700; }
  .header p { color: #666; font-size: 11px; margin-top: 4px; }
  .cult-section { margin-bottom: 32px; page-break-inside: avoid; }
  .cult-section h2 { font-size: 14px; background: #fef3c7; border-left: 4px solid #f59e0b; padding: 6px 10px; margin-bottom: 12px; border-radius: 0 4px 4px 0; }
  .dept-block { margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  .dept-block h3 { background: #f3f4f6; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
  .dept-block h3 small { font-weight: 400; color: #9ca3af; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1c1917; color: white; text-align: left; padding: 6px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafafa; }
  .empty-row { padding: 10px 12px; color: #9ca3af; font-style: italic; font-size: 11px; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .cult-section { page-break-after: auto; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>${title}</h1>
  <p>Gerado em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</p>
</div>
${content}
</body>
</html>`;
  }

  function openPrintWindow(html: string) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  // ─── Remove all scales for selected cult ─────────────────────────────────────
  async function handleRemoveScale() {
    if (!selectedCultId) return;
    try {
      await api.delete(`/scales?cult_id=${selectedCultId}`);
      setRemoveScaleModal(false);
      loadScales(selectedCultId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao remover escalas');
    }
  }

  const selectedCult = getSelectedCult();
  const totalVolunteers = scales.reduce((acc, d) => acc + d.volunteers.length, 0);
  const confirmedVolunteers = scales.reduce((acc, d) => acc + d.volunteers.filter(v => v.status === 'Confirmado').length, 0);

  return (
    <div className="space-y-4">

      {/* ─── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-stone-100">Escalas</h1>

        {/* Action toolbar — improved layout */}
        <div className="flex flex-wrap gap-2">
          {/* Row 1: Generate & Create */}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={openGenerateModal}
              className="flex items-center gap-1.5 border border-stone-600">
              <Wand2 size={14} /> Gerar Automático
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAddVolModal(true)}
              className="flex items-center gap-1.5 border border-stone-600">
              <Plus size={14} /> Nova Escala
            </Button>
            <Button size="sm" variant="secondary"
              className="flex items-center gap-1.5 border border-stone-600">
              <Zap size={14} /> Preencher Automático
            </Button>
          </div>
          {/* Row 2: Volunteer & Remove */}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAddVolModal(true)}
              className="flex items-center gap-1.5">
              <UserPlus size={14} /> Adicionar Voluntário
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRemoveScaleModal(true)}
              className="flex items-center gap-1.5">
              <Trash2 size={14} /> Remover Escala
            </Button>
          </div>
          {/* Row 3: Print */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openPrintCultModal}
              className="flex items-center gap-1.5">
              <Printer size={14} /> Imprimir Culto
            </Button>
            <Button size="sm" variant="outline" onClick={openPrintMonthModal}
              className="flex items-center gap-1.5">
              <CalendarDays size={14} /> Imprimir Mês
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Cult selector + view toggle ────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 min-w-0">
            <label className="text-xs text-stone-500 uppercase tracking-widest mb-1.5 block">
              Selecionar Culto / Evento
            </label>
            <select
              value={selectedCultId || ''}
              onChange={e => setSelectedCultId(Number(e.target.value))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="">— Selecione um culto —</option>
              {activeCults.map(c => (
                <option key={c.id} value={c.id}>{getCultLabel(c)}</option>
              ))}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-stone-700 self-end sm:self-auto mt-1 sm:mt-6">
            <button
              onClick={() => setViewMode('department')}
              className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'department' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}
            >
              <Users size={13} /> Por Departamento
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'full' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-stone-200'}`}
            >
              Lista Completa
            </button>
          </div>
        </div>

        {/* Cult info bar */}
        {selectedCult && (
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-stone-800 text-xs text-stone-400">
            <span className="flex items-center gap-1.5">
              <Calendar size={12} className="text-amber-500" /> {selectedCult.date}
            </span>
            <span>🕐 {selectedCult.time}</span>
            <span>📋 {selectedCult.name || selectedCult.type_name}</span>
            <span className="flex items-center gap-1.5">
              <Users size={12} className="text-amber-500" /> {totalVolunteers} voluntário(s) escalado(s)
            </span>
            {confirmedVolunteers > 0 && (
              <span className="text-emerald-400">{confirmedVolunteers} confirmado(s)</span>
            )}
          </div>
        )}
      </Card>

      {/* ─── Scale content ───────────────────────────────────────────────────────── */}
      {!selectedCultId ? (
        <Card className="p-12 text-center">
          <Users size={40} className="text-stone-700 mx-auto mb-3" />
          <p className="text-stone-500">Selecione um culto para ver as escalas</p>
        </Card>
      ) : loadingScales ? (
        <Card className="p-12 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-stone-500 text-sm">Carregando escalas...</p>
        </Card>
      ) : viewMode === 'department' ? (
        /* Department view — block grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {scales.length === 0 ? (
            <div className="col-span-full">
              <Card className="p-12 text-center">
                <Users size={40} className="text-stone-700 mx-auto mb-3" />
                <p className="text-stone-400 font-medium">Nenhuma escala gerada para este culto</p>
                <p className="text-stone-500 text-sm mt-1">Clique em "Gerar Automático" para criar as escalas</p>
              </Card>
            </div>
          ) : scales.map(dept => (
            <DeptBlock key={dept.department_id} dept={dept} onRefresh={() => selectedCultId && loadScales(selectedCultId)} />
          ))}
        </div>
      ) : (
        /* Full list view */
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700 bg-stone-800/50">
                <th className="text-left p-3 text-stone-400 font-medium text-xs">#</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Voluntário</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Departamento</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Setor</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Função</th>
                <th className="text-left p-3 text-stone-400 font-medium text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {scales.flatMap(dept => dept.volunteers).map((v, i) => (
                <tr key={v.id} className="border-b border-stone-800 hover:bg-stone-800/30 transition-colors">
                  <td className="p-3 text-stone-500 text-xs">{i + 1}</td>
                  <td className="p-3 text-stone-200 font-medium">{v.volunteer_name || '—'}</td>
                  <td className="p-3 text-stone-400 text-xs">{v.department_name || '—'}</td>
                  <td className="p-3 text-stone-400 text-xs">{v.sector_name || '—'}</td>
                  <td className="p-3 text-stone-400 text-xs">{v.role || '—'}</td>
                  <td className="p-3">
                    <Badge label={v.status || 'Pendente'}
                      color={v.status === 'Confirmado' ? 'green' : v.status === 'Recusado' ? 'red' : 'yellow'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {scales.flatMap(d => d.volunteers).length === 0 && (
            <p className="text-center text-stone-500 text-sm py-10">Nenhum voluntário escalado</p>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Gerar Escala Automática                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal open={generateModal} onClose={() => setGenerateModal(false)} title="Gerar Escala Automática" size="md">
        <div className="space-y-5">
          {/* Info */}
          <p className="text-stone-400 text-sm leading-relaxed">
            O sistema respeitará as regras de não-repetição (máx. 3×/mês) e evitará duplicidade de setor.
          </p>

          {generateResult ? (
            /* Success state */
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <p className="text-emerald-300 font-semibold text-sm">Escala gerada com sucesso!</p>
                </div>
                <div className="bg-emerald-900/30 rounded-lg p-4 text-center">
                  <p className="text-emerald-200 text-3xl font-bold">{generateResult.cultsCreated}</p>
                  <p className="text-emerald-400 text-sm mt-1">
                    {generateResult.cultsCreated === 1 ? 'culto processado' : 'cultos processados'}
                  </p>
                </div>
                <p className="text-emerald-400/80 text-xs">
                  As escalas foram criadas em branco para cada departamento. Adicione os voluntários manualmente.
                </p>
              </div>
              <Button onClick={() => setGenerateModal(false)} className="w-full">Fechar</Button>
            </div>
          ) : (
            <>
              {/* Mode selector */}
              <div className="space-y-2">
                {([
                  { key: 'mes-inteiro', label: 'Mês Inteiro', desc: 'Gera escalas para todos os cultos do mês' },
                  { key: 'culto-especifico', label: 'Culto Específico', desc: 'Selecione um culto da lista' },
                  { key: 'culto-padrao', label: 'Cultos Padrão', desc: 'Culto selecionado na tela' },
                  { key: 'culto-tematico', label: 'Cultos Temáticos', desc: 'Culto selecionado na tela' },
                ] as { key: GenerateMode; label: string; desc: string }[]).map(opt => (
                  <label key={opt.key}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      generateMode === opt.key
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-stone-700 hover:border-stone-600 bg-stone-800/30'
                    }`}>
                    <input
                      type="radio"
                      name="generateMode"
                      value={opt.key}
                      checked={generateMode === opt.key}
                      onChange={() => setGenerateMode(opt.key)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <div>
                      <p className={`text-sm font-medium ${generateMode === opt.key ? 'text-amber-300' : 'text-stone-200'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Month picker — only for "Mês Inteiro" */}
              {generateMode === 'mes-inteiro' && (
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Mês de referência</label>
                  <input
                    type="month"
                    value={generateRefMonth}
                    onChange={e => setGenerateRefMonth(e.target.value)}
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-xs text-stone-500 mt-2">
                    Serão geradas escalas em branco para todos os departamentos ativos em cada culto do mês. Voluntários podem ser adicionados manualmente depois.
                  </p>
                </div>
              )}

              {/* Cult picker — for "Culto Específico" */}
              {generateMode === 'culto-especifico' && (
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-wide mb-1.5 block">Culto</label>
                  <select
                    value={selectedCultId || ''}
                    onChange={e => setSelectedCultId(Number(e.target.value))}
                    className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="">— Selecione —</option>
                    {activeCults.map(c => (
                      <option key={c.id} value={c.id}>{getCultLabel(c)}</option>
                    ))}
                  </select>
                </div>
              )}

              {generateError && (
                <div className="flex items-center gap-2 bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                  <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-300 text-xs">{generateError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setGenerateModal(false)}>Cancelar</Button>
                <Button onClick={handleGenerate} loading={generating}>Gerar</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Imprimir Culto                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal open={printCultModal} onClose={() => setPrintCultModal(false)} title="Configurar Impressão do Culto" size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Selecione quais departamentos deseja incluir na impressão:
          </p>

          <DeptCheckList
            departments={departments || []}
            selected={selectedPrintDepts}
            onToggle={togglePrintDept}
            onSelectAll={selectAllDepts}
            onClear={clearDepts}
          />

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPrintCultModal(false)}>Cancelar</Button>
            <Button onClick={printCultNow} className="flex items-center gap-2">
              <Printer size={15} /> Imprimir Agora
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Imprimir Mês                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal open={printMonthModal} onClose={() => setPrintMonthModal(false)} title="Configurar Impressão do Mês" size="md">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Selecione quais departamentos deseja incluir na impressão do mês:
          </p>

          <DeptCheckList
            departments={departments || []}
            selected={selectedPrintDepts}
            onToggle={togglePrintDept}
            onSelectAll={selectAllDepts}
            onClear={clearDepts}
          />

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPrintMonthModal(false)}>Cancelar</Button>
            <Button onClick={printMonthNow} className="flex items-center gap-2">
              <Printer size={15} /> Imprimir Agora
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Remover Escala                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal open={removeScaleModal} onClose={() => setRemoveScaleModal(false)} title="Remover Escala" size="sm">
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
            <p className="text-stone-200 text-sm">
              Deseja remover <strong className="text-red-300">todas as escalas</strong> do culto selecionado?
            </p>
            {selectedCult && (
              <p className="text-stone-500 text-xs mt-2">
                {getCultLabel(selectedCult)}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setRemoveScaleModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleRemoveScale}>
              <Trash2 size={14} /> Remover
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

// ─── DeptBlock sub-component ─────────────────────────────────────────────────
function DeptBlock({ dept, onRefresh }: { dept: ScaleEntry; onRefresh: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-stone-800/50 transition-colors border-b border-stone-800"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <Users size={15} className="text-amber-400" />
          <span className="text-stone-200 font-medium text-sm">{dept.department_name}</span>
          <span className="text-xs text-stone-500">{dept.volunteers.length} vol.</span>
          <span className="text-xs text-stone-600">•</span>
          <span className="text-xs text-stone-500">{dept.volunteers.filter(v => v.status === 'Confirmado').length} confirmado(s)</span>
        </div>
        <ChevronDown size={15} className={`text-stone-500 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </div>
      {!collapsed && (
        <div>
          {dept.volunteers.length === 0 ? (
            <p className="text-stone-600 text-xs text-center py-4 italic">Nenhum voluntário escalado</p>
          ) : (
            dept.volunteers.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2.5 border-b border-stone-800/50 last:border-0 hover:bg-stone-800/20 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-stone-600 w-4">{i + 1}</span>
                  <div>
                    <p className="text-stone-200 text-sm">{v.volunteer_name || '—'}</p>
                    {v.role && <p className="text-stone-500 text-xs">{v.role}</p>}
                  </div>
                </div>
                <Badge label={v.status || 'Pendente'}
                  color={v.status === 'Confirmado' ? 'green' : v.status === 'Recusado' ? 'red' : 'yellow'} />
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// ─── DeptCheckList sub-component ──────────────────────────────────────────────
function DeptCheckList({
  departments,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  departments: Department[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-stone-700 p-2 bg-stone-800/30">
        {departments.length === 0 ? (
          <p className="text-stone-500 text-sm text-center py-4 italic">Nenhum departamento disponível</p>
        ) : (
          departments.map(dept => (
            <label key={dept.id} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-stone-700/50 transition-colors">
              <input
                type="checkbox"
                checked={selected.has(dept.id)}
                onChange={() => onToggle(dept.id)}
                className="w-4 h-4 accent-amber-500"
              />
              <div className="flex-1">
                <p className="text-stone-200 text-sm">{dept.name}</p>
                {dept.sector_name && <p className="text-stone-500 text-xs">{dept.sector_name}</p>}
              </div>
            </label>
          ))
        )}
      </div>

      {/* Counter + actions */}
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
        selected.size > 0
          ? 'bg-amber-900/30 border border-amber-700/50 text-amber-300'
          : 'bg-stone-800 border border-stone-700 text-stone-400'
      }`}>
        <CheckCircle2 size={14} className={selected.size > 0 ? 'text-amber-400' : 'text-stone-600'} />
        <span className="flex-1 text-xs font-medium">
          ✓ {selected.size} de {departments.length} departamento(s) selecionado(s)
        </span>
      </div>

      <div className="flex gap-3">
        <button onClick={onSelectAll} className="text-amber-400 text-xs hover:text-amber-300 transition-colors">
          Selecionar todos
        </button>
        <span className="text-stone-600 text-xs">•</span>
        <button onClick={onClear} className="text-stone-500 text-xs hover:text-stone-400 transition-colors">
          Limpar
        </button>
      </div>
    </div>
  );
}
