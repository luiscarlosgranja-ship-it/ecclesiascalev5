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
import PastoralPage from './pages/PastoralPage';
import MyPanelPage from './pages/MyPanelPage';
import Layout from './components/Layout';
import type { AuthUser } from './types';

export type Page =
  | 'dashboard' | 'my-panel' | 'members' | 'scales'
  | 'cults' | 'registries' | 'swaps' | 'security' | 'backup'
  // Cadastros separados (podem ser abas dentro de RegistriesPage ou páginas próprias)
  | 'ministries' | 'departments' | 'sectors' | 'cult-types'
  // Segurança
  | 'restore' | 'activation' | 'pastoral';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    const stored = localStorage.getItem('ecclesia_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
        if (u.role === 'Secretaria') setPage('pastoral');
      }
      catch { localStorage.removeItem('ecclesia_user'); }
    }
  }, []);

  function handleLogin(u: AuthUser) {
    localStorage.setItem('ecclesia_user', JSON.stringify(u));
    setUser(u);
    if (u.role === 'Secretaria') setPage('pastoral');
  }

  function handleLogout() {
    localStorage.removeItem('ecclesia_user');
    setUser(null);
    setPage('dashboard');
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  // Páginas de Cadastros — roteadas para RegistriesPage com tab ativa
  const registryTab =
    page === 'ministries'  ? 'ministries'  :
    page === 'departments' ? 'departments' :
    page === 'sectors'     ? 'sectors'     :
    page === 'cult-types'  ? 'cult-types'  : null;

  // Páginas de Segurança adicionais — roteadas para BackupPage com tab ativa
  const backupTab =
    page === 'restore' ? 'restore' : null;

  return (
    <Layout user={user} page={page} setPage={p => setPage(p as Page)} onLogout={handleLogout}>
      {page === 'dashboard'  && <DashboardPage  user={user} setPage={p => setPage(p as Page)} />}
      {page === 'my-panel'   && <MyPanelPage    user={user} setPage={p => setPage(p as Page)} />}
      {page === 'members'    && <MembersPage    user={user} />}
      {page === 'scales'     && <ScalesPage     user={user} />}
      {page === 'cults'      && <CultsPage      user={user} />}
      {page === 'swaps'      && <SwapsPage      user={user} />}
      {page === 'security'   && <SecurityPage   user={user} />}
      {page === 'activation'  && <SecurityPage   user={user} />}
      {/* Cadastros — RegistriesPage recebe qual aba abrir */}
      {(page === 'registries' || registryTab) && (
        <RegistriesPage user={user} initialTab={registryTab || undefined} />
      )}
      {/* Backup/Restaurar/Ativação — BackupPage recebe qual aba abrir */}
      {page === 'pastoral'  && <PastoralPage user={user} />}
      {(page === 'backup' || backupTab) && (
        <BackupPage user={user} initialTab={backupTab || undefined} />
      )}
    </Layout>
  );
}
