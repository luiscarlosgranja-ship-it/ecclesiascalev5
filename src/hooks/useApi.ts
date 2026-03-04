import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { supabase } from '../utils/supabaseClient';

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useNotifications(userId: number | null) {
  const [notifications, setNotifications] = useState<import('../types').Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get<import('../types').Notification[]>(`/notifications/${userId}`);
      setNotifications(data);
      setUnread(data.filter(n => !n.is_read).length);
    } catch {}
  }, [userId]);

  // ─── Carrega notificações iniciais e escuta via Supabase Realtime ─────────────
  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    if (!supabase) return; // Realtime desativado se env vars não configuradas

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { fetchNotifications(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    await api.put(`/notifications/${id}/read`, {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnread(prev => Math.max(0, prev - 1));
  }, []);

  return { notifications, unread, markRead, refetch: fetchNotifications };
}
