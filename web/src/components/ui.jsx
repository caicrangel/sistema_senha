export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark disabled:opacity-50',
    secondary:
      'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <input
        className={`w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft dark:border-slate-600 dark:bg-slate-800 dark:text-white ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <select
        className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Pill({ active, children, ...props }) {
  return (
    <button
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

const STATUS_LABELS = {
  waiting: ['Aguardando', 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'],
  called: ['Chamada', 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'],
  in_service: ['Em atendimento', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'],
  done: ['Concluída', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'],
  no_show: ['Não compareceu', 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'],
  cancelled: ['Cancelada', 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS_LABELS[status] || [status, 'bg-slate-100 text-slate-700'];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export const statusLabel = (s) => STATUS_LABELS[s]?.[0] || s;
