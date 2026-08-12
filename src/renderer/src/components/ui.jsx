import React, { createContext, useContext, useState, useCallback } from 'react'

/* ---------- 아이콘 (인라인 SVG) ---------- */
export function Icon({ name, className = 'w-4 h-4' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z" {...p} /><path d="M3 13l9 5 9-5" {...p} /></>,
    settings: <><circle cx="12" cy="12" r="3" {...p} /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.9-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 11a2 2 0 1 1 0 4Z" {...p} /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" {...p} /></>,
    check: <path d="M20 6 9 17l-5-5" {...p} />,
    x: <path d="M18 6 6 18M6 6l12 12" {...p} />,
    key: <><circle cx="8" cy="15" r="4" {...p} /><path d="m10.8 12.2 8.2-8.2M17 5l2 2M14 8l2 2" {...p} /></>,
    clock: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 7v5l3 2" {...p} /></>,
    tag: <><path d="M20.6 13.4 12 22l-8-8V4h10l6.6 6.6a2 2 0 0 1 0 2.8Z" {...p} /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></>,
    user: <><circle cx="12" cy="8" r="4" {...p} /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...p} /></>,
    sun: <><circle cx="12" cy="12" r="4" {...p} /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" {...p} /></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" {...p} />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" {...p} />,
    film: <><rect x="3" y="5" width="18" height="14" rx="2" {...p} /><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" {...p} /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" {...p} /><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" {...p} /></>,
    external: <><path d="M14 4h6v6" {...p} /><path d="M10 14 20 4" {...p} /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" {...p} /></>,
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="m20 20-3.5-3.5" {...p} /></>,
    spinner: <path d="M12 3a9 9 0 1 1-9 9" {...p} />
  }
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[name]}</svg>
}

/* ---------- 버튼 ---------- */
export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }) {
  const base = 'no-drag inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
  const sizes = { sm: 'text-[13px] px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-[15px] px-5 py-2.5' }
  const variants = {
    primary: 'bg-[var(--accent)] text-white hover:brightness-110',
    ghost: 'bg-transparent text-[var(--accent)] border border-[var(--accent)] hover:bg-[var(--accent-soft)]',
    soft: 'bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)]',
    danger: 'bg-transparent text-[var(--crit)] border border-[color-mix(in_srgb,var(--crit)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--crit)_10%,transparent)]'
  }
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>{children}</button>
}

/* ---------- 카드 ---------- */
export function Card({ className = '', children }) {
  return <div className={`bg-[var(--surface)] border border-[var(--line)] rounded-[14px] shadow-soft ${className}`}>{children}</div>
}

/* ---------- 입력 필드 ---------- */
export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-[13px] font-semibold text-[var(--ink)]">{label}</span>}
      {children}
      {hint && <span className="text-xs text-[var(--muted)] leading-relaxed">{hint}</span>}
    </label>
  )
}

export function TextInput({ className = '', ...rest }) {
  return (
    <input
      className={`no-drag w-full bg-[var(--paper)] border border-[var(--line)] rounded-[10px] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition ${className}`}
      {...rest}
    />
  )
}

/* ---------- 태그 입력 (키워드) ---------- */
export function TagInput({ tags, onChange, placeholder = '키워드 입력 후 Enter' }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setDraft('')
  }
  const remove = (t) => onChange(tags.filter((x) => x !== t))
  return (
    <div className="no-drag flex flex-wrap gap-2 items-center bg-[var(--paper)] border border-[var(--line)] rounded-[10px] px-3 py-2.5 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)] transition">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5 bg-[var(--accent-soft)] text-[var(--accent)] text-[13px] font-medium pl-2.5 pr-1.5 py-1 rounded-lg">
          {t}
          <button onClick={() => remove(t)} className="hover:opacity-70" aria-label={`${t} 삭제`}><Icon name="x" className="w-3.5 h-3.5" /></button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          else if (e.key === 'Backspace' && !draft && tags.length) remove(tags[tags.length - 1])
        }}
        onBlur={add}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-[var(--ink)] placeholder:text-[var(--muted)] py-1"
      />
    </div>
  )
}

/* ---------- 상태 알약 ---------- */
export function Pill({ tone = 'muted', children }) {
  const tones = {
    good: 'text-[var(--good)] bg-[color-mix(in_srgb,var(--good)_14%,transparent)]',
    warn: 'text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_16%,transparent)]',
    crit: 'text-[var(--crit)] bg-[color-mix(in_srgb,var(--crit)_14%,transparent)]',
    muted: 'text-[var(--muted)] bg-[var(--surface-2)]'
  }
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${tones[tone]}`}>{children}</span>
}

/* ---------- 토스트 ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, tone = 'good') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, message, tone }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {items.map((t) => (
          <div key={t.id} className="fade-up flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--line)] shadow-soft rounded-xl px-4 py-3 text-sm text-[var(--ink)] min-w-[220px]">
            <span className={t.tone === 'crit' ? 'text-[var(--crit)]' : 'text-[var(--good)]'}>
              <Icon name={t.tone === 'crit' ? 'x' : 'check'} />
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- 확인 대화 (간단) ---------- */
export function useConfirm() {
  return (msg) => window.confirm(msg)
}
