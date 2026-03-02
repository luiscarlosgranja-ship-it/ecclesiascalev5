import { useState, useEffect, useRef } from 'react';
import { Church, Save, Loader2, Lock, Upload, Trash2, ImageIcon } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';
import { isSuperAdmin } from '../utils/permissions';

interface Props { user: AuthUser; }

interface ChurchData {
  name: string;
  cnpj: string;
  address: string;
  neighborhood: string;
  city: string;
  zip: string;
  phone: string;
  pastor_dirigente: string;
  pastor_presidente: string;
}

const EMPTY: ChurchData = {
  name: '', cnpj: '', address: '', neighborhood: '',
  city: '', zip: '', phone: '', pastor_dirigente: '', pastor_presidente: '',
};

export default function ChurchPage({ user }: Props) {
  const [data, setData] = useState<ChurchData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // ─── Logo ──────────────────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const readOnly = !isSuperAdmin(user.role);

  useEffect(() => {
    Promise.all([
      api.get<ChurchData>('/church').catch(() => EMPTY),
      fetch('/api/settings/logo').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([churchData, logoData]) => {
      setData({ ...EMPTY, ...churchData });
      if (logoData.logo) setLogoUrl(logoData.logo);
    }).finally(() => setLoading(false));
  }, []);

  const set = (k: keyof ChurchData, v: string) => setData(p => ({ ...p, [k]: v }));

  async function save() {
    if (!data.name.trim()) { setError('Nome da igreja é obrigatório'); return; }
    setSaving(true); setMsg(''); setError('');
    try {
      await api.put('/church', data);
      setMsg('✅ Dados salvos com sucesso!');
      window.dispatchEvent(new CustomEvent('church-updated', { detail: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { setLogoMsg('❌ Imagem muito grande. Máximo 500KB.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setSavingLogo(true); setLogoMsg('');
      try {
        await api.put('/settings/logo', { logo: base64 });
        setLogoUrl(base64);
        setLogoMsg('✅ Logo salvo!');
        window.dispatchEvent(new CustomEvent('church-updated', { detail: { ...data, logo: base64 } }));
      } catch (err) {
        setLogoMsg('❌ ' + (err instanceof Error ? err.message : 'Erro ao salvar logo'));
      } finally { setSavingLogo(false); }
    };
    reader.readAsDataURL(file);
  }

  async function removeLogo() {
    setSavingLogo(true); setLogoMsg('');
    try {
      await api.delete('/settings/logo');
      setLogoUrl(null);
      setLogoMsg('✅ Logo removido.');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setLogoMsg('❌ ' + (err instanceof Error ? err.message : 'Erro ao remover logo'));
    } finally { setSavingLogo(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-amber-500" size={28} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-600/20 border border-amber-600/30 flex items-center justify-center">
          <Church size={18} className="text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-stone-100">Dados da Igreja</h1>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-xl px-4 py-3">
          <Lock size={14} className="text-stone-400 flex-shrink-0" />
          <p className="text-stone-400 text-sm">Somente o <strong className="text-stone-200">SuperAdmin</strong> pode editar os dados da igreja.</p>
        </div>
      )}

      {/* Logo */}
      <Card className="p-5">
        <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-4">Logo da Igreja</p>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl border-2 border-stone-700 bg-stone-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              : <ImageIcon size={28} className="text-stone-600" />
            }
          </div>
          {!readOnly && (
            <div className="space-y-2">
              <p className="text-stone-400 text-xs">PNG, JPG ou SVG — máximo 500KB</p>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button size="sm" onClick={() => fileRef.current?.click()} loading={savingLogo}>
                  <Upload size={14} /> {logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                </Button>
                {logoUrl && (
                  <Button size="sm" variant="outline" onClick={removeLogo} loading={savingLogo}>
                    <Trash2 size={14} /> Remover
                  </Button>
                )}
              </div>
              {logoMsg && <p className={`text-xs ${logoMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{logoMsg}</p>}
            </div>
          )}
        </div>
      </Card>

      {/* Dados */}
      <Card className="p-6 space-y-5">
        {/* Identificação */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Identificação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Nome da Igreja *" value={data.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Igreja Batista Central" disabled={readOnly} />
            </div>
            <Input label="CNPJ" value={data.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" disabled={readOnly} />
            <Input label="Telefone para Contato" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="(21) 99999-0000" disabled={readOnly} />
          </div>
        </div>

        {/* Endereço */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Endereço</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Endereço" value={data.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número, complemento" disabled={readOnly} />
            </div>
            <Input label="Bairro" value={data.neighborhood} onChange={e => set('neighborhood', e.target.value)} placeholder="Bairro" disabled={readOnly} />
            <Input label="Cidade" value={data.city} onChange={e => set('city', e.target.value)} placeholder="Cidade" disabled={readOnly} />
            <Input label="CEP" value={data.zip} onChange={e => set('zip', e.target.value)} placeholder="00000-000" disabled={readOnly} />
          </div>
        </div>

        {/* Liderança */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Liderança</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Pastor Dirigente" value={data.pastor_dirigente} onChange={e => set('pastor_dirigente', e.target.value)} placeholder="Nome do pastor dirigente" disabled={readOnly} />
            <Input label="Pastor Presidente" value={data.pastor_presidente} onChange={e => set('pastor_presidente', e.target.value)} placeholder="Nome do pastor presidente" disabled={readOnly} />
          </div>
        </div>

        {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!readOnly && (
          <div className="pt-1">
            <Button onClick={save} loading={saving}><Save size={15} /> Salvar Dados</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
