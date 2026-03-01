import { useState, useEffect } from 'react';

export interface TrialStatus {
  isActive: boolean;
  isTrial: boolean;
  daysLeft: number;
  isExpired: boolean;
  message: string;
}

const DEFAULT: TrialStatus = {
  isActive: true,
  isTrial: false,
  daysLeft: 7,
  isExpired: false,
  message: '',
};

export function useTrialStatus() {
  const [status, setStatus] = useState<TrialStatus>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Usa fetch nativo — endpoint público, sem necessidade de token JWT
    fetch('/api/settings/trial', { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data: TrialStatus) => {
        setStatus(data);
        setLoaded(true);
      })
      .catch((err) => {
        // Em dev sem backend ativo, assume trial ativo para não ocultar o banner
        console.warn('[useTrialStatus] Falha ao buscar status do trial:', err.message);
        setStatus({ isActive: true, isTrial: true, daysLeft: 7, isExpired: false, message: '7 dia(s) restante(s)' });
        setLoaded(true);
      });
  }, []);

  return { ...status, loaded };
}
