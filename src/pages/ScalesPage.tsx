import { useState, useEffect, useMemo } from 'react';
import { Plus, Printer, Zap, Trash2, CheckCircle, Repeat, Calendar, Lock, Unlock, Users } from 'lucide-react';
import { Card, Button, Modal, Badge, Select, Spinner, Input } from '../components/ui';
import { useApi } from '../hooks/useApi';
import api from '../utils/api';
import { getSupabase } from '../utils/supabaseClient';
import type { AuthUser, Scale, Cult, Member, Sector, CultType, Department } from '../types';
import { isAdmin, isLeader } from '../utils/permissions';
import { exportScalePDF } from '../utils/pdf';

interface Props { user: AuthUser; }

export default function ScalesPage({ user }: Props) {
  const [selectedCult, setSelectedCult] = useState<number | null>(null);
  const [autoModal, setAutoModal] = useState(false);
  const [autoType, setAutoType] = useState<'standard' | 'thematic'>('standard');
  const [addModal, setAddModal] = useState(false);
  const [newCultModal, setNewCultModal] = useState(false);
  const [newScale, setNewScale] = useState({ member_id: '', sector_id: '' });
  const [newCult, setNewCult] = useState({ type_id: '', name: '', date: '', time: '', sector_id: '' });
  const [saving, setSaving] = useState(false);
  const [savingCult, setSavingCult] = useState(false);
  const [error, setError] = useState('');
  const [cultError, setCultError] = useState('');
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
  const { data: departments } = useApi<Department[]>('/departments');
  const { data: cultTypes } = useApi<CultType[]>('/cult_types');

  const availableCults = cults || [];

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('scales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scales' }, () => refetchScales())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cults' }, () => refetchCults())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [refetchScales, refetchCults]);

  // Quadros agrupados por departamento → setor
  const boardsByDepartment = useMemo(() => {
    if (!scales || !members) return [];
    const memberMap = new Map((members || []).map(m => [m.id, m]));
    const deptMap = new Map<number | null, Scale[]>();
    for (const s of scales) {
      const member = memberMap.get(s.member_id);
      const deptId = member?.department_id ?? null;
      if (!deptMap.has(deptId)) deptMap.set(deptId, []);
      deptMap.get(deptId)!.push(s);
    }
    const boards: { dept: Department | null; sectorGroups: { sector: string; scales: Scale[] }[] }[] = [];
    for (const [deptId, deptScales] of deptMap) {
      const dept = (departments || []).find(d => d.id === deptId) ?? null;
      const sectorMap = new Map<string, Scale[]>();
      for (const s of deptScales) {
        const key = s.sector_name || 'Sem Setor';
        if (!sectorMap.has(key)) sectorMap.set(key, []);
        sectorMap.get(key)!.push(s);
      }
      boards.push({ dept, sectorGroups: Array.from(sectorMap.entries()).map(([sector, scls]) => ({ sector, scales: scls })) });
    }
    return boards.sort((a, b) => !a.dept ? 1 : !b.dept ? -1 : a.dept.name.localeCompare(b.dept.name));
  }, [scales, members, departments]);

  async function generateAuto() {
    if (!selectedCult) { setError('Selecione um culto primeiro'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/scales/auto-generate', { type: autoType, cult_id: selectedCult });
      setAutoModal(false); refetchScales();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao gerar escala'); }
    finally { setSaving(false); }
  }

  async function confirmScale(id: number) { await api.put(`/scales/${id}/confirm`, {}); refetchScales(); }
  async function toggleLock(s: Scale) { await api.put(`/scales/${s.id}/lock`, { locked: !s.locked }); refetchScales(); }
  async function removeScale(id: number) {
    if (!confirm('Remover desta escala?')) return;
    await api.delete(`/scales/${id}`); refetchScales();
  }

  async function addToScale() {
    if (!selectedCult || !newScale.member_id || !newScale.sector_id) { setError('Voluntário e Setor são obrigatórios'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/scales', { cult_id: selectedCult, member_id: Number(newScale.member_id), sector_id: Number(newScale.sector_id) });
      setAddModal(false); setNewScale({ member_id: '', sector_id: '' }); refetchScales();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao adicionar'); }
    finally { setSaving(false); }
  }

  async function createNewCultScale() {
    if (!newCult.date || !newCult.time) { setCultError('Data e Horário são obrigatórios'); return; }
    setSavingCult(true); setCultError('');
    try {
      const cult = await api.post<{ id: number }>('/cults', { type_id: newCult.type_id ? Number(newCult.type_id) : null, name: newCult.name || null, date: newCult.date, time: newCult.time, status: 'Agendado' });
      setSelectedCult(cult.id); setNewCultModal(false); setNewCult({ type_id: '', name: '', date: '', time: '', sector_id: '' }); refetchCults();
    } catch (e) { setCultError(e instanceof Error ? e.message : 'Erro ao criar escala'); }
    finally { setSavingCult(false); }
  }

  function openSwapModal(scaleId: number) { setSwapScaleId(scaleId); setSwapEmail(''); setSwapMsg(''); setSwapModal(true); }

  async function confirmSwap() {
    if (!swapScaleId) return;
    setSwapSaving(true); setSwapMsg('');
    try {
      await api.post('/swaps', { scale_id: swapScaleId, suggested_email: swapEmail.trim() || undefined });
      setSwapMsg('✅ Solicitação enviada com sucesso!');
      setTimeout(() => { setSwapModal(false); setSwapScaleId(null); }, 1500);
    } catch (e) { setSwapMsg('❌ ' + (e instanceof Error ? e.message : 'Erro ao solicitar troca')); }
    finally { setSwapSaving(false); }
  }

  const selectedCultData = availableCults.find(c => c.id === selectedCult);
  const canRemove = user.role === 'SuperAdmin' || user.role === 'Admin';

  async function handlePrint() {
    if (!scales || !selectedCultData) return;
    await exportScalePDF(scales, selectedCultData, `Escala — ${selectedCultData.type_name || selectedCultData.name || 'Culto'}`);
  }

  async function handlePrintMonth() {
    const month = new Date().toISOString().slice(0, 7);
    const monthCults = availableCults.filter(c => c.date.startsWith(month));
    if (!monthCults.length) return;
    const stored = localStorage.getItem('ecclesia_user');
    const token = stored ? JSON.parse(stored).token : '';
    const results = await Promise.all(monthCults.map(c =>
      fetch(`/api/scales?cult_id=${c.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then((s: Scale[]) => s).catch(() => [] as Scale[])
    ));
    await exportScalePDF(results.flat(), null, `Escalas — ${month}`, results.flat(), monthCults);
  }

  function getCultLabel(c: Cult) { return `${c.name || c.type_name || 'Culto'} — ${c.date} ${c.time}`; }

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
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
              <Printer size={16} /> Imprimir Culto
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrintMonth}>
            <Printer size={16} /> Imprimir Mês
          </Button>
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
          {availableCults.map(c => <option key={c.id} value={c.id}>{getCultLabel(c)}</option>)}
        </select>
        {selectedCultData && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-400">
            <span>📅 {selectedCultData.date}</span>
            <span>🕐 {selectedCultData.time}</span>
            <span>📋 {selectedCultData.name || selectedCultData.type_name}</span>
            <span>👥 {scales?.length ?? 0} voluntário(s)</span>
          </div>
        )}
      </Card>

      {/* Quadros por Departamento */}
      {selectedCult && (
        <>
          {!scales ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : scales.length === 0 ? (
            <Card className="py-14 text-center">
              <Users size={36} className="mx-auto text-stone-600 mb-3" />
              <p className="text-stone-500 text-sm">Nenhum voluntário nesta escala</p>
              <p className="text-stone-600 text-xs mt-1">Clique em "Adicionar Voluntário" ou "Gerar Automático"</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {boardsByDepartment.map(({ dept, sectorGroups }) => (
                <Card key={dept?.id ?? 'sem-dept'} className="overflow-hidden">
                  {/* Cabeçalho do departamento */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-stone-800 border-b border-stone-700">
                    <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-stone-100 truncate">
                      {dept?.name ?? 'Sem Departamento'}
                    </h3>
                    <span className="ml-auto text-xs text-stone-500 shrink-0">
                      {sectorGroups.reduce((acc, sg) => acc + sg.scales.length, 0)} membro(s)
                    </span>
                  </div>

                  {/* Grupos por setor */}
                  <div className="divide-y divide-stone-800/60">
                    {sectorGroups.map(({ sector, scales: sScales }) => (
                      <div key={sector}>
                        <div className="px-4 py-1.5 bg-stone-800/30">
                          <span className="text-xs font-medium text-amber-400/70 uppercase tracking-wider">{sector}</span>
                        </div>
                        {sScales.map(s => (
                          <div key={s.id} className="flex items-center justify-between px-4 py-2 hover:bg-stone-800/20 transition-colors">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {s.locked && <Lock size={10} className="text-amber-400 shrink-0" />}
                              <span className="text-sm text-stone-200 truncate">{s.member_name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <Badge
                                label={s.status}
                                color={s.status === 'Confirmado' ? 'green' : s.status === 'Pendente' ? 'yellow' : s.status === 'Troca' ? 'blue' : 'red'}
                              />
                              {s.status === 'Pendente' && (
                                <button onClick={() => confirmScale(s.id)} title="Confirmar" className="text-emerald-400 hover:text-emerald-300 p-0.5 transition-colors">
                                  <CheckCircle size={13} />
                                </button>
                              )}
                              <button onClick={() => openSwapModal(s.id)} title="Troca" className="text-blue-400 hover:text-blue-300 p-0.5 transition-colors">
                                <Repeat size={13} />
                              </button>
                              {(isAdmin(user.role) || isLeader(user.role)) && (
                                <button onClick={() => toggleLock(s)} title={s.locked ? 'Destravar' : 'Travar'}
                                  className={`p-0.5 transition-colors ${s.locked ? 'text-amber-400 hover:text-amber-300' : 'text-stone-500 hover:text-amber-400'}`}>
                                  {s.locked ? <Lock size={13} /> : <Unlock size={13} />}
                                </button>
                              )}
                              {canRemove && (
                                <button onClick={() => removeScale(s.id)} title="Remover" className="text-red-400 hover:text-red-300 p-0.5 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal: Troca */}
      <Modal open={swapModal} onClose={() => setSwapModal(false)} title="Solicitar Troca" size="sm">
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Informe o e-mail do voluntário sugerido ou deixe em branco para qualquer disponível.</p>
          <Input label="E-mail do voluntário sugerido (opcional)" type="email" value={swapEmail} onChange={e => setSwapEmail(e.target.value)} placeholder="voluntario@email.com" />
          {swapMsg && <p className={`text-sm ${swapMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{swapMsg}</p>}
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
            <select value={newCult.type_id} onChange={e => { const ct = (cultTypes||[]).find(c=>c.id===Number(e.target.value)); setNewCult(n=>({...n,type_id:e.target.value,time:ct?.default_time||n.time})); }}
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500">
              <option value="">Selecionar tipo...</option>
              {(cultTypes||[]).map(ct=><option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>
          </div>
          <Input label="Nome personalizado (opcional)" value={newCult.name} onChange={e=>setNewCult(n=>({...n,name:e.target.value}))} placeholder="Ex: Culto de Aniversário" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data *" type="date" value={newCult.date} onChange={e=>setNewCult(n=>({...n,date:e.target.value}))} />
            <Input label="Horário *" type="time" value={newCult.time} onChange={e=>setNewCult(n=>({...n,time:e.target.value}))} />
          </div>
          {cultError && <p className="text-red-400 text-xs">{cultError}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setNewCultModal(false)}>Cancelar</Button>
            <Button onClick={createNewCultScale} loading={savingCult}>Criar Escala</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Gerar Automático */}
      <Modal open={autoModal} onClose={() => setAutoModal(false)} title="Gerar Escala Automática" size="sm">
        <div className="space-y-4">
          {!selectedCult && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-amber-300 text-xs">
              ⚠️ Selecione um culto antes de gerar.
            </div>
          )}
          <p className="text-stone-400 text-sm">Respeita o limite semanal por voluntário, vagas travadas e evita duplicidade de setor.</p>
          <div className="space-y-2">
            {[
              { value: 'standard', label: '📋 Cultos Padrão', desc: 'Para cultos do tipo padrão agendados' },
              { value: 'thematic', label: '🎉 Cultos Temáticos', desc: 'Para cultos temáticos agendados' },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-stone-700 hover:border-amber-600 transition-all">
                <input type="radio" value={opt.value} checked={autoType === opt.value} onChange={() => setAutoType(opt.value as any)} className="accent-amber-500 mt-0.5" />
                <div>
                  <span className="text-stone-200 text-sm font-medium">{opt.label}</span>
                  <p className="text-stone-500 text-xs mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setAutoModal(false)}>Cancelar</Button>
            <Button onClick={generateAuto} loading={saving} disabled={!selectedCult}>Gerar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Adicionar Voluntário */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Adicionar Voluntário à Escala" size="sm">
        <div className="space-y-4">
          {selectedCultData && (
            <div className="bg-stone-800/50 rounded-lg p-3 text-xs text-stone-400 space-y-1">
              <p><span className="text-stone-300">Culto:</span> {selectedCultData.name || selectedCultData.type_name}</p>
              <p><span className="text-stone-300">Data:</span> {selectedCultData.date} — {selectedCultData.time}</p>
            </div>
          )}
          <Select label="Voluntário *" value={newScale.member_id} onChange={e=>setNewScale(n=>({...n,member_id:e.target.value}))} placeholder="Selecionar voluntário..."
            options={(members||[]).map(m=>({ value:m.id, label:`${m.name}${m.department_name?` — ${m.department_name}`:''}` }))} />
          <Select label="Setor / Local *" value={newScale.sector_id} onChange={e=>setNewScale(n=>({...n,sector_id:e.target.value}))} placeholder="Selecionar setor..."
            options={(sectors||[]).map(s=>({ value:s.id, label:s.name }))} />
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
