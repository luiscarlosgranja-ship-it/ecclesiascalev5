import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
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

// ─── Grupos de navegação ───────────────────────────────────────────────────────
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

const GROUP_ACCENT: Record<string, string> = {
  'Geral':      '#f59e0b',
  'Cadastros':  '#3b82f6',
  'Pastoral':   '#10b981',
  'Backup':     '#8b5cf6',
  'Segurança':  '#ef4444',
};

interface LayoutProps {
  user: AuthUser;
  page: Page;
  setPage: (p: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

// ─── Dropdown de grupo ─────────────────────────────────────────────────────────
function GroupDropdown({ group, page, setPage, accent }: {
  group: NavGroup;
  page: Page;
  setPage: (p: Page) => void;
  accent: string;
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
          borderBottom: hasActive ? `2px solid ${accent}` : '2px solid transparent',
          borderTop: '2px solid transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          color: hasActive ? accent : open ? '#c0bdb8' : '#6b6662',
          fontSize: 13, fontWeight: hasActive || open ? 600 : 400,
          fontFamily: "'DM Sans', sans-serif", transition: 'all .15s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!hasActive && !open) e.currentTarget.style.color = '#c0bdb8'; }}
        onMouseLeave={e => { if (!hasActive && !open) e.currentTarget.style.color = '#6b6662'; }}
      >
        {group.label}
        <ChevronDown size={12} style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', opacity: .5 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 1px)', left: 0, minWidth: 210,
          background: '#1c1a18', border: '1px solid #2a2825', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,.5)', padding: 6, zIndex: 999,
          animation: 'spDrop .15s ease', transformOrigin: 'top',
        }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, transparent)`, borderRadius: 2, marginBottom: 6 }} />
          {group.items.map(item => {
            const isAct = page === item.id;
            return (
              <button key={item.id}
                onClick={() => { setPage(item.id); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: isAct ? accent + '18' : 'transparent',
                  color: isAct ? accent : '#8a8480', textAlign: 'left',
                  transition: 'all .1s', fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13, fontWeight: isAct ? 600 : 400,
                }}
                onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = '#d0cdc8'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = isAct ? accent + '18' : 'transparent'; e.currentTarget.style.color = isAct ? accent : '#8a8480'; }}
              >
                <span style={{ color: isAct ? accent : '#5a5652', display: 'flex' }}>{item.icon}</span>
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
    return (localStorage.getItem('ecclesia_theme') as 'dark' | 'light') || 'dark';
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

  return (
    <div className="flex flex-col h-screen bg-stone-950 overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spDrop { from { opacity:0; transform:translateY(-6px) scaleY(.96); } to { opacity:1; transform:translateY(0) scaleY(1); } }
        @keyframes spMobile { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      {/* ─── Topbar ──────────────────────────────────────────────────────────── */}
      <header style={{ background:'#161412', borderBottom:'1px solid #242220', display:'flex', alignItems:'center', height:52, padding:'0 16px', flexShrink:0, gap:0, zIndex:100 }}>

        {/* Mobile button */}
        <button className="md:hidden" onClick={() => setMobileOpen(o => !o)}
          style={{ color:'#6b6662', background:'none', border:'none', cursor:'pointer', padding:'4px 10px 4px 0', display:'flex' }}>
          {mobileOpen ? <X size={20}/> : <Menu size={20}/>}
        </button>

        {/* Logo */}
        <button onClick={() => setPage('dashboard')}
          style={{ display:'flex', alignItems:'center', gap:9, marginRight:20, flexShrink:0, background:'none', border:'none', cursor:'pointer', padding:0 }}>
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ width:28, height:28, borderRadius:7, objectFit:'contain' }} />
            : <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#f59e0b,#f97316)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'#fff', fontWeight:800, fontSize:13 }}>{(churchName||'E')[0].toUpperCase()}</span>
              </div>
          }
          <span style={{ color:'#d4c5a0', fontWeight:700, fontSize:14, fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
            {churchName || 'EcclesiaScale'}
          </span>
        </button>

        <div className="hidden md:block" style={{ width:1, height:20, background:'#2a2825', marginRight:16, flexShrink:0 }} />

        {/* Nav — desktop */}
        <nav className="hidden md:flex" style={{ height:'100%', flex:1 }}>
          {filteredGroups.map(group => (
            <GroupDropdown key={group.label} group={group} page={page} setPage={setPage} accent={GROUP_ACCENT[group.label]||'#f59e0b'} />
          ))}
        </nav>

        {/* Right */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          {!online && (
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'#3a1010', border:'1px solid #6b1a1a', borderRadius:8, padding:'3px 10px' }}>
              <WifiOff size={12} style={{ color:'#f87171' }}/><span style={{ color:'#f87171', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>Sem conexão</span>
            </div>
          )}

          <button onClick={() => setTheme(t => t==='dark'?'light':'dark')} title={theme==='dark'?'Tema claro':'Tema escuro'}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#6b6662', padding:6, borderRadius:8, display:'flex', transition:'color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='#f59e0b'} onMouseLeave={e=>e.currentTarget.style.color='#6b6662'}>
            {theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}
          </button>

          <div ref={notifRef} style={{ position:'relative' }}>
            <button onClick={() => setNotifOpen(o=>!o)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#6b6662', padding:6, borderRadius:8, display:'flex', position:'relative', transition:'color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.color='#d4c5a0'} onMouseLeave={e=>e.currentTarget.style.color='#6b6662'}>
              <Bell size={17}/>
              {unread>0 && <span style={{ position:'absolute', top:2, right:2, background:'#f59e0b', color:'#000', fontSize:9, fontWeight:800, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center' }}>{unread>9?'9+':unread}</span>}
            </button>
            {notifOpen && (
              <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:300, background:'#1c1a18', border:'1px solid #2a2825', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,.5)', zIndex:999, overflow:'hidden', animation:'spDrop .15s ease' }}>
                <div style={{ padding:'12px 14px', borderBottom:'1px solid #2a2825' }}>
                  <p style={{ color:'#d4c5a0', fontWeight:600, fontSize:13, fontFamily:"'DM Sans',sans-serif", margin:0 }}>Notificações</p>
                </div>
                <div style={{ maxHeight:280, overflowY:'auto' }}>
                  {notifications.length===0
                    ? <p style={{ color:'#4a4845', fontSize:12, padding:16, textAlign:'center', fontFamily:"'DM Sans',sans-serif" }}>Nenhuma notificação</p>
                    : notifications.slice(0,10).map(n => (
                      <div key={n.id} onClick={() => markRead(n.id)}
                        style={{ padding:'10px 14px', borderBottom:'1px solid #222', cursor:'pointer', background:n.is_read?'transparent':'rgba(245,158,11,.06)', transition:'background .1s' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
                        onMouseLeave={e=>e.currentTarget.style.background=n.is_read?'transparent':'rgba(245,158,11,.06)'}>
                        <p style={{ color:n.is_read?'#6b6662':'#fbbf24', fontSize:12, fontWeight:600, margin:'0 0 2px', fontFamily:"'DM Sans',sans-serif" }}>{n.title}</p>
                        <p style={{ color:'#4a4845', fontSize:11, margin:0, fontFamily:"'DM Sans',sans-serif" }}>{n.message}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#1e1c1a', border:'1px solid #2a2825', borderRadius:10, padding:'5px 10px', flexShrink:0 }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg,#f59e0b,#f97316)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'#fff', fontSize:10, fontWeight:800 }}>{(user.name||user.email)[0].toUpperCase()}</span>
            </div>
            <div className="hidden sm:block">
              <p style={{ color:'#c0bdb8', fontSize:12, fontWeight:600, margin:0, fontFamily:"'DM Sans',sans-serif", lineHeight:1.2 }}>{user.name||user.email}</p>
              <p style={{ color:'#4a4845', fontSize:10, margin:0, fontFamily:"'DM Sans',sans-serif", lineHeight:1.2 }}>{user.role}</p>
            </div>
          </div>

          <button onClick={onLogout} title="Sair"
            style={{ background:'none', border:'none', cursor:'pointer', color:'#4a4845', padding:6, borderRadius:8, display:'flex', transition:'color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#4a4845'}>
            <LogOut size={16}/>
          </button>
        </div>
      </header>

      {/* ─── Breadcrumb ──────────────────────────────────────────────────────── */}
      <div style={{ background:'#111', borderBottom:'1px solid #1a1815', padding:'5px 20px', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <span style={{ color:'#2a2825', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>{churchName||'EcclesiaScale'}</span>
        {currentGroup && <>
          <span style={{ color:'#1e1c1a' }}>›</span>
          <span style={{ color:GROUP_ACCENT[currentGroup.label]||'#888', fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>{currentGroup.label}</span>
        </>}
        <span style={{ color:'#1e1c1a' }}>›</span>
        <span style={{ color:'#7a7572', fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>{currentItem?.label||page}</span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5 }}>
          {online
            ? <><Wifi size={10} style={{ color:'#10b981' }}/><span style={{ color:'#1e4a2e', fontSize:10 }}>online</span></>
            : <><WifiOff size={10} style={{ color:'#ef4444' }}/><span style={{ color:'#4a1e1e', fontSize:10 }}>offline</span></>
          }
        </div>
      </div>

      {/* ─── Mobile drawer ───────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden" style={{ position:'fixed', inset:0, zIndex:200 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)' }} onClick={() => setMobileOpen(false)}/>
          <div style={{ position:'absolute', top:0, left:0, width:272, height:'100%', background:'#161412', borderRight:'1px solid #242220', display:'flex', flexDirection:'column', animation:'spMobile .2s ease' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #242220', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ color:'#d4c5a0', fontWeight:700, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}>{churchName||'EcclesiaScale'}</span>
              <button onClick={() => setMobileOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b6662' }}><X size={18}/></button>
            </div>
            <nav style={{ flex:1, padding:8, overflowY:'auto' }}>
              {filteredGroups.map(group => {
                const accent = GROUP_ACCENT[group.label]||'#f59e0b';
                return (
                  <div key={group.label} style={{ marginBottom:8 }}>
                    <p style={{ color:accent, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', padding:'8px 10px 4px', fontFamily:"'DM Sans',sans-serif", margin:0 }}>
                      {group.label}
                    </p>
                    {group.items.map(item => {
                      const isAct = page===item.id;
                      return (
                        <button key={item.id} onClick={() => { setPage(item.id); setMobileOpen(false); }}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, border:'none', cursor:'pointer', textAlign:'left', background:isAct?accent+'18':'transparent', color:isAct?accent:'#6b6662', borderLeft:isAct?`2px solid ${accent}`:'2px solid transparent', fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:isAct?600:400, marginBottom:2 }}>
                          {item.icon}{item.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            <div style={{ padding:'10px 8px', borderTop:'1px solid #242220' }}>
              <button onClick={onLogout} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, border:'none', cursor:'pointer', background:'transparent', color:'#6b6662', fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>
                <LogOut size={15}/> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {children}
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ background:'#0e0c0a', borderTop:'1px solid #1a1815', padding:'5px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ color:'#2a2825', fontSize:10, fontFamily:"'DM Sans',sans-serif" }}>EcclesiaScale v5.0</span>
        <span style={{ color:'#1e1c1a' }}>•</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <Phone size={9} style={{ color:'#2a2825' }}/>
          <span style={{ color:'#2a2825', fontSize:10, fontFamily:"'DM Sans',sans-serif" }}>21970031043</span>
        </div>
        <span style={{ color:'#1e1c1a' }}>•</span>
        <span style={{ color:'#2a2825', fontSize:10, fontFamily:"'DM Sans',sans-serif" }}>Contato EcclesiaScale</span>
        {isActivated!==null && (
          <div style={{ marginLeft:8 }}>
            {isActivated
              ? <span style={{ color:'#10b981', fontSize:10, fontFamily:"'DM Sans',sans-serif" }}>● Sistema Ativado</span>
              : <span style={{ color:'#f59e0b', fontSize:10, fontFamily:"'DM Sans',sans-serif" }}>● Trial Ativo</span>
            }
          </div>
        )}
      </footer>
    </div>
  );
}
