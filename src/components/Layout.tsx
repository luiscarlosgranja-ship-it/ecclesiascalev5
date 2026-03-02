import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Calendar, Repeat, Settings, LogOut, Bell,
  BookOpen, Layers, Shield, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Database, Menu, X, Building2, Grid3X3, Church, RefreshCcw, KeyRound,
  Sun, Moon, HeartHandshake, Phone
} from 'lucide-react';
import type { AuthUser } from '../types';
import { useNotifications } from '../hooks/useApi';

type Page = string;

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Grupos de navegação ───────────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Geral',
    items: [
      { id: 'scales',    label: 'Escalas',    icon: <Calendar size={18} />,        roles: ['SuperAdmin', 'Admin', 'Líder'] },
      { id: 'cults',     label: 'Cultos',     icon: <Church size={18} />,          roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
      { id: 'swaps',     label: 'Trocas',     icon: <Repeat size={18} />,          roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
      { id: 'my-panel',  label: 'Meu Painel', icon: <BookOpen size={18} />,        roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { id: 'members',     label: 'Voluntários',    icon: <Users size={18} />,      roles: ['SuperAdmin', 'Admin', 'Líder'] },
      { id: 'ministries',  label: 'Ministérios',    icon: <Grid3X3 size={18} />,    roles: ['SuperAdmin', 'Admin'] },
      { id: 'departments', label: 'Departamentos',  icon: <Building2 size={18} />,  roles: ['SuperAdmin', 'Admin'] },
      { id: 'sectors',     label: 'Setores',        icon: <Layers size={18} />,     roles: ['SuperAdmin', 'Admin'] },
      { id: 'cult-types',  label: 'Tipos de Culto', icon: <Settings size={18} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'church',      label: 'Dados da Igreja', icon: <Church size={18} />,      roles: ['SuperAdmin'] },
    ],
  },
  {
    label: 'Pastoral',
    items: [
      { id: 'pastoral', label: 'Atendimento Pastoral', icon: <HeartHandshake size={18} />, roles: ['SuperAdmin', 'Admin', 'Secretaria'] },
    ],
  },
  {
    label: 'Backup',
    items: [
      { id: 'backup',  label: 'Backup',           icon: <Database size={18} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'restore', label: 'Restaurar Backup', icon: <RefreshCcw size={18} />, roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Segurança',
    items: [
      { id: 'security',   label: 'Reset de Senha',      icon: <Shield size={18} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'activation', label: 'Ativação do Sistema', icon: <KeyRound size={18} />, roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro', 'Secretaria'] },
    ],
  },
];

// Lista plana para lookup de label na topbar
const ALL_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'church', label: 'Dados da Igreja' },
  ...NAV_GROUPS.flatMap(g => g.items),
];

interface LayoutProps {
  user: AuthUser;
  page: Page;
  setPage: (p: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ user, page, setPage, onLogout, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ─── Tema claro/escuro ────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ecclesia_theme') as 'dark' | 'light') || 'dark';
  });
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') { html.classList.add('light'); html.classList.remove('dark'); }
    else { html.classList.remove('light'); html.classList.add('dark'); }
    localStorage.setItem('ecclesia_theme', theme);
  }, [theme]);
  function toggleTheme() { setTheme(t => t === 'dark' ? 'light' : 'dark'); }

  const [churchName, setChurchName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/public/church-name')
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (d.name) setChurchName(d.name); })
      .catch(() => {});
    fetch('/api/settings/logo')
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (d.logo) setLogoUrl(d.logo); })
      .catch(() => {});
    // Atualiza quando salvar os dados da igreja
    const handler = (e: any) => { if (e.detail?.name) setChurchName(e.detail.name); };
    window.addEventListener('church-updated', handler);
    return () => window.removeEventListener('church-updated', handler);
  }, []);

  const { unread, notifications, markRead } = useNotifications(user.member_id);
  const [notifOpen, setNotifOpen] = useState(false);

  // Filtra grupos e itens pelo role do usuário
  const filteredGroups = NAV_GROUPS.map((group, idx) => ({
    ...group,
    _key: `${group.label}-${idx}`,
    items: group.items.filter(item => item.roles.includes(user.role)),
  })).filter(group => group.items.length > 0);

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={clsx(
      'bg-stone-950 border-r border-stone-800 flex flex-col transition-all duration-300 z-40',
      mobile ? 'fixed inset-y-0 left-0 w-72' : (collapsed ? 'w-16' : 'w-64'),
      mobile ? 'shadow-2xl' : 'relative'
    )}>
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-stone-800', collapsed && !mobile && 'justify-center px-2')}>
        <button onClick={() => setPage('dashboard')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">{(churchName || 'E')[0].toUpperCase()}</span>
            </div>
          )}
          {(!collapsed || mobile) && (
            <div>
              <p className="text-amber-400 font-bold text-sm leading-none">{churchName || 'EcclesiaScale'}</p>
              <p className="text-stone-500 text-xs mt-0.5">{user.role}</p>
            </div>
          )}
        </button>
        {!mobile && (
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-stone-500 hover:text-stone-300 transition-colors">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav com grupos */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-1">
        {filteredGroups.map(group => (
          <div key={group._key}>
            {(!collapsed || mobile) && (
              <p className="text-stone-600 text-[10px] font-semibold uppercase tracking-widest px-3 pt-3 pb-1 select-none">
                {group.label}
              </p>
            )}
            {collapsed && !mobile && (
              <div className="border-t border-stone-800 my-2" />
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setPage(item.id); if (mobile) setMobileOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    page === item.id
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                      : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200',
                    collapsed && !mobile && 'justify-center px-2'
                  )}
                  title={collapsed && !mobile ? item.label : undefined}
                >
                  {item.icon}
                  {(!collapsed || mobile) && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-stone-800">
        <div className={clsx('flex items-center gap-2 mb-2', collapsed && !mobile && 'justify-center')}>
          {online
            ? <Wifi size={14} className="text-emerald-400" />
            : <WifiOff size={14} className="text-red-400" />}
          {(!collapsed || mobile) && (
            <span className={clsx('text-xs', online ? 'text-emerald-400' : 'text-red-400')}>
              {online ? 'Conectado' : 'Desconectado'}
            </span>
          )}
        </div>
        {(!collapsed || mobile) && (
          <div className="mb-2 px-1 py-2 bg-stone-900 rounded-lg border border-stone-800">
            <p className="text-stone-600 text-[10px] text-center leading-tight">EcclesiaScale v5.0</p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Phone size={9} className="text-stone-600" />
              <p className="text-stone-600 text-[10px] text-center leading-tight">21970031043</p>
            </div>
            <p className="text-stone-700 text-[9px] text-center leading-tight">Contato EcclesiaScale</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className={clsx('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-stone-400 hover:bg-red-900/20 hover:text-red-400 text-sm transition-all', collapsed && !mobile && 'justify-center')}
        >
          <LogOut size={16} />
          {(!collapsed || mobile) && 'Sair'}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-stone-950 overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <Sidebar mobile />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-stone-900 border-b border-stone-800 px-4 py-3 flex items-center gap-4 flex-shrink-0">
          <button className="md:hidden text-stone-400 hover:text-stone-200" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <h1 className="text-stone-200 font-semibold text-sm capitalize">
            {ALL_NAV_ITEMS.find(n => n.id === page)?.label || page}
          </h1>

          {!online && (
            <div className="hidden sm:flex items-center gap-1.5 bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-1">
              <WifiOff size={12} className="text-red-400" />
              <span className="text-red-400 text-xs">Sem conexão</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {/* Botão tema claro/escuro */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="text-stone-400 hover:text-amber-400 transition-colors p-1 rounded-lg hover:bg-stone-800"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative text-stone-400 hover:text-stone-200 transition-colors p-1">
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl z-50">
                  <div className="p-3 border-b border-stone-700">
                    <p className="text-stone-200 font-medium text-sm">Notificações</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-stone-500 text-sm p-4 text-center">Nenhuma notificação</p>
                    ) : notifications.slice(0, 10).map(n => (
                      <div key={n.id} className={clsx('p-3 border-b border-stone-800 cursor-pointer hover:bg-stone-800 transition-colors', !n.is_read && 'bg-amber-900/10')} onClick={() => markRead(n.id)}>
                        <p className={clsx('text-xs font-medium', n.is_read ? 'text-stone-400' : 'text-amber-300')}>{n.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-1.5">
              <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{(user.name || user.email)[0].toUpperCase()}</span>
              </div>
              <span className="text-stone-300 text-xs font-medium hidden sm:block">{user.name || user.email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
