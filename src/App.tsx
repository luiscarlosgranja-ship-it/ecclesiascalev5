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
import ChurchPage from './pages/ChurchPage';
import UsersPage from './pages/UsersPage';
import Layout from './components/Layout';
import type { AuthUser } from './types';

export type Page =
  | 'dashboard' | 'my-panel' | 'members' | 'scales'
  | 'cults' | 'registries' | 'swaps' | 'security' | 'backup'
  // Cadastros separados (podem ser abas dentro de RegistriesPage ou páginas próprias)
  | 'ministries' | 'departments' | 'sectors' | 'cult-types'
  // Segurança
  | 'restore' | 'activation' | 'activation-keys' | 'pastoral' | 'church' | 'users'
  | 'email-config' | 'logo';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Bug #5: inicializa a página respeitando o role salvo, evitando flash em 'dashboard'
  const [page, setPage] = useState<Page>(() => {
    try {
      const stored = localStorage.getItem('ecclesia_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.role === 'Secretaria') {
          const last = localStorage.getItem('ecclesia_last_page') as Page | null;
          return last || 'pastoral';
        }
      }
    } catch { /* ignora */ }
    return 'dashboard';
  });

  useEffect(() => {
    const stored = localStorage.getItem('ecclesia_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
      }
      catch { localStorage.removeItem('ecclesia_user'); }
    }
  }, []);

  function navigate(p: Page) {
    localStorage.setItem('ecclesia_last_page', p);
    setPage(p);
  }

  function handleLogin(u: AuthUser) {
    localStorage.setItem('ecclesia_user', JSON.stringify(u));
    setUser(u);
    if (u.role === 'Secretaria') {
      const last = localStorage.getItem('ecclesia_last_page') as Page | null;
      setPage(last || 'pastoral');
    } else {
      setPage('dashboard');
    }
  }

  function handleLogout() {
    localStorage.removeItem('ecclesia_user');
    localStorage.removeItem('ecclesia_last_page');
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


  return (
    <Layout user={user} page={page} setPage={p => navigate(p as Page)} onLogout={handleLogout}>
      {page === 'dashboard'  && <DashboardPage  user={user} setPage={p => navigate(p as Page)} />}
      {page === 'my-panel'   && <MyPanelPage    user={user} setPage={p => navigate(p as Page)} />}
      {page === 'members'    && <MembersPage    user={user} />}
      {page === 'scales'     && <ScalesPage     user={user} />}
      {page === 'cults'      && <CultsPage      user={user} />}
      {page === 'swaps'      && <SwapsPage      user={user} />}
      {page === 'security'   && <SecurityPage user={user} initialTab='reset'    hideTabs />}
      {page === 'church'     && <ChurchPage   user={user} />}
      {page === 'users'      && <UsersPage    user={user} />}
      {page === 'activation'      && <SecurityPage user={user} initialTab='activate'    hideTabs />}
      {page === 'activation-keys' && <SecurityPage user={user} initialTab='activation' hideTabs />}
      {/* Cadastros — RegistriesPage recebe qual aba abrir */}
      {(page === 'registries' || registryTab) && (
        <RegistriesPage user={user} initialTab={registryTab || undefined} />
      )}
      {page === 'pastoral'     && <PastoralPage user={user} />}
      {page === 'backup'       && <BackupPage user={user} initialTab='backup'       hideTabs />}
      {page === 'restore'      && <BackupPage user={user} initialTab='restore'      hideTabs />}
      {page === 'email-config' && <BackupPage user={user} initialTab='email-config' hideTabs />}
      {page === 'logo'         && <BackupPage user={user} initialTab='logo'         hideTabs />}
    </Layout>
  );
}
