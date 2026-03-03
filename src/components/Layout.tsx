import { useState, useEffect, useRef } from 'react';
import {
  Users, Calendar, Repeat, Settings, LogOut, Bell,
  BookOpen, Layers, Shield, Wifi, WifiOff,
  Database, Menu, X, Building2, Grid3X3, Church, RefreshCcw, KeyRound,
  Sun, Moon, HeartHandshake, Phone, Mail, Image, ChevronDown
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

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Geral',
    items: [
      { id: 'scales',    label: 'Escalas',    icon: <Calendar size={15} />,        roles: ['SuperAdmin', 'Admin', 'Líder'] },
      { id: 'cults',     label: 'Cultos',     icon: <Church size={15} />,          roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
      { id: 'swaps',     label: 'Trocas',     icon: <Repeat size={15} />,          roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
      { id: 'my-panel',  label: 'Meu Painel', icon: <BookOpen size={15} />,        roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro'] },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { id: 'members',     label: 'Voluntários',     icon: <Users size={15} />,      roles: ['SuperAdmin', 'Admin', 'Líder'] },
      { id: 'ministries',  label: 'Ministérios',     icon: <Grid3X3 size={15} />,    roles: ['SuperAdmin', 'Admin'] },
      { id: 'departments', label: 'Departamentos',   icon: <Building2 size={15} />,  roles: ['SuperAdmin', 'Admin'] },
      { id: 'sectors',     label: 'Setores',         icon: <Layers size={15} />,     roles: ['SuperAdmin', 'Admin', 'Líder'] },
      { id: 'cult-types',  label: 'Tipos de Culto',  icon: <Settings size={15} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'church',      label: 'Dados da Igreja', icon: <Church size={15} />,     roles: ['SuperAdmin'] },
    ],
  },
  {
    label: 'Pastoral',
    items: [
      { id: 'pastoral', label: 'Atendimento Pastoral', icon: <HeartHandshake size={15} />, roles: ['SuperAdmin', 'Admin', 'Secretaria'] },
    ],
  },
  {
    label: 'Backup',
    items: [
      { id: 'backup',       label: 'Fazer Backup',     icon: <Database size={15} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'restore',      label: 'Restaurar Backup', icon: <RefreshCcw size={15} />, roles: ['SuperAdmin', 'Admin'] },
      { id: 'email-config', label: 'Config. E-mail',   icon: <Mail size={15} />,       roles: ['SuperAdmin', 'Admin'] },
      { id: 'logo',         label: 'Logotipo',         icon: <Image size={15} />,      roles: ['SuperAdmin', 'Admin'] },
    ],
  },
  {
    label: 'Segurança',
    items: [
      { id: 'security',   label: 'Reset de Senha',      icon: <Shield size={15} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'activation', label: 'Ativação do Sistema', icon: <KeyRound size={15} />, roles: ['SuperAdmin', 'Admin', 'Líder', 'Membro', 'Secretaria'] },
    ],
  },
];

const ALL_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'church', label: 'Dados da Igreja' },
  ...NAV_GROUPS.flatMap(g => g.items),
];

// Accent por grupo — tema light: cores mais saturadas/escuras para contraste em fundo branco
const GROUP_ACCENT: Record<string, string> = {
  'Geral':      '#b45309',  // amber-700
  'Cadastros':  '#1d4ed8',  // blue-700
  'Pastoral':   '#065f46',  // emerald-800
  'Backup':     '#6b21a8',  // purple-800
  'Segurança':  '#991b1b',  // red-800
};

const GROUP_LIGHT: Record<string, string> = {
  'Geral':      '#fffbeb',
  'Cadastros':  '#eff6ff',
  'Pastoral':   '#ecfdf5',
  'Backup':     '#faf5ff',
  'Segurança':  '#fff1f2',
};

const GROUP_BORDER: Record<string, string> = {
  'Geral':      '#fcd34d',
  'Cadastros':  '#93c5fd',
  'Pastoral':   '#6ee7b7',
  'Backup':     '#d8b4fe',
  'Segurança':  '#fda4af',
};

