import React, { useEffect, useMemo, useState } from 'react'
import { Card, Field, TextInput, Button, Icon, Pill, useToast } from './ui.jsx'

const SOURCES = [
  { v: 'youtube', label: '유튜브' },
  { v: 'instagram', label: '인스타그램' },
  { v: 'manual', label: '직접 등록' }
]

const FILTERS = [
  { v: 'all', label: '전체' },
  { v: 'youtube', label: '유튜브' },
  { v: 'instagram', label: '인스타그램' },
  { v: 'published', label: '업로드됨' },
  { v: 'manual', label: '직접 등록' }
]

function sourceLabel(source) {
  return SOURCES.find((s) => s.v === source)?.label || '기타'
}

function sourceTone(source) {
  if (source === 'youtube') return 'warn'
  if (source === 'instagram') return 'good'
  return 'muted'
}

function guessSource(url) {
  const u = (url || '').toLowerCase()
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('instagram.com')) return 'instagram'
  return 'manual'
}

function formatDate(s) {
  if (!s) return ''
  if (s === '방금' || s === '오늘') return s
  return String(s).slice(0, 10)
}

export default function ReferencesView({ workspace, onStartProduce }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [fetchLimit, setFetchLimit] = useState(100)
  const [form, setForm] = useState({ title: '', url: '', source: 'manual', author: '', notes: '' })

  const sources = workspace.reference_sources || []
  const LIMITS = [50, 100, 200, 300]

  const load = async () => {
    setLoading(true)
    const rows = await window.api.references.list(workspace.id)
    setItems(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [workspace.id]) // eslint-disable-line

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((r) => {
      if (filter === 'published') {
        if (r.status !== 'published') return false
      } else if (filter !== 'all' && r.source !== filter) {
        return false
      }
      if (!q) return true
      return [r.title, r.author, r.keyword, r.url, r.notes, r.source_account].some((x) =>
        String(x || '').toLowerCase().includes(q)
      )
    })
  }, [items, filter, query])

  const reset = () => {
    setForm({ title: '', url: '', source: 'manual', author: '', notes: '' })
    setAdding(false)
  }

  const create = async () => {
    if (!form.title.trim()) return toast('제목을 입력해 주세요.', 'crit')
    if (!form.url.trim()) return toast('영상 주소를 입력해 주세요.', 'crit')
    await window.api.references.create(workspace.id, {
      title: form.title.trim(),
      url: form.url.trim(),
      source: form.source || guessSource(form.url),
      author: form.author.trim(),
      notes: form.notes.trim(),
      status: 'new'
    })
    reset()
    await load()
    toast('레퍼런스를 등록했습니다.')
  }

  const remove = async (item) => {
    if (!window.confirm(`'${item.title}' 레퍼런스를 삭제할까요?`)) return
    await window.api.references.remove(item.id)
    await load()
    toast('삭제했습니다.')
  }

  const collect = async () => {
    if (!sources.length) {
      return toast('채널 설정에서 레퍼런스 계정을 먼저 추가해 주세요.', 'crit')
    }
    setCollecting(true)
    try {
      const res = await window.api.references.collect(workspace.id, null, fetchLimit)
      if (!res.ok) return toast(res.error || '영상을 가져오지 못했어요.', 'crit')
      await load()
      const errHint = res.errors?.length ? ` (일부 실패 ${res.errors.length}건)` : ''
      toast(`최근 ${res.limit || fetchLimit}개 기준으로 새 레퍼런스 ${res.added || 0}개를 추가했어요.${errHint}`)
    } finally {
      setCollecting(false)
    }
  }

  const startProduce = async (item) => {
    if (!item.url) return toast('영상 주소가 없어 제작을 시작할 수 없어요.', 'crit')
    if (item.status === 'in_pipeline') {
      onStartProduce?.()
      return
    }
    const res = await window.api.jobs.create(workspace.id, item.id)
    if (res?.error || res?.ok === false) {
      return toast(res.error || '제작을 시작하지 못했어요.', 'crit')
    }
    toast('제작을 시작했어요.')
    onStartProduce?.(res)
  }

  const openUrl = (url) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="film" className="w-[18px] h-[18px] text-[var(--collect)]" />
            레퍼런스
          </h2>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            등록한 계정의 영상과 직접 추가한 후보를 모아 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {sources.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1">
                {LIMITS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFetchLimit(n)}
                    className={`no-drag text-[12px] font-semibold px-2.5 py-1.5 rounded-full border ${
                      fetchLimit === n
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] text-[var(--muted)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Button variant="soft" size="sm" disabled={collecting} onClick={collect}>
                {collecting ? '가져오는 중…' : `계정 영상 가져오기 (${fetchLimit})`}
              </Button>
            </>
          )}
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Icon name="plus" className="w-4 h-4" /> 직접 등록
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·채널·계정 검색"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`no-drag text-[13px] font-semibold px-3 py-2 rounded-[10px] border transition ${
                filter === f.v
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                  : 'bg-[var(--surface)] text-[var(--ink-soft)] border-[var(--line)] hover:border-[var(--muted)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {adding && (
        <Card className="p-5 fade-up flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Icon name="link" className="w-[18px] h-[18px] text-[var(--collect)]" />
            <h3 className="text-[15px] font-bold text-[var(--ink)]">레퍼런스 직접 등록</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="제목">
              <TextInput
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예: 라떼아트 초간단 팁"
              />
            </Field>
            <Field label="출처">
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setForm({ ...form, source: s.v })}
                    className={`no-drag text-[13px] font-semibold px-3 py-2 rounded-[10px] border transition ${
                      form.source === s.v
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                        : 'bg-[var(--paper)] text-[var(--ink-soft)] border-[var(--line)]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="영상 주소" hint="주소를 넣으면 출처를 자동으로 맞춰 줄 수 있어요.">
              <TextInput
                value={form.url}
                onChange={(e) => {
                  const url = e.target.value
                  setForm({ ...form, url, source: form.source === 'manual' ? guessSource(url) : form.source })
                }}
                placeholder="https://..."
              />
            </Field>
            <Field label="채널 / 작성자 (선택)">
              <TextInput
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="예: 홈카페 채널"
              />
            </Field>
          </div>
          <Field label="메모 (선택)">
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="나중에 참고할 메모"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="soft" size="sm" onClick={reset}>취소</Button>
            <Button size="sm" onClick={create}>등록</Button>
          </div>
        </Card>
      )}

      {loading && (
        <p className="text-[13px] text-[var(--muted)] py-8 text-center">레퍼런스를 불러오는 중이에요…</p>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-xl px-5 py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] grid place-items-center mx-auto mb-3">
            <Icon name="film" className="w-6 h-6" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--ink)]">
            {filter === 'published' ? '업로드된 레퍼런스가 없어요' : '아직 레퍼런스가 없어요'}
          </p>
          <p className="text-[13px] text-[var(--muted)] mt-1.5 leading-relaxed">
            {filter === 'published' ? (
              <>릴스로 게시한 영상이 여기에 표시됩니다.</>
            ) : (
              <>
                채널 설정에서 유튜브·인스타 계정을 추가한 뒤<br />
                <b className="text-[var(--ink-soft)]">계정 영상 가져오기</b>를 눌러 주세요.
              </>
            )}
          </p>
          {!adding && filter !== 'published' && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {sources.length > 0 && (
                <Button variant="soft" size="sm" disabled={collecting} onClick={collect}>
                  계정 영상 가져오기
                </Button>
              )}
              <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
                <Icon name="plus" className="w-4 h-4" /> 직접 등록
              </Button>
            </div>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => {
            const uploaded = item.status === 'published'
            return (
              <Card
                key={item.id}
                className={`p-4 flex gap-4 items-start relative overflow-hidden ${
                  uploaded ? 'border-[color-mix(in_srgb,var(--good)_45%,var(--line))] bg-[color-mix(in_srgb,var(--good)_6%,var(--surface))]' : ''
                }`}
              >
                {uploaded && (
                  <div className="absolute top-0 right-0 px-2.5 py-1 rounded-bl-xl bg-[var(--good)] text-white text-[11px] font-bold tracking-wide">
                    업로드됨
                  </div>
                )}
                <div className="w-[88px] h-[88px] rounded-xl bg-[var(--surface-2)] flex-none overflow-hidden grid place-items-center text-[var(--collect)]">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="film" className="w-8 h-8" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Pill tone={sourceTone(item.source)}>{sourceLabel(item.source)}</Pill>
                    {item.keyword ? <Pill tone="muted">@{item.keyword}</Pill> : null}
                    {uploaded ? <Pill tone="good">릴스 게시 완료</Pill> : null}
                    {item.status === 'in_pipeline' ? <Pill tone="warn">제작 중</Pill> : null}
                    {item.score != null ? <Pill tone="good">추천 {Number(item.score).toFixed(1)}</Pill> : null}
                  </div>
                  <h3 className="text-[15px] font-bold text-[var(--ink)] leading-snug truncate pr-16">{item.title}</h3>
                  <p className="text-[12.5px] text-[var(--muted)] mt-1 truncate">
                    {item.author || '작성자 미상'} · {formatDate(item.created_at)}
                  </p>
                  {item.notes ? (
                    <p className="text-[12.5px] text-[var(--ink-soft)] mt-1.5 line-clamp-2">{item.notes}</p>
                  ) : null}
                  {item.url ? (
                    <button
                      onClick={() => openUrl(item.url)}
                      className="no-drag mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--accent)] hover:underline"
                    >
                      <Icon name="external" className="w-3.5 h-3.5" /> 원본 열기
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 flex-none">
                  <Button
                    size="sm"
                    variant={uploaded ? 'soft' : 'primary'}
                    onClick={() => startProduce(item)}
                    disabled={!item.url}
                  >
                    <Icon name="spark" className="w-4 h-4" />
                    {item.status === 'in_pipeline'
                      ? '이어서 만들기'
                      : uploaded
                        ? '다시 만들기'
                        : '이 영상으로 만들기'}
                  </Button>
                  <button
                    onClick={() => remove(item)}
                    className="no-drag text-[var(--muted)] hover:text-[var(--crit)] transition p-1 self-end"
                    title="삭제"
                  >
                    <Icon name="trash" className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="text-[12px] text-[var(--muted)] text-right">
          전체 {items.length}개
          {items.filter((i) => i.status === 'published').length > 0
            ? ` · 업로드됨 ${items.filter((i) => i.status === 'published').length}개`
            : ''}
          {filtered.length !== items.length ? ` · 표시 ${filtered.length}개` : ''}
        </p>
      )}
    </div>
  )
}
