import { useState, useEffect } from 'react';
import api from '../utils/api';

export interface TrialStatus {
  isActive: boolean;
  isTrial: boolean;
  daysLeft: number;
  isExpired: boolean;
  message: string;
}

export function useTrialStatus() {
  const [status, setStatus] = useState<TrialStatus>({
    isActive: true,
    isTrial: false,
    daysLeft: 7,
    isExpired: false,
    message: '',
  });

  useEffect(() => {
    api.get<TrialStatus>('/settings/trial').then(setStatus).catch(() => {});
  }, []);

  return status;
}
