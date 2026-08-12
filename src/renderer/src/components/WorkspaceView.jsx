import React, { useEffect, useState, useCallback } from 'react'
import { Card, Field, TextInput, Button, Icon, Pill, useToast } from './ui.jsx'
import ReferencesView from './ReferencesView.jsx'
import ProduceFlow from './ProduceFlow.jsx'
import {
  WATERMARK_POSITIONS,
  normalizeEditOptions
} from '@shared/editOptions.js'

const TABS = [
  { id: 'references', label: '레퍼런스', icon: 'film' },
  { id: 'produce', label: '릴스 만들기', icon: 'spark' },
  { id: 'settings', label: '채널 설정', icon: 'settings' }
]

export default function WorkspaceView({ workspace, onUpdated, onDeleted }) {
  const toast = useToast()
  const [tab, setTab] = useState('references')
  const [name, setName] = useState(workspace.name)
  const [accounts, setAccounts] = useState([])
  const [activeJob, setActiveJob] = useState(null)

  const loadJob = useCallback(async () => {
    const job = await window.api.jobs.active(workspace.id)
    setActiveJob(job)
    return job
  }, [workspace.id])

  useEffect(() => {
    setName(workspace.name)
    setTab('references')
    loadAccounts()
    loadJob()
  }, [workspace.id]) // eslint-disable-line

  const loadAccounts = async () => setAccounts(await window.api.accounts.list(workspace.id))

  const removeWorkspace = async () => {
    if (!window.confirm(`'${workspace.name}' 워크스페이스를 삭제할까요?\n연결된 계정·설정·레퍼런스도 함께 지워집니다.`)) return
    await window.api.workspaces.remove(workspace.id)
    onDeleted(workspace.id)
    toast('워크스페이스를 삭제했습니다.')
  }

  const startProduce = async (job) => {
    if (job) setActiveJob(job)
    else await loadJob()
    setTab('produce')
  }

  return (
    <div className="fade-up max-w-[820px] mx-auto px-8 py-8 flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={async () => {
              if (!name.trim() || name === workspace.name) return
              const updated = await window.api.workspaces.update(workspace.id, { name: name.trim() })
              onUpdated(updated)
              toast('이름을 저장했습니다.')
            }}
            className="no-drag w-full bg-transparent text-[26px] font-extrabold tracking-tight text-[var(--ink)] outline-none border-b-2 border-transparent focus:border-[var(--accent)] transition pb-1"
          />
          <p className="text-[13px] text-[var(--muted)] mt-1.5">
            레퍼런스를 고르고 편집·게시를 이어서 진행합니다.
          </p>
        </div>
        <Button variant="danger" size="sm" onClick={removeWorkspace}>
          <Icon name="trash" className="w-4 h-4" /> 삭제
        </Button>
      </header>

      <div className="flex gap-1 p-1 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] w-fit">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`no-drag inline-flex items-center gap-2 text-[13.5px] font-semibold px-3.5 py-2 rounded-[10px] transition ${
                active
                  ? 'bg-[var(--surface)] text-[var(--accent)] shadow-soft'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}
            >
              <Icon name={t.icon} className="w-4 h-4" />
              {t.label}
              {t.id === 'produce' && activeJob && !['done', 'cancelled'].includes(activeJob.stage) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          )
        })}
      </div>

      {tab === 'references' && (
        <ReferencesView workspace={workspace} onStartProduce={startProduce} />
      )}

      {tab === 'produce' && (
        <ProduceFlow
          workspace={workspace}
          job={activeJob}
          onJobChange={setActiveJob}
          onBackToReferences={() => { loadJob(); setTab('references') }}
          onWorkspaceUpdated={onUpdated}
        />
      )}

      {tab === 'settings' && (
        <div className="flex flex-col gap-6">
          <ReferenceSourcesCard workspace={workspace} onUpdated={onUpdated} toast={toast} />
          <WatermarkDefaultsCard workspace={workspace} onUpdated={onUpdated} toast={toast} />
          <AccountsCard workspaceId={workspace.id} accounts={accounts} reload={loadAccounts} toast={toast} />
        </div>
      )}
    </div>
  )
}

function ReferenceSourcesCard({ workspace, onUpdated, toast }) {
  const [platform, setPlatform] = useState('youtube')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [collectingId, setCollectingId] = useState(null)
  const [fetchLimit, setFetchLimit] = useState(100)
  const sources = workspace.reference_sources || []
  const LIMITS = [50, 100, 200, 300]

  const add = async () => {
    if (!input.trim()) return toast('계정 주소 또는 @핸들을 입력해 주세요.', 'crit')
    setBusy(true)
    try {
      const res = await window.api.references.addSource(workspace.id, input.trim(), platform)
      if (!res.ok) return toast(res.error || '계정을 추가하지 못했어요.', 'crit')
      if (res.workspace) onUpdated(res.workspace)
      setInput('')
      if (res.already) toast('이미 추가된 계정이에요.')
      else toast('레퍼런스 계정을 추가했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (src) => {
    if (!window.confirm(`${src.label} 계정을 삭제할까요?\n이미 가져온 레퍼런스 영상은 그대로 둡니다.`)) return
    const res = await window.api.references.removeSource(workspace.id, src.id)
    if (!res.ok) return toast(res.error || '삭제하지 못했어요.', 'crit')
    if (res.workspace) onUpdated(res.workspace)
    toast('계정을 삭제했습니다.')
  }

  const collect = async (sourceId = null) => {
    setCollectingId(sourceId || '__all__')
    try {
      const res = await window.api.references.collect(workspace.id, sourceId, fetchLimit)
      if (!res.ok) return toast(res.error || '영상을 가져오지 못했어요.', 'crit')
      const errHint = res.errors?.length ? ` (일부 실패 ${res.errors.length}건)` : ''
      toast(`최근 ${res.limit || fetchLimit}개 기준으로 새 레퍼런스 ${res.added || 0}개를 추가했어요.${errHint}`)
    } finally {
      setCollectingId(null)
    }
  }

  return (
    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="film" className="w-[18px] h-[18px] text-[var(--collect)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">레퍼런스 계정</h2>
        </div>
        {sources.length > 0 && (
          <Button
            variant="soft"
            size="sm"
            disabled={!!collectingId}
            onClick={() => collect(null)}
          >
            {collectingId === '__all__' ? '가져오는 중…' : '전체 영상 가져오기'}
          </Button>
        )}
      </div>
      <p className="text-[12.5px] text-[var(--muted)] -mt-3 leading-relaxed">
        유튜브·인스타 계정을 넣으면 그 계정의 최근 영상을 레퍼런스 목록에 가져올 수 있어요.
      </p>

      <Field label="가져올 개수" hint="계정당 최근 영상 기준이에요. 많을수록 시간이 더 걸립니다.">
        <div className="flex flex-wrap gap-1.5">
          {LIMITS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFetchLimit(n)}
              className={`no-drag px-3 py-1.5 rounded-full border text-[13px] font-semibold ${
                fetchLimit === n
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-soft)]'
              }`}
            >
              {n}개
            </button>
          ))}
        </div>
      </Field>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'youtube', label: '유튜브' },
          { id: 'instagram', label: '인스타그램' }
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlatform(p.id)}
            className={`no-drag px-3 py-1.5 rounded-full border text-[13px] font-semibold ${
              platform === p.id
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--ink-soft)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[220px]">
          <Field
            label={platform === 'instagram' ? '인스타 계정' : '유튜브 채널'}
            hint={
              platform === 'instagram'
                ? '예: @cafehome 또는 https://www.instagram.com/cafehome/'
                : '예: @channel 또는 https://www.youtube.com/@channel'
            }
          >
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={platform === 'instagram' ? '@username' : '@channel'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
          </Field>
        </div>
        <Button onClick={add} disabled={busy}>
          {busy ? '추가 중…' : '계정 추가'}
        </Button>
      </div>

      {sources.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)] leading-relaxed bg-[var(--paper)] border border-dashed border-[var(--line)] rounded-xl px-4 py-4">
          아직 등록된 레퍼런스 계정이 없어요. 참고할 유튜브·인스타 계정을 추가해 주세요.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sources.map((src) => (
            <div
              key={src.id}
              className="flex items-center gap-3 bg-[var(--paper)] border border-[var(--line)] rounded-xl px-4 py-3"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] grid place-items-center flex-none text-[var(--collect)]">
                <Icon name="user" className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-[var(--ink)] truncate">{src.label}</span>
                  <Pill tone={src.platform === 'youtube' ? 'warn' : 'good'}>
                    {src.platform === 'youtube' ? '유튜브' : '인스타'}
                  </Pill>
                </div>
                <p className="text-[12px] text-[var(--muted)] truncate mt-0.5">{src.url}</p>
              </div>
              <Button
                variant="soft"
                size="sm"
                disabled={!!collectingId}
                onClick={() => collect(src.id)}
              >
                {collectingId === src.id ? '가져오는 중…' : '영상 가져오기'}
              </Button>
              <button
                type="button"
                onClick={() => remove(src)}
                className="no-drag text-[var(--muted)] hover:text-[var(--crit)] transition p-1"
                title="삭제"
              >
                <Icon name="trash" className="w-[18px] h-[18px]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function WatermarkDefaultsCard({ workspace, onUpdated, toast }) {
  const defaults = normalizeEditOptions(workspace.default_edit_options || {}, workspace.name)
  const [wm, setWm] = useState(defaults.watermark)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next = normalizeEditOptions(workspace.default_edit_options || {}, workspace.name)
    setWm(next.watermark)
    setPreviewUrl(null)
  }, [workspace.id, workspace.default_edit_options])

  const patch = (p) => setWm((cur) => ({ ...cur, ...p }))

  const pickImage = async () => {
    const file = await window.api.assets.pickWatermark(workspace.id)
    if (!file) return
    patch({
      kind: 'image',
      image_path: file.path,
      image_file: file.filename,
      image_name: file.name,
      on: true
    })
    setPreviewUrl(file.url || null)
  }

  const clearImage = () => {
    patch({ image_path: '', image_file: '', image_name: '' })
    setPreviewUrl(null)
  }

  const save = async () => {
    if (wm.on && wm.kind === 'image' && !wm.image_path && !wm.image_file) {
      return toast('워터마크 이미지를 선택해 주세요.', 'crit')
    }
    setSaving(true)
    try {
      const next = normalizeEditOptions(
        { ...defaults, watermark: wm },
        workspace.name
      )
      const updated = await window.api.workspaces.update(workspace.id, {
        default_edit_options: next
      })
      onUpdated(updated)
      toast('워터마크 기본값을 저장했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const setPosition = (p) => patch({ position: p.id, px: p.px, py: p.py })

  return (
    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="spark" className="w-[18px] h-[18px] text-[var(--accent)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">워터마크 기본값</h2>
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-soft)]">
          <input
            type="checkbox"
            className="no-drag"
            checked={!!wm.on}
            onChange={(e) => patch({ on: e.target.checked })}
          />
          사용
        </label>
      </div>
      <p className="text-[12.5px] text-[var(--muted)] -mt-3 leading-relaxed">
        이 채널에서 릴스를 만들 때 기본으로 들어가는 워터마크예요. 편집 화면에서도 바꿀 수 있습니다.
      </p>

      {wm.on && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={wm.kind === 'text' ? 'primary' : 'soft'}
              size="sm"
              onClick={() => patch({ kind: 'text' })}
            >
              글자
            </Button>
            <Button
              variant={wm.kind === 'image' ? 'primary' : 'soft'}
              size="sm"
              onClick={() => patch({ kind: 'image', on: true })}
            >
              이미지
            </Button>
          </div>

          {wm.kind === 'text' ? (
            <Field label="워터마크 문구">
              <TextInput
                value={wm.text || ''}
                onChange={(e) => patch({ text: e.target.value })}
                placeholder={workspace.name || 'Studio'}
              />
            </Field>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4 bg-[var(--paper)] border border-[var(--line)] rounded-xl px-4 py-3">
                <div className="w-16 h-16 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden grid place-items-center flex-none">
                  {(previewUrl || workspace.watermark_preview_url) ? (
                    <img
                      src={previewUrl || workspace.watermark_preview_url}
                      alt=""
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : wm.image_name || wm.image_file ? (
                    <Icon name="film" className="w-6 h-6 text-[var(--muted)]" />
                  ) : (
                    <span className="text-[11px] text-[var(--muted)] text-center px-1">없음</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--ink)] truncate">
                    {wm.image_name || wm.image_file || '이미지를 선택해 주세요'}
                  </p>
                  <p className="text-[12px] text-[var(--muted)] mt-0.5">
                    PNG·JPG·WebP · 투명 배경 권장
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button variant="soft" size="sm" onClick={pickImage}>이미지 선택</Button>
                    {(wm.image_path || wm.image_file) && (
                      <Button variant="ghost" size="sm" onClick={clearImage}>지우기</Button>
                    )}
                  </div>
                </div>
              </div>
              <Field label={`크기 ${Math.round((wm.scale || 0.22) * 100)}%`}>
                <input
                  type="range"
                  min="0.08"
                  max="0.6"
                  step="0.01"
                  value={wm.scale || 0.22}
                  className="no-drag w-full"
                  onChange={(e) => patch({ scale: Number(e.target.value) })}
                />
              </Field>
            </div>
          )}

          <Field label="위치">
            <div className="flex flex-wrap gap-1.5">
              {WATERMARK_POSITIONS.filter((p) => p.id !== 'custom').map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={`no-drag px-2.5 py-1 rounded-full border text-[12px] ${
                    wm.position === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '워터마크 기본값 저장'}
        </Button>
      </div>
    </Card>
  )
}

function AccountsCard({ workspaceId, accounts, reload, toast }) {
  const empty = { label: '', ig_user_id: '', page_id: '', token: '' }
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)

  const reset = () => {
    setForm(empty)
    setAdding(false)
    setEditingId(null)
  }

  const startEdit = (acc) => {
    setEditingId(acc.id)
    setAdding(false)
    setForm({
      label: acc.label || '',
      ig_user_id: acc.ig_user_id || '',
      page_id: acc.page_id || '',
      token: ''
    })
  }

  const create = async () => {
    if (!form.label.trim()) return toast('계정 이름을 입력해 주세요.', 'crit')
    if (!form.token.trim()) return toast('액세스 토큰을 입력해 주세요.', 'crit')
    if (!form.ig_user_id.trim() && !form.page_id.trim()) {
      return toast('인스타그램 사용자 ID 또는 페이스북 페이지 ID를 입력해 주세요.', 'crit')
    }
    setBusy(true)
    try {
      const res = await window.api.accounts.create(workspaceId, {
        label: form.label.trim(),
        ig_user_id: form.ig_user_id.trim(),
        page_id: form.page_id.trim(),
        token: form.token.trim()
      })
      if (res?.ok === false) return toast(res.error || '계정을 저장하지 못했어요.', 'crit')
      reset()
      reload()
      toast(res.message || '계정을 추가하고 연결을 확인했습니다.')
      if (res.permissionWarning) toast(res.permissionWarning)
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!form.label.trim()) return toast('계정 이름을 입력해 주세요.', 'crit')
    setBusy(true)
    try {
      const res = await window.api.accounts.update(editingId, {
        label: form.label.trim(),
        ig_user_id: form.ig_user_id.trim(),
        page_id: form.page_id.trim(),
        token: form.token.trim() || undefined
      })
      if (res?.ok === false) return toast(res.error || '계정을 수정하지 못했어요.', 'crit')
      reset()
      reload()
      toast(res.message || '계정 정보를 저장했습니다.')
      if (res.permissionWarning) toast(res.permissionWarning)
    } finally {
      setBusy(false)
    }
  }

  const testDraft = async () => {
    if (!form.token.trim() && !editingId) {
      return toast('액세스 토큰을 입력해 주세요.', 'crit')
    }
    setTesting(true)
    try {
      const payload = editingId && !form.token.trim()
        ? { accountId: editingId }
        : {
            ig_user_id: form.ig_user_id.trim(),
            page_id: form.page_id.trim(),
            token: form.token.trim()
          }
      // 수정 중 토큰을 새로 넣었으면 그 값으로 테스트
      if (editingId && form.token.trim()) {
        payload.ig_user_id = form.ig_user_id.trim()
        payload.page_id = form.page_id.trim()
        payload.token = form.token.trim()
        delete payload.accountId
      }
      const res = await window.api.accounts.test(payload)
      if (!res.ok) return toast(res.message || '연결에 실패했어요.', 'crit')
      if (res.ig_user_id && !form.ig_user_id) {
        setForm((f) => ({ ...f, ig_user_id: res.ig_user_id }))
      }
      toast(res.message || '연결 성공')
      if (res.permissionWarning) toast(res.permissionWarning)
    } finally {
      setTesting(false)
    }
  }

  const testSaved = async (acc) => {
    setTesting(acc.id)
    try {
      const res = await window.api.accounts.test({ accountId: acc.id })
      if (!res.ok) return toast(res.message || '연결에 실패했어요.', 'crit')
      reload()
      toast(res.message || '연결 성공')
      if (res.permissionWarning) toast(res.permissionWarning)
    } finally {
      setTesting(false)
    }
  }

  const remove = async (acc) => {
    if (!window.confirm(`'${acc.label}' 계정을 삭제할까요?`)) return
    await window.api.accounts.remove(acc.id)
    reload()
    toast('계정을 삭제했습니다.')
  }

  const formOpen = adding || editingId

  return (
    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="user" className="w-[18px] h-[18px] text-[var(--upload)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">릴스 업로드 계정</h2>
        </div>
        {!formOpen && (
          <Button variant="soft" size="sm" onClick={() => { setAdding(true); setEditingId(null); setForm(empty) }}>
            <Icon name="plus" className="w-4 h-4" /> 계정 추가
          </Button>
        )}
      </div>

      <p className="text-[12.5px] text-[var(--muted)] -mt-2 leading-relaxed">
        업로드에 필요한 값은 <b className="text-[var(--ink-soft)]">액세스 토큰</b>과
        <b className="text-[var(--ink-soft)]"> 인스타그램 사용자 ID</b>입니다.
        페이지 ID만 있으면 연결된 IG ID를 자동으로 찾을 수 있어요.
        앱 설정의 메타 앱 ID/시크릿이 있으면 토큰을 장기 토큰으로 바꿔 저장합니다.
      </p>

      {accounts.length === 0 && !formOpen && (
        <p className="text-[13px] text-[var(--muted)] leading-relaxed bg-[var(--paper)] border border-dashed border-[var(--line)] rounded-xl px-4 py-4">
          아직 연결된 인스타그램 계정이 없습니다. 릴스를 올리려면 <b className="text-[var(--ink-soft)]">프로페셔널(비즈니스/크리에이터) 계정</b>과
          게시 권한이 있는 액세스 토큰이 필요합니다.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-3 bg-[var(--paper)] border border-[var(--line)] rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] grid place-items-center text-[var(--upload)] flex-none">
              <Icon name="user" className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[var(--ink)] truncate">{a.label}</div>
              <div className="text-[12px] text-[var(--muted)] truncate">
                IG ID {a.ig_user_id || '—'} · 페이지 {a.page_id || '—'}
              </div>
            </div>
            <Pill tone={a.ready ? 'good' : 'warn'}>
              {a.ready ? '업로드 가능' : a.hasToken ? 'ID 필요' : '토큰 없음'}
            </Pill>
            <Button
              variant="ghost"
              size="sm"
              disabled={testing === a.id}
              onClick={() => testSaved(a)}
            >
              {testing === a.id ? '확인 중…' : '연결 확인'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>수정</Button>
            <button onClick={() => remove(a)} className="no-drag text-[var(--muted)] hover:text-[var(--crit)] transition p-1" title="삭제">
              <Icon name="trash" className="w-[18px] h-[18px]" />
            </button>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fade-up bg-[var(--paper)] border border-[var(--line)] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Icon name="key" className="w-[18px] h-[18px] text-[var(--upload)]" />
            <h3 className="text-[15px] font-bold text-[var(--ink)]">
              {editingId ? '계정 수정' : '계정 추가'}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="계정 이름 (표시용)">
              <TextInput
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="예: 우리카페 인스타"
              />
            </Field>
            <Field
              label="액세스 토큰"
              hint={editingId ? '비워 두면 기존 토큰을 유지합니다. 키체인에 암호화 저장됩니다.' : '페이지 액세스 토큰 권장 · 키체인에 암호화 저장'}
            >
              <TextInput
                type="password"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder={editingId ? '새 토큰 (선택)' : 'EAAG...'}
              />
            </Field>
            <Field
              label="인스타그램 사용자 ID"
              hint="숫자형 IG User ID (비즈니스 계정). @핸들이 아닙니다."
            >
              <TextInput
                value={form.ig_user_id}
                onChange={(e) => setForm({ ...form, ig_user_id: e.target.value })}
                placeholder="17841400000000000"
              />
            </Field>
            <Field
              label="페이스북 페이지 ID"
              hint="비워도 되지만, 넣으면 IG ID 자동 조회·연결 검증에 씁니다."
            >
              <TextInput
                value={form.page_id}
                onChange={(e) => setForm({ ...form, page_id: e.target.value })}
                placeholder="1000000000000000"
              />
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="soft" size="sm" onClick={reset} disabled={busy}>취소</Button>
            <Button variant="soft" size="sm" onClick={testDraft} disabled={busy || !!testing}>
              {testing ? '확인 중…' : '연결 테스트'}
            </Button>
            <Button size="sm" onClick={editingId ? saveEdit : create} disabled={busy}>
              {busy ? '저장 중…' : editingId ? '수정 저장' : '계정 저장'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
