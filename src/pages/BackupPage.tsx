import { useState } from 'react';
import { Database, Download, Loader2 } from 'lucide-react';
import { Card, Button } from '../components/ui';
import api from '../utils/api';
import type { AuthUser } from '../types';

interface Props { user: AuthUser; }

export default function BackupPage({ user }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function doBackup() {
    setLoading(true); setMessage('');
    try {
      const res = await api.post<{ url?: string; message: string }>('/backup', {});
      setMessage(res.message || 'Backup realizado com sucesso!');
      if (res.url) window.open(res.url, '_blank');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erro ao realizar backup');
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-stone-100">Backup</h1>
      <Card className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-amber-400" size={24} />
          <div>
            <p className="text-stone-200 font-medium">Backup de Dados</p>
            <p className="text-stone-500 text-xs mt-0.5">Salva todas as escalas, membros e configurações</p>
          </div>
        </div>
        {message && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm border ${message.includes('sucesso') ? 'bg-emerald-900/20 border-emerald-700 text-emerald-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
            {message}
          </div>
        )}
        <Button onClick={doBackup} loading={loading}>
          <Download size={16} /> Realizar Backup
        </Button>
      </Card>
    </div>
  );
}
