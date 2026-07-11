export function ChartContainer({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

export function BarListChart({ data, valueKey, labelKey, colorClass = 'bg-blue-500' }) {
  const maxValue = Math.max(1, ...(data || []).map((d) => Number(d?.[valueKey] || 0)));

  return (
    <div className="space-y-2">
      {(data || []).length ? (
        data.map((item, idx) => {
          const value = Number(item?.[valueKey] || 0);
          const pct = Math.max(2, Math.round((value / maxValue) * 100));

          return (
            <div key={`${item?.[labelKey] || 'row'}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="max-w-[65%] truncate text-slate-600" title={String(item?.[labelKey] || '')}>
                  {String(item?.[labelKey] || '')}
                </span>
                <strong className="text-slate-900">{value}</strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-slate-500">No chart data.</p>
      )}
    </div>
  );
}
