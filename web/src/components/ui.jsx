export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
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
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <input
        className={`w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <select
        className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

const STATUS_LABELS = {
  waiting: ['Aguardando', 'bg-amber-100 text-amber-800'],
  called: ['Chamada', 'bg-blue-100 text-blue-800'],
  in_service: ['Em atendimento', 'bg-indigo-100 text-indigo-800'],
  done: ['Concluída', 'bg-emerald-100 text-emerald-800'],
  no_show: ['Não compareceu', 'bg-slate-200 text-slate-700'],
  cancelled: ['Cancelada', 'bg-red-100 text-red-700'],
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
