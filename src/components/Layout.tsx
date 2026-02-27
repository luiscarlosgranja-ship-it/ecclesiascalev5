import { useState } from 'react';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Calendar, Repeat, Settings, LogOut, Bell,
  BookOpen, Layers, Shield, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Database, Key, Menu, X
} from 'lucide-react';
import type { AuthUser } from '../types';
import { can } from '../utils/permissions';
import { useNotifications } from '../hooks/useApi';

type Page = string;

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',        icon: <LayoutDashboard size={18} />, roles: ['SuperAdmin','Admin','Líder','Membro'] },
  { id: 'my-panel',   label: 'Meu Painel',        icon: <BookOpen size={18} />,        roles: ['SuperAdmin','Admin','Líder','Membro'] },
  { id: 'scales',     label: 'Escalas',           icon: <Calendar size={18} />,        roles: ['SuperAdmin','Admin','Líder'] },
  { id: 'cults',      label: 'Cultos / Eventos',  icon: <Layers size={18} />,          roles: ['SuperAdmin','Admin'] },
  { id: 'members',    label: 'Voluntários',       icon: <Users size={18} />,           roles: ['SuperAdmin','Admin','Líder'] },
  { id: 'registries', label: 'Cadastros',         icon: <Settings size={18} />,        roles: ['SuperAdmin','Admin'] },
  { id: 'swaps',      label: 'Gerenciar Trocas',  icon: <Repeat size={18} />,          roles: ['SuperAdmin','Admin','Líder'] },
  { id: 'security',   label: 'Segurança',         icon: <Shield size={18} />,          roles: ['SuperAdmin','Admin'] },
  { id: 'backup',     label: 'Backup',            icon: <Database size={18} />,        roles: ['SuperAdmin','Admin','Líder'] },
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
  const [online] = useState(navigator.onLine);
  const { unread, notifications, markRead } = useNotifications(user.member_id);
  const [notifOpen, setNotifOpen] = useState(false);

  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={clsx(
      'bg-stone-950 border-r border-stone-800 flex flex-col transition-all duration-300 z-40',
      mobile ? 'fixed inset-y-0 left-0 w-72' : (collapsed ? 'w-16' : 'w-64'),
      mobile ? 'shadow-2xl' : 'relative'
    )}>
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-stone-800', collapsed && !mobile && 'justify-center px-2')}>
        <button onClick={() => setPage('dashboard')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          {(!collapsed || mobile) && (
            <div>
              <p className="text-amber-400 font-bold text-sm leading-none">EcclesiaScale</p>
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

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {filteredNav.map(item => (
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
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-stone-800">
        <div className={clsx('flex items-center gap-2 mb-2', collapsed && !mobile && 'justify-center')}>
          {online
            ? <Wifi size={14} className="text-emerald-400" />
            : <WifiOff size={14} className="text-red-400" />}
          {(!collapsed || mobile) && <span className={clsx('text-xs', online ? 'text-emerald-400' : 'text-red-400')}>{online ? 'Conectado' : 'Desconectado'}</span>}
        </div>
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
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <Sidebar mobile />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-stone-900 border-b border-stone-800 px-4 py-3 flex items-center gap-4 flex-shrink-0">
          <button className="md:hidden text-stone-400 hover:text-stone-200" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <h1 className="text-stone-200 font-semibold text-sm capitalize">
            {NAV_ITEMS.find(n => n.id === page)?.label || page}
          </h1>

          <div className="ml-auto flex items-center gap-3">
            {/* Notifications */}
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

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
