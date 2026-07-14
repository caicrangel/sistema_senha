// Gráficos leves em HTML/CSS seguindo o guia de dataviz:
// marcas finas, extremidades arredondadas de 4px na ponta dos dados,
// grade recessiva, rótulos diretos seletivos e tooltip por marca (title).

const INK_MUTED = '#898781';

export function StatTile({ label, value, hint, accent = '#2a78d6' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value ?? '—'}</div>
      {hint && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

// Barras verticais (série única — azul de referência)
export function BarChart({ data, color = '#2a78d6', height = 180, formatLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d) => (
        <div
          key={d.label}
          className="group relative flex flex-1 flex-col items-center justify-end"
          title={`${formatLabel ? formatLabel(d.label) : d.label}: ${d.value}`}
        >
          {d.value > 0 && d.value === max && (
            <span className="mb-1 text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-200">{d.value}</span>
          )}
          <div
            className="w-full max-w-8 rounded-t transition-opacity group-hover:opacity-80"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: d.value > 0 ? 4 : 0,
              backgroundColor: color,
              borderRadius: '4px 4px 0 0',
            }}
          />
          <span className="mt-1.5 text-[10px] tabular-nums" style={{ color: INK_MUTED }}>
            {formatLabel ? formatLabel(d.label) : d.label}
          </span>
        </div>
      ))}
      {data.length === 0 && <p className="w-full self-center text-center text-sm text-slate-400 dark:text-slate-500">Sem dados no período</p>}
    </div>
  );
}

// Barras horizontais com cor por entidade (tipo de atendimento / atendente)
export function HBarChart({ data, defaultColor = '#2a78d6', valueSuffix = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} title={`${d.label}: ${d.value}${valueSuffix}`}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color || defaultColor }} />
              {d.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
              {d.value}{valueSuffix}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || defaultColor, minWidth: d.value > 0 ? 6 : 0 }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Sem dados no período</p>}
    </div>
  );
}
