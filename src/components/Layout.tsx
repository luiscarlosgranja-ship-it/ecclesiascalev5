import { useState, useEffect, useRef } from 'react';
import {
  Users, Calendar, Repeat, Settings, LogOut, Bell,
  BookOpen, Layers, Shield, Wifi, WifiOff,
  Database, Menu, X, Building2, Grid3X3, Church, RefreshCcw, KeyRound, UserCog,
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
      { id: 'pastoral', label: 'Gabinete Pastoral', icon: <HeartHandshake size={15} />, roles: ['SuperAdmin', 'Admin', 'Secretaria', 'Líder', 'Membro'] },
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
      { id: 'users',           label: 'Usuários',            icon: <UserCog size={15} />,  roles: ['SuperAdmin'] },
      { id: 'security',        label: 'Reset de Senha',      icon: <Shield size={15} />,   roles: ['SuperAdmin', 'Admin'] },
      { id: 'activation-keys', label: 'Gerador de Chaves',   icon: <KeyRound size={15} />, roles: ['SuperAdmin'] },
      { id: 'activation',      label: 'Ativação do Sistema', icon: <KeyRound size={15} />, roles: ['Admin', 'Líder', 'Membro', 'Secretaria'] },
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActive = group.items.some(i => i.id === page);

  function openMenu()  { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); }
  function closeMenu() { closeTimer.current = setTimeout(() => setOpen(false), 150); }

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%' }}
      onMouseEnter={openMenu} onMouseLeave={closeMenu}>
      <button
        style={{
          height: '100%', padding: '0 14px', background: 'transparent', border: 'none',
          borderBottom: hasActive ? `2px solid ${accent}` : open ? `2px solid ${border}` : '2px solid transparent',
          borderTop: '2px solid transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          color: hasActive ? accent : open ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 13, fontWeight: hasActive || open ? 600 : 500,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          transition: 'all .15s', whiteSpace: 'nowrap',
        }}
      >
        {group.label}
        <ChevronDown
          size={12}
          style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          color={hasActive ? accent : '#c4bcb4'}
        />
      </button>

      {open && (
        <div onMouseEnter={openMenu} onMouseLeave={closeMenu} style={{
          position: 'absolute', top: 'calc(100% + 1px)', left: 0, minWidth: 220,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderTop: `2px solid ${accent}`,
          borderRadius: '0 0 14px 14px',
          boxShadow: 'var(--shadow-lg)',
          padding: '8px 8px 10px', zIndex: 999,
          animation: 'spDrop .15s ease', transformOrigin: 'top',
        }}>
          {/* Header da seção */}
          <div style={{
            padding: '6px 10px 10px', display: 'flex', alignItems: 'center', gap: 7,
            borderBottom: '1px solid var(--border-subtle)', marginBottom: 6,
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
                  color: isAct ? accent : 'var(--text-secondary)',
                  borderLeft: isAct ? `2px solid ${accent}` : '2px solid transparent',
                  textAlign: 'left', transition: 'all .1s',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 13, fontWeight: isAct ? 700 : 500,
                }}
                onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = isAct ? light : 'transparent'; e.currentTarget.style.color = isAct ? accent : 'var(--text-secondary)'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: isAct ? light : 'var(--bg-elevated)',
                  border: isAct ? `1px solid ${border}` : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: isAct ? accent : 'var(--text-muted)', display: 'flex' }}>{item.icon}</span>
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

  // ─── Título da aba e favicon dinâmicos ───────────────────────────────────────
  useEffect(() => {
    if (churchName) document.title = churchName;
    if (logoUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = logoUrl;
    }
  }, [churchName, logoUrl]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Lora:wght@600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Variáveis de tema ── */
        :root {
          --bg-base:       #f8f7f4;
          --bg-surface:    #ffffff;
          --bg-elevated:   #f5f4f1;
          --bg-input:      #f0efe9;
          --border-soft:   #e8e5de;
          --border-subtle: #f0ede6;
          --text-primary:  #1c1917;
          --text-secondary:#57534e;
          --text-muted:    #a8a29e;
          --text-faint:    #d6d0c8;
          --shadow-sm:     0 1px 3px rgba(0,0,0,.06);
          --shadow-md:     0 4px 16px rgba(0,0,0,.08);
          --shadow-lg:     0 12px 40px rgba(0,0,0,.10);
          --accent:        #b45309;
          --accent-soft:   #fffbeb;
          --scrollbar-track: #f0efe9;
          --scrollbar-thumb: #d1cfc6;
        }
        .dark {
          --bg-base:       #0d0d14;
          --bg-surface:    #14141f;
          --bg-elevated:   #1c1c2a;
          --bg-input:      #1e1e2e;
          --border-soft:   #2a2a3e;
          --border-subtle: #222232;
          --text-primary:  #f0f0f8;
          --text-secondary:#b0b0c8;
          --text-muted:    #6a6a88;
          --text-faint:    #3a3a52;
          --shadow-sm:     0 1px 3px rgba(0,0,0,.3);
          --shadow-md:     0 4px 16px rgba(0,0,0,.4);
          --shadow-lg:     0 12px 40px rgba(0,0,0,.6);
          --accent:        #f59e0b;
          --accent-soft:   #1e1800;
          --scrollbar-track: #14141f;
          --scrollbar-thumb: #2a2a3e;
        }

        @keyframes spDrop   { from { opacity:0; transform:translateY(-6px) scaleY(.96); } to { opacity:1; transform:translateY(0) scaleY(1); } }
        @keyframes spMobile { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }

        /* ── Componentes Tailwind adaptados ao tema via CSS vars ── */
        .theme-card       { background: var(--bg-surface) !important; border-color: var(--border-soft) !important; }
        .theme-modal      { background: var(--bg-surface) !important; border-color: var(--border-soft) !important; }
        .theme-modal-header { border-color: var(--border-soft) !important; }
        .theme-input      { background: var(--bg-input) !important; border-color: var(--border-soft) !important; color: var(--text-primary) !important; }
        .theme-input::placeholder { color: var(--text-muted) !important; }
        .theme-select     { background: var(--bg-input) !important; border-color: var(--border-soft) !important; color: var(--text-primary) !important; }
        .theme-btn-secondary { background: var(--bg-elevated) !important; color: var(--text-secondary) !important; border: 1px solid var(--border-soft); }
        .theme-btn-secondary:hover { background: var(--border-soft) !important; }
        .theme-btn-outline { border-color: var(--border-soft) !important; color: var(--text-secondary) !important; }
        .theme-btn-outline:hover { background: var(--bg-elevated) !important; }
        .theme-text-primary   { color: var(--text-primary) !important; }
        .theme-text-secondary { color: var(--text-secondary) !important; }
        .theme-text-muted     { color: var(--text-muted) !important; }
        .theme-surface    { background: var(--bg-surface) !important; }
        .theme-elevated   { background: var(--bg-elevated) !important; }
        .theme-border     { border-color: var(--border-soft) !important; }
        .theme-divider    { border-color: var(--border-subtle) !important; }

        /* Tabelas */
        .theme-table-head { background: var(--bg-elevated) !important; border-color: var(--border-soft) !important; }
        .theme-table-head th { color: var(--text-muted) !important; }
        .theme-table-row  { border-color: var(--border-subtle) !important; }
        .theme-table-row:hover { background: var(--bg-elevated) !important; }
      `}</style>

      {/* ─── Topbar ──────────────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex', alignItems: 'center',
        height: 56, padding: '0 20px',
        flexShrink: 0, gap: 0, zIndex: 100,
        boxShadow: 'var(--shadow-sm)',
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
          <span style={{ fontFamily: "'Lora', serif", fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', letterSpacing: -.2 }}>
            {churchName || 'EcclesiaScale'}
          </span>
        </button>

        <div className="hidden md:block" style={{ width: 1, height: 20, background: 'var(--border-soft)', marginRight: 16, flexShrink: 0 }} />

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
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 300, background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 999, overflow: 'hidden', animation: 'spDrop .15s ease' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>Notificações</p>
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {notifications.length === 0
                    ? <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: 16, textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Nenhuma notificação</p>
                    : notifications.slice(0, 10).map(n => (
                      <div key={n.id} onClick={() => markRead(n.id)}
                        style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: n.is_read ? 'transparent' : 'var(--accent-soft)', transition: 'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'var(--accent-soft)'}>
                        <p style={{ color: n.is_read ? 'var(--text-secondary)' : 'var(--accent)', fontSize: 12, fontWeight: 600, margin: '0 0 2px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{n.title}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{n.message}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '5px 10px', flexShrink: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#92400e,#b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fef3c7', fontSize: 10, fontWeight: 800 }}>{(user.name || user.email)[0].toUpperCase()}</span>
            </div>
            <div className="hidden sm:block">
              <p style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>{user.name || user.email}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>{user.role}</p>
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
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '6px 22px', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-faint)', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{churchName || 'EcclesiaScale'}</span>
        {currentGroup && (
          <>
            <span style={{ color: 'var(--border-soft)' }}>›</span>
            <span style={{
              background: currentLight, color: currentAccent,
              border: `1px solid ${currentBorder}`,
              borderRadius: 6, padding: '1px 8px',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>{currentGroup.label}</span>
          </>
        )}
        <span style={{ color: 'var(--border-soft)' }}>›</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}>{currentItem?.label || page}</span>
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
          <div style={{ position: 'absolute', top: 0, left: 0, width: 272, height: '100%', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', animation: 'spMobile .2s ease', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => { setPage('dashboard'); setMobileOpen(false); }} style={{ fontFamily: "'Lora', serif", color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{churchName || 'EcclesiaScale'}</button>
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
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', background: isAct ? light : 'transparent', color: isAct ? accent : 'var(--text-secondary)', borderLeft: isAct ? `2px solid ${accent}` : '2px solid transparent', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: isAct ? 700 : 500, marginBottom: 2 }}>
                          <span style={{ color: isAct ? accent : 'var(--text-muted)', display: 'flex' }}>{item.icon}</span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13 }}>
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: 'var(--bg-base)' }}>
        {children}
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', padding: '5px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>EcclesiaScale v5.0</span>
        <span style={{ color: 'var(--border-soft)' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Phone size={9} style={{ color: 'var(--text-faint)' }} />
          <span style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>21970031043</span>
        </div>
        <span style={{ color: 'var(--border-soft)' }}>•</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Contato EcclesiaScale</span>
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
