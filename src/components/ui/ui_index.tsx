import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, style, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };

  const variantStyle: React.CSSProperties = (() => {
    switch (variant) {
      case 'primary':   return { background: 'var(--accent)', color: '#fff' };
      case 'secondary': return { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-soft)' };
      case 'danger':    return { background: '#991b1b', color: '#fff' };
      case 'ghost':     return { background: 'transparent', color: 'var(--text-secondary)' };
      case 'outline':   return { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-soft)' };
      default:          return {};
    }
  })();

  return (
    <button
      className={clsx(base, sizes[size], className)}
      disabled={disabled || loading}
      style={{ ...variantStyle, ...style }}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={clsx('rounded-xl', className)}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', ...style }}
    >
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'; }
export function Badge({ label, color = 'gray' }: BadgeProps) {
  const styles: Record<string, React.CSSProperties> = {
    green:  { background: 'rgba(16,185,129,.15)',  color: '#10b981', border: '1px solid rgba(16,185,129,.3)'  },
    yellow: { background: 'rgba(245,158,11,.15)',  color: 'var(--accent)', border: '1px solid rgba(245,158,11,.3)'  },
    red:    { background: 'rgba(239, 68, 68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)'   },
    blue:   { background: 'rgba(59,130,246,.15)',  color: '#3b82f6', border: '1px solid rgba(59,130,246,.3)'  },
    gray:   { background: 'var(--bg-elevated)',    color: 'var(--text-muted)', border: '1px solid var(--border-soft)' },
  };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={styles[color]}
    >
      {label}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; }
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={clsx('relative rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto', sizes[size])}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid var(--border-soft)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export function Input({ label, error, className, style, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >{label}</label>
      )}
      <input
        className={clsx('rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors', className)}
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-soft)',
          color: 'var(--text-primary)',
          ...style,
        }}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string | number; label: string }[]; placeholder?: string; }
export function Select({ label, options, placeholder, className, style, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >{label}</label>
      )}
      <select
        className={clsx('rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors', className)}
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-soft)',
          color: 'var(--text-primary)',
          ...style,
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className)} style={{ color: 'var(--accent)' }} />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div style={{ color: 'var(--text-muted)', fontSize: '2.25rem' }}>{icon}</div>
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      {description && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>}
    </div>
  );
}
