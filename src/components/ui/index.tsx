import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm',
    secondary: 'bg-stone-700 hover:bg-stone-600 text-stone-100',
    danger: 'bg-red-700 hover:bg-red-600 text-white',
    ghost: 'hover:bg-stone-800 text-stone-300',
    outline: 'border border-stone-600 hover:bg-stone-800 text-stone-200',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('bg-stone-900 border border-stone-700 rounded-xl', className)}>{children}</div>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'; }
export function Badge({ label, color = 'gray' }: BadgeProps) {
  const colors = {
    green: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    yellow: 'bg-amber-900/50 text-amber-300 border-amber-700',
    red: 'bg-red-900/50 text-red-300 border-red-700',
    blue: 'bg-blue-900/50 text-blue-300 border-blue-700',
    gray: 'bg-stone-800 text-stone-300 border-stone-600',
  };
  return <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', colors[color])}>{label}</span>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; }
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className={clsx('relative bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto', sizes[size])} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-stone-700">
          <h2 className="text-lg font-semibold text-stone-100">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200 transition-colors">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-stone-400 uppercase tracking-wide">{label}</label>}
      <input className={clsx('bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors', className)} {...props} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string | number; label: string }[]; placeholder?: string; }
export function Select({ label, options, placeholder, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-stone-400 uppercase tracking-wide">{label}</label>}
      <select className={clsx('bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-amber-500 transition-colors', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-amber-500', className)} />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="text-stone-600 text-4xl">{icon}</div>
      <p className="text-stone-400 font-medium">{title}</p>
      {description && <p className="text-stone-500 text-sm">{description}</p>}
    </div>
  );
}