interface LayoutProps {
  user: AuthUser;
  page: Page;
  setPage: (p: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

// ─── Dropdown de grupo ─────────────────────────────────────────────────────────
function GroupDropdown({ group, page, setPage, accent, light, border }: {
  group: NavGroup;
  page: Page;
  setPage: (p: Page) => void;
  accent: string;
  light: string;
  border: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasActive = group.items.some(i => i.id === page);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: '100%', padding: '0 14px', background: 'transparent', border: 'none',
          borderBottom: hasActive ? `2px solid ${accent}` : open ? `2px solid ${border}` : '2px solid transparent',
          borderTop: '2px solid transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          color: hasActive ? accent : open ? '#44403c' : '#a8a29e',
          fontSize: 13, fontWeight: hasActive || open ? 600 : 500,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          transition: 'all .15s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!hasActive && !open) e.currentTarget.style.color = '#44403c'; }}
        onMouseLeave={e => { if (!hasActive && !open) e.currentTarget.style.color = '#a8a29e'; }}
      >
        {group.label}
        <ChevronDown
          size={12}
          style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          color={hasActive ? accent : '#c4bcb4'}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 1px)', left: 0, minWidth: 220,
          background: '#ffffff',
          border: '1px solid #e8e5de',
          borderTop: `2px solid ${accent}`,
          borderRadius: '0 0 14px 14px',
          boxShadow: '0 12px 40px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.06)',
          padding: '8px 8px 10px', zIndex: 999,
          animation: 'spDrop .15s ease', transformOrigin: 'top',
        }}>
          {/* Header da seção */}
          <div style={{
            padding: '6px 10px 10px', display: 'flex', alignItems: 'center', gap: 7,
            borderBottom: '1px solid #f0ede6', marginBottom: 6,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6, background: light,
              border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: accent, display: 'flex', transform: 'scale(.85)' }}>{group.items[0].icon}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {group.label}
            </span>
          </div>

