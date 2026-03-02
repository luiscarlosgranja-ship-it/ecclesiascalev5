import { useState, useEffect } from 'react';
import { Church, Save, Loader2 } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';

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

  useEffect(() => {
    api.get<ChurchData>('/church')
      .then(d => setData({ ...EMPTY, ...d }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof ChurchData, v: string) => setData(p => ({ ...p, [k]: v }));

  async function save() {
    if (!data.name.trim()) { setError('Nome da igreja é obrigatório'); return; }
    setSaving(true); setMsg(''); setError('');
    try {
      await api.put('/church', data);
      setMsg('✅ Dados salvos com sucesso!');
      // Atualiza o nome no topo do sistema
      window.dispatchEvent(new CustomEvent('church-updated', { detail: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
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

      <Card className="p-6 space-y-5">
        {/* Identificação */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Identificação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Nome da Igreja *"
                value={data.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Ex: Igreja Batista Central"
              />
            </div>
            <Input
              label="CNPJ"
              value={data.cnpj}
              onChange={e => set('cnpj', e.target.value)}
              placeholder="00.000.000/0000-00"
            />
            <Input
              label="Telefone para Contato"
              value={data.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="(21) 99999-0000"
            />
          </div>
        </div>

        {/* Endereço */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Endereço</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Endereço"
                value={data.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Rua, número, complemento"
              />
            </div>
            <Input
              label="Bairro"
              value={data.neighborhood}
              onChange={e => set('neighborhood', e.target.value)}
              placeholder="Bairro"
            />
            <Input
              label="Cidade"
              value={data.city}
              onChange={e => set('city', e.target.value)}
              placeholder="Cidade"
            />
            <Input
              label="CEP"
              value={data.zip}
              onChange={e => set('zip', e.target.value)}
              placeholder="00000-000"
            />
          </div>
        </div>

        {/* Liderança */}
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mb-3">Liderança</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Pastor Dirigente"
              value={data.pastor_dirigente}
              onChange={e => set('pastor_dirigente', e.target.value)}
              placeholder="Nome do pastor dirigente"
            />
            <Input
              label="Pastor Presidente"
              value={data.pastor_presidente}
              onChange={e => set('pastor_presidente', e.target.value)}
              placeholder="Nome do pastor presidente"
            />
          </div>
        </div>

        {msg && <p className="text-emerald-400 text-sm">{msg}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="pt-1">
          <Button onClick={save} loading={saving}>
            <Save size={15} /> Salvar Dados
          </Button>
        </div>
      </Card>
    </div>
  );
}
