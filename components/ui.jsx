'use client';

/** Control-desk primitives: faders, switches, segmented radios, rack panels. */

export function Fader({ label, value, min = 0, max = 100, step = 1, unit = '', onChange, disabled }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block select-none">
      <div className="flex items-baseline justify-between mb-1">
        <span className="label">{label}</span>
        <span className="readout">
          {Math.round(value)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="fader"
        style={{ '--pct': `${pct}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Switch({ label, hint, on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex-1 min-w-0 flex items-center gap-3 text-left px-3 py-2 rounded-xl hover:bg-white/5 transition"
    >
      <span className="switch" data-on={on}>
        <span />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] leading-tight text-white/85 truncate">{label}</span>
        {hint ? <span className="block text-[10px] text-white/35 truncate">{hint}</span> : null}
      </span>
    </button>
  );
}

export function Segmented({ label, options, value, onChange, name }) {
  return (
    <div>
      {label ? <div className="label mb-1">{label}</div> : null}
      <div className="seg" role="radiogroup" aria-label={label || name}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            data-active={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`panel relative p-4 ${className}`}>
      {title ? (
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] tracking-[0.2em] uppercase text-white/45">{title}</h3>
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function LedDot({ on, color }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full transition"
      style={{
        background: on ? color || 'var(--accent)' : 'rgba(255,255,255,0.14)',
        boxShadow: on ? `0 0 8px ${color || 'var(--accent)'}` : 'none',
      }}
    />
  );
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