          {group.items.map(item => {
            const isAct = page === item.id;
            return (
              <button key={item.id}
                onClick={() => { setPage(item.id); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                  borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: isAct ? light : 'transparent',
                  color: isAct ? accent : '#57534e',
                  borderLeft: isAct ? `2px solid ${accent}` : '2px solid transparent',
                  textAlign: 'left', transition: 'all .1s',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 13, fontWeight: isAct ? 700 : 500,
                }}
                onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = '#f5f4f1'; e.currentTarget.style.color = '#1c1917'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = isAct ? light : 'transparent'; e.currentTarget.style.color = isAct ? accent : '#57534e'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: isAct ? light : '#f5f4f1',
                  border: isAct ? `1px solid ${border}` : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: isAct ? accent : '#a8a29e', display: 'flex' }}>{item.icon}</span>
                </div>
                {item.label}
                {isAct && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout({ user, page, setPage, onLogout, children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ecclesia_theme') as 'dark' | 'light') || 'light';
  });
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') { html.classList.add('light'); html.classList.remove('dark'); }
    else { html.classList.remove('light'); html.classList.add('dark'); }
    localStorage.setItem('ecclesia_theme', theme);
  }, [theme]);

  const [churchName, setChurchName] = useState('');
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/trial')
      .then(r => r.ok ? r.json() : {}).then(d => setIsActivated(d.isActive === true && d.isTrial !== true)).catch(() => {});
    fetch('/api/settings/logo')
      .then(r => r.ok ? r.json() : {}).then(d => { if (d.logo) setLogoUrl(d.logo); }).catch(() => {});
    const logoHandler = (e: any) => { if (e.detail?.logo !== undefined) setLogoUrl(e.detail.logo); };
    window.addEventListener('ecclesia-logo-updated', logoHandler);
    fetch('/api/public/church-name')
      .then(r => r.ok ? r.json() : {}).then(d => { if (d.name) setChurchName(d.name); }).catch(() => {});
    const handler = (e: any) => { if (e.detail?.name) setChurchName(e.detail.name); };
    window.addEventListener('church-updated', handler);
    return () => {
      window.removeEventListener('church-updated', handler);
      window.removeEventListener('ecclesia-logo-updated', logoHandler);
    };
  }, []);

  const { unread, notifications, markRead } = useNotifications(user.member_id);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const filteredGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(user.role)),
  })).filter(group => group.items.length > 0);

  const currentItem = ALL_NAV_ITEMS.find(n => n.id === page);
  const currentGroup = NAV_GROUPS.find(g => g.items.some(i => i.id === page));
  const currentAccent = currentGroup ? (GROUP_ACCENT[currentGroup.label] || '#b45309') : '#b45309';
  const currentLight  = currentGroup ? (GROUP_LIGHT[currentGroup.label]  || '#fffbeb') : '#fffbeb';
  const currentBorder = currentGroup ? (GROUP_BORDER[currentGroup.label] || '#fcd34d') : '#fcd34d';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f7f4', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Lora:wght@600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spDrop   { from { opacity:0; transform:translateY(-6px) scaleY(.96); } to { opacity:1; transform:translateY(0) scaleY(1); } }
        @keyframes spMobile { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #f0efe9; }
        ::-webkit-scrollbar-thumb { background: #d1cfc6; border-radius: 4px; }
      `}</style>

      {/* ─── Topbar ──────────────────────────────────────────────────────────── */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e8e5de',
        display: 'flex', alignItems: 'center',
        height: 56, padding: '0 20px',
        flexShrink: 0, gap: 0, zIndex: 100,
        boxShadow: '0 1px 0 #e8e5de, 0 2px 8px rgba(0,0,0,.04)',
      }}>

        {/* Mobile button */}
        <button className="md:hidden" onClick={() => setMobileOpen(o => !o)}
          style={{ color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px 4px 0', display: 'flex' }}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Logo */}
        <button onClick={() => setPage('dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 20, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain' }} />
            : <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#92400e,#b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(180,83,9,.25)' }}>
                <span style={{ color: '#fef3c7', fontWeight: 800, fontSize: 13 }}>{(churchName || 'E')[0].toUpperCase()}</span>
              </div>
          }
          <span style={{ fontFamily: "'Lora', serif", fontWeight: 700, fontSize: 15, color: '#1c1917', whiteSpace: 'nowrap', letterSpacing: -.2 }}>
            {churchName || 'Ecclesia'}<span style={{ color: '#b45309' }}>Scale</span>
          </span>
        </button>

        <div className="hidden md:block" style={{ width: 1, height: 20, background: '#e8e5de', marginRight: 16, flexShrink: 0 }} />

        {/* Nav — desktop */}
        <nav className="hidden md:flex" style={{ height: '100%', flex: 1 }}>
          {filteredGroups.map(group => (
            <GroupDropdown
              key={group.label}
              group={group}
              page={page}
              setPage={setPage}
              accent={GROUP_ACCENT[group.label] || '#b45309'}
              light={GROUP_LIGHT[group.label]   || '#fffbeb'}
              border={GROUP_BORDER[group.label]  || '#fcd34d'}
            />
          ))}
        </nav>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {!online && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff1f2', border: '1px solid #fda4af', borderRadius: 8, padding: '3px 10px' }}>
              <WifiOff size={12} style={{ color: '#ef4444' }} /><span style={{ color: '#ef4444', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sem conexão</span>
            </div>
          )}

          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', padding: 6, borderRadius: 8, display: 'flex', transition: 'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#b45309'}
            onMouseLeave={e => e.currentTarget.style.color = '#a8a29e'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div ref={notifRef} style={{ position: 'relative' }}>
            <button onClick={() => setNotifOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', padding: 6, borderRadius: 8, display: 'flex', position: 'relative', transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#44403c'}
              onMouseLeave={e => e.currentTarget.style.color = '#a8a29e'}>
              <Bell size={17} />
              {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 2, background: '#b45309', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 300, background: '#ffffff', border: '1px solid #e8e5de', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.10)', zIndex: 999, overflow: 'hidden', animation: 'spDrop .15s ease' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0ede6' }}>
                  <p style={{ color: '#1c1917', fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>Notificações</p>
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {notifications.length === 0
                    ? <p style={{ color: '#a8a29e', fontSize: 12, padding: 16, textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Nenhuma notificação</p>
                    : notifications.slice(0, 10).map(n => (
                      <div key={n.id} onClick={() => markRead(n.id)}
                        style={{ padding: '10px 14px', borderBottom: '1px solid #f5f4f1', cursor: 'pointer', background: n.is_read ? 'transparent' : '#fffbeb', transition: 'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f4f1'}
                        onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : '#fffbeb'}>
                        <p style={{ color: n.is_read ? '#78716c' : '#b45309', fontSize: 12, fontWeight: 600, margin: '0 0 2px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{n.title}</p>
                        <p style={{ color: '#a8a29e', fontSize: 11, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{n.message}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f4f1', border: '1px solid #e8e5de', borderRadius: 10, padding: '5px 10px', flexShrink: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#92400e,#b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fef3c7', fontSize: 10, fontWeight: 800 }}>{(user.name || user.email)[0].toUpperCase()}</span>
            </div>
            <div className="hidden sm:block">
              <p style={{ color: '#1c1917', fontSize: 12, fontWeight: 600, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>{user.name || user.email}</p>
              <p style={{ color: '#a8a29e', fontSize: 10, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>{user.role}</p>
            </div>
          </div>

          <button onClick={onLogout} title="Sair"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4bcb4', padding: 6, borderRadius: 8, display: 'flex', transition: 'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#c4bcb4'}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ─── Breadcrumb ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #f0ede6', padding: '6px 22px', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ color: '#d6d0c8', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{churchName || 'EcclesiaScale'}</span>
        {currentGroup && (
          <>
            <span style={{ color: '#e0dbd4' }}>›</span>
            <span style={{
              background: currentLight, color: currentAccent,
              border: `1px solid ${currentBorder}`,
              borderRadius: 6, padding: '1px 8px',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>{currentGroup.label}</span>
          </>
        )}
        <span style={{ color: '#e0dbd4' }}>›</span>
        <span style={{ color: '#44403c', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>{currentItem?.label || page}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          {online
            ? <><Wifi size={10} style={{ color: '#10b981' }} /><span style={{ color: '#a7f3d0', fontSize: 10 }}>online</span></>
            : <><WifiOff size={10} style={{ color: '#ef4444' }} /><span style={{ color: '#fda4af', fontSize: 10 }}>offline</span></>
          }
        </div>
      </div>

      {/* ─── Mobile drawer ───────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} onClick={() => setMobileOpen(false)} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 272, height: '100%', background: '#ffffff', borderRight: '1px solid #e8e5de', display: 'flex', flexDirection: 'column', animation: 'spMobile .2s ease', boxShadow: '4px 0 24px rgba(0,0,0,.08)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0ede6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Lora', serif", color: '#1c1917', fontWeight: 700, fontSize: 14 }}>{churchName || 'EcclesiaScale'}</span>
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e' }}><X size={18} /></button>
            </div>
            <nav style={{ flex: 1, padding: 8, overflowY: 'auto' }}>
              {filteredGroups.map(group => {
                const accent = GROUP_ACCENT[group.label] || '#b45309';
                const light  = GROUP_LIGHT[group.label]  || '#fffbeb';
                const border = GROUP_BORDER[group.label]  || '#fcd34d';
                return (
                  <div key={group.label} style={{ marginBottom: 8 }}>
                    <p style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', padding: '8px 10px 4px', fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>
                      {group.label}
                    </p>
                    {group.items.map(item => {
                      const isAct = page === item.id;
                      return (
                        <button key={item.id} onClick={() => { setPage(item.id); setMobileOpen(false); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', background: isAct ? light : 'transparent', color: isAct ? accent : '#78716c', borderLeft: isAct ? `2px solid ${accent}` : '2px solid transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: isAct ? 700 : 500, marginBottom: 2 }}>
                          <span style={{ color: isAct ? accent : '#a8a29e', display: 'flex' }}>{item.icon}</span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            <div style={{ padding: '10px 8px', borderTop: '1px solid #f0ede6' }}>
              <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13 }}>
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {children}
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #f0ede6', padding: '5px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: '#d6d0c8', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>EcclesiaScale v5.0</span>
        <span style={{ color: '#e8e5de' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Phone size={9} style={{ color: '#d6d0c8' }} />
          <span style={{ color: '#d6d0c8', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>21970031043</span>
        </div>
        <span style={{ color: '#e8e5de' }}>•</span>
        <span style={{ color: '#d6d0c8', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Contato EcclesiaScale</span>
        {isActivated !== null && (
          <div style={{ marginLeft: 8 }}>
            {isActivated
              ? <span style={{ color: '#10b981', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>● Sistema Ativado</span>
              : <span style={{ color: '#b45309', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>● Trial Ativo</span>
            }
          </div>
        )}
      </footer>
    </div>
  );
}
