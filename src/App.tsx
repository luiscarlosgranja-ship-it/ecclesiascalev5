import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/MembersPage';
import ScalesPage from './pages/ScalesPage';
import CultsPage from './pages/CultsPage';
import RegistriesPage from './pages/RegistriesPage';
import SwapsPage from './pages/SwapsPage';
import SecurityPage from './pages/SecurityPage';
import BackupPage from './pages/BackupPage';
import MyPanelPage from './pages/MyPanelPage';
import Layout from './components/Layout';
import type { AuthUser } from './types';

export type Page =
  | 'dashboard' | 'my-panel' | 'members' | 'scales'
  | 'cults' | 'registries' | 'swaps' | 'security' | 'backup';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    const stored = localStorage.getItem('ecclesia_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); }
      catch { localStorage.removeItem('ecclesia_user'); }
    }
  }, []);

  function handleLogin(u: AuthUser) {
    localStorage.setItem('ecclesia_user', JSON.stringify(u));
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem('ecclesia_user');
    setUser(null);
    setPage('dashboard');
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <Layout user={user} page={page} setPage={p => setPage(p as Page)} onLogout={handleLogout}>
      {page === 'dashboard'  && <DashboardPage  user={user} setPage={p => setPage(p as Page)} />}
      {page === 'my-panel'   && <MyPanelPage    user={user} setPage={p => setPage(p as Page)} />}
      {page === 'members'    && <MembersPage    user={user} />}
      {page === 'scales'     && <ScalesPage     user={user} />}
      {page === 'cults'      && <CultsPage      user={user} />}
      {page === 'registries' && <RegistriesPage user={user} />}
      {page === 'swaps'      && <SwapsPage      user={user} />}
      {page === 'security'   && <SecurityPage   user={user} />}
      {page === 'backup'     && <BackupPage     user={user} />}
    </Layout>
  );
}
