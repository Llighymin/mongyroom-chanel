import React, { useEffect, useMemo, useState } from 'react'
import { Card, Field, TextInput, Button, Icon, Pill, useToast } from './ui.jsx'
import EditStudio from './EditStudio.jsx'
import { resolveEditOptions } from '@shared/editOptions.js'

const STEPS = [
  { id: 'select', label: '선택' },
  { id: 'edit', label: '편집' },
  { id: 'confirm', label: '컨펌' }
]

function stepIndex(stage) {
  if (stage === 'select') return 0
  if (stage === 'edit' || stage === 'failed') return 1
  if (stage === 'confirm' || stage === 'uploading' || stage === 'done') return 2
  return 0
}

function ProgressBar({ value, message }) {
  const pct = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--muted)] flex-1">{message || '잠시만 기다려 주세요…'}</p>
        <span className="text-[13px] font-bold tabular-nums text-[var(--accent)]">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ActivityList({ items }) {
  if (!items?.length) return null
  const tone = {
    pending: 'text-[var(--muted)] border-[var(--line)] bg-[var(--paper)]',
    running: 'text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,var(--line))] bg-[var(--accent-soft)]',
    done: 'text-[var(--good)] border-[color-mix(in_srgb,var(--good)_30%,var(--line))] bg-[color-mix(in_srgb,var(--good)_8%,transparent)]',
    error: 'text-[var(--crit)] border-[color-mix(in_srgb,var(--crit)_35%,var(--line))] bg-[color-mix(in_srgb,var(--crit)_8%,transparent)]',
    skipped: 'text-[var(--muted)] border-[var(--line)] bg-[var(--paper)]'
  }
  const label = {
    pending: '대기',
    running: '진행 중',
    done: '완료',
    error: '실패',
    skipped: '건너뜀'
  }
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center gap-2">
        <Icon name="layers" className="w-4 h-4 text-[var(--edit)]" />
        <span className="text-[13px] font-bold text-[var(--ink)]">지금 하는 작업</span>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {items.map((t) => (
          <li key={t.id} className={`px-4 py-3 flex items-start gap-3 ${tone[t.status] || tone.pending}`}>
            <span className="mt-0.5 w-5 h-5 grid place-items-center flex-none">
              {t.status === 'running' && <Icon name="spinner" className="w-4 h-4 spin" />}
              {t.status === 'done' && <Icon name="check" className="w-4 h-4" />}
              {t.status === 'error' && <Icon name="x" className="w-4 h-4" />}
              {(t.status === 'pending' || t.status === 'skipped') && (
                <span className="w-2 h-2 rounded-full bg-current opacity-40" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13.5px] font-semibold text-[var(--ink)]">{t.label}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label[t.status] || t.status}</span>
              </div>
              {t.detail ? (
                <p className="text-[12.5px] text-[var(--ink-soft)] mt-0.5 truncate">{t.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PreviewPlayer({ url, ready }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [url])

  // ready===false 는 파일 없음. undefined는 구버전/mock 호환으로 url만 있으면 재생
  if (!url || ready === false) {
    return (
      <div className="h-48 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[var(--muted)] text-[13px] px-4 text-center">
        미리보기 영상을 찾지 못했어요. 다시 편집을 실행해 주세요.
      </div>
    )
  }

  if (failed) {
    return (
      <div className="h-48 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[var(--muted)] text-[13px] px-4 text-center leading-relaxed">
        미리보기 재생에 실패했어요.
        <br />
        앱을 다시 연 뒤 「다시 편집」을 시도해 주세요.
      </div>
    )
  }

  return (
    <video
      key={url}
      src={url}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="w-full max-h-[420px] rounded-xl bg-black object-contain"
    />
  )
}

export default function ProduceFlow({ workspace, job, onJobChange, onBackToReferences, onWorkspaceUpdated }) {
  const toast = useToast()
  const [tools, setTools] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [opts, setOpts] = useState(() =>
    resolveEditOptions(workspace.default_edit_options || {}, workspace)
  )
  const [accountId, setAccountId] = useState(null)
  const [caption, setCaption] = useState('')

  useEffect(() => {
    ;(async () => {
      setTools(await window.api.tools.status())
      const accs = await window.api.accounts.list(workspace.id)
      setAccounts(accs)
      const withToken = accs.find((a) => a.hasToken)
      setAccountId((cur) => cur || withToken?.id || accs[0]?.id || null)
    })()
  }, [workspace.id])

  useEffect(() => {
    if (!job) {
      setOpts(resolveEditOptions({}, workspace))
      return
    }
    setOpts(resolveEditOptions(job.edit_options || {}, workspace))
    if (job.caption) setCaption(job.caption)
    if (job.account_id) setAccountId(job.account_id)
  }, [job?.id]) // eslint-disable-line

  // 채널 워터마크 기본값이 바뀌면 이미지 경로 등을 다시 합친다
  useEffect(() => {
    setOpts((cur) => resolveEditOptions(cur, workspace))
  }, [workspace.default_edit_options]) // eslint-disable-line

  useEffect(() => {
    if (!job) return undefined
    return window.api.jobs.onProgress((next) => {
      if (next?.id === job.id) onJobChange(next)
    })
  }, [job?.id, onJobChange])

  const idx = stepIndex(job?.stage)
  const toolsOk = tools?.ytdlp?.ok && tools?.ffmpeg?.ok
  const uploading = job?.stage === 'uploading'
  const isDone = job?.stage === 'done'
  const isEditRunning =
    busy ||
    preparing ||
    (job?.stage === 'edit' &&
      Array.isArray(job.activity_log) &&
      job.activity_log.some((t) => t.status === 'running'))
  const showEditProgress =
    isEditRunning ||
    (job?.stage === 'edit' &&
      Array.isArray(job.activity_log) &&
      job.activity_log.some((t) => t.status === 'done' || t.status === 'error' || t.status === 'running'))

  const refreshTools = async () => {
    setTools(await window.api.tools.status())
  }

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  )

  const goEdit = async () => {
    if (!job) return
    await window.api.jobs.update(job.id, {
      stage: 'edit',
      message: '영역을 고른 뒤 「편집 시작」을 눌러 주세요.',
      progress: 0,
      activity_log: []
    })
    const fresh = await window.api.jobs.get(job.id)
    onJobChange(fresh)
  }

  useEffect(() => {
    if (!job) return undefined
    if (job.stage !== 'edit' && job.stage !== 'failed') return undefined
    if (job.source_ready || preparing) return undefined
    if (!window.api.jobs.prepareSource) return undefined
    let alive = true
    ;(async () => {
      setPreparing(true)
      const res = await window.api.jobs.prepareSource(job.id)
      if (!alive) return
      setPreparing(false)
      if (res.job) onJobChange(res.job)
      if (!res.ok) toast(res.error || '원본을 불러오지 못했어요.', 'crit')
    })()
    return () => {
      alive = false
    }
  }, [job?.id, job?.stage, job?.source_ready]) // eslint-disable-line

  const backToEdit = async () => {
    if (!job) return
    await window.api.jobs.update(job.id, {
      stage: 'edit',
      message: '옵션을 바꾼 뒤 다시 편집해 주세요.',
      progress: 0,
      error: ''
    })
    const fresh = await window.api.jobs.get(job.id)
    onJobChange(fresh)
  }

  const startEdit = async () => {
    if (!toolsOk) return toast(tools?.hint || '편집 도구가 필요해요.', 'crit')
    const nextOpts = resolveEditOptions(opts, workspace)
    setOpts(nextOpts)
    if (
      nextOpts.watermark?.on &&
      nextOpts.watermark.kind === 'image' &&
      !nextOpts.watermark.image_path &&
      !nextOpts.watermark.image_file
    ) {
      return toast('워터마크 이미지를 선택해 주세요. 채널 설정에서 기본 이미지를 넣을 수도 있어요.', 'crit')
    }
    setBusy(true)
    const res = await window.api.jobs.startEdit(job.id, nextOpts)
    setBusy(false)
    if (!res.ok) {
      if (res.job) onJobChange(res.job)
      return toast(res.error || '편집에 실패했어요.', 'crit')
    }
    onJobChange(res.job)
    toast('편집이 끝났어요. 미리보기를 확인해 주세요.')
  }

  const publish = async () => {
    if (!accountId) return toast('업로드할 계정을 선택해 주세요.', 'crit')
    if (!selectedAccount?.ready && !selectedAccount?.hasToken) {
      return toast('선택한 계정에 토큰이 없어요. 채널 설정에서 저장해 주세요.', 'crit')
    }
    if (!selectedAccount?.ig_user_id) {
      return toast('인스타그램 사용자 ID가 없어요. 채널 설정에서 계정을 다시 연결해 주세요.', 'crit')
    }
    setBusy(true)
    const res = await window.api.jobs.publish(job.id, {
      accountId,
      caption: caption.trim(),
      shareToFeed: opts.share_to_feed
    })
    setBusy(false)
    if (!res.ok) {
      if (res.job) onJobChange(res.job)
      return toast(res.error || '게시에 실패했어요.', 'crit')
    }
    onJobChange(res.job)
    toast('릴스를 게시했어요.')
  }

  const cancel = async () => {
    if (!window.confirm('진행 중인 제작을 취소할까요?')) return
    const j = await window.api.jobs.cancel(job.id)
    onJobChange(j)
    toast('제작을 취소했어요.')
    onBackToReferences?.()
  }

  if (!job) {
    return (
      <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-xl px-5 py-10 text-center">
        <p className="text-[14px] font-semibold text-[var(--ink)]">진행 중인 제작이 없어요</p>
        <p className="text-[13px] text-[var(--muted)] mt-1.5">
          레퍼런스 목록에서 <b className="text-[var(--ink-soft)]">이 영상으로 만들기</b>를 눌러 시작하세요.
        </p>
        <div className="mt-5">
          <Button variant="soft" size="sm" onClick={onBackToReferences}>레퍼런스로 이동</Button>
        </div>
      </div>
    )
  }

  const ref = job.reference

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="spark" className="w-[18px] h-[18px] text-[var(--edit)]" />
            릴스 만들기
          </h2>
          <p className="text-[13px] text-[var(--muted)] mt-1">선택 → 편집 → 확인 후 게시까지 한 번에 이어집니다.</p>
        </div>
        {!isDone && (
          <Button variant="soft" size="sm" onClick={cancel} disabled={isEditRunning || uploading}>취소</Button>
        )}
      </div>

      {/* 스텝 표시 */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const active = i === idx
          const done = i < idx || isDone
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <div className={`flex-1 h-px ${done || active ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`} />}
              <div
                className={`flex items-center gap-2 text-[13px] font-semibold px-3 py-1.5 rounded-full border ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                    : done
                      ? 'bg-[var(--surface)] text-[var(--good)] border-[var(--line)]'
                      : 'bg-[var(--surface)] text-[var(--muted)] border-[var(--line)]'
                }`}
              >
                <span className="w-5 h-5 rounded-full grid place-items-center text-[11px] bg-[var(--surface-2)]">{i + 1}</span>
                {s.label}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {!toolsOk && tools && (
        <Card className="p-4 border-[color-mix(in_srgb,var(--warn)_40%,var(--line))]">
          <p className="text-[13px] text-[var(--ink)] font-semibold">편집에 필요한 프로그램이 없어요</p>
          <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
            {tools.hint || '터미널에서 brew install yt-dlp ffmpeg 를 실행해 주세요.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Pill tone={tools.ytdlp?.ok ? 'good' : 'warn'}>yt-dlp {tools.ytdlp?.ok ? '준비됨' : '없음'}</Pill>
            <Pill tone={tools.ffmpeg?.ok ? 'good' : 'warn'}>ffmpeg {tools.ffmpeg?.ok ? '준비됨' : '없음'}</Pill>
            <Button variant="ghost" size="sm" onClick={refreshTools}>다시 확인</Button>
          </div>
        </Card>
      )}

      {/* SELECT */}
      {job.stage === 'select' && (
        <Card className="p-6 flex flex-col gap-4 fade-up">
          <h3 className="text-[15px] font-bold text-[var(--ink)]">이 영상으로 릴스를 만들까요?</h3>
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[var(--collect)] flex-none">
              <Icon name="film" className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[var(--ink)]">{ref?.title || '제목 없음'}</p>
              <p className="text-[12.5px] text-[var(--muted)] mt-1 truncate">{ref?.author || '작성자 미상'} · {ref?.url}</p>
            </div>
          </div>
          <div className="rounded-xl bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-4 py-3 text-[12.5px] text-[var(--ink-soft)] leading-relaxed">
            다른 사람의 영상을 그대로 올리면 저작권·플랫폼 약관에 걸릴 수 있어요. 게시 책임은 운영자에게 있습니다.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="soft" onClick={onBackToReferences}>다른 영상 고르기</Button>
            <Button onClick={goEdit}>편집으로 계속</Button>
          </div>
        </Card>
      )}

      {/* EDIT */}
      {(job.stage === 'edit' || job.stage === 'failed') && (
        <Card className="p-6 flex flex-col gap-5 fade-up">
          <h3 className="text-[15px] font-bold text-[var(--ink)]">편집 옵션</h3>
          <p className="text-[13px] text-[var(--muted)] -mt-3">
            원본에서 영역을 고르고, 빈 칸 색·문구·워터마크를 맞춘 뒤 릴스(9:16)로 만듭니다. 90초가 넘는 영상은 앞부분만 사용해요.
          </p>

          <EditStudio
            workspace={workspace}
            opts={opts}
            setOpts={setOpts}
            job={job}
            disabled={isEditRunning}
            preparing={preparing}
            onWorkspaceUpdated={onWorkspaceUpdated}
          />

          {!isEditRunning && job.stage === 'edit' && (
            <div className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-[13px] text-[var(--accent)] font-medium">
              옵션을 확인한 뒤 아래 <b>편집 시작</b> 버튼을 눌러 주세요.
            </div>
          )}

          {showEditProgress && (
            <div className="flex flex-col gap-4">
              <ProgressBar value={job.progress} message={job.message} />
              <ActivityList items={job.activity_log} />
            </div>
          )}

          {job.stage === 'failed' && Array.isArray(job.activity_log) && job.activity_log.length > 0 && !showEditProgress && (
            <ActivityList items={job.activity_log} />
          )}

          {job.stage === 'failed' && job.error && (
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] px-4 py-3 text-[13px] text-[var(--crit)] leading-relaxed">
              {job.error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              onClick={startEdit}
              disabled={!toolsOk || isEditRunning}
            >
              {isEditRunning ? '편집 중…' : job.stage === 'failed' ? '다시 편집' : '편집 시작'}
            </Button>
          </div>
        </Card>
      )}

      {/* CONFIRM / UPLOADING / DONE */}
      {(job.stage === 'confirm' || uploading || isDone) && (
        <Card className="p-6 flex flex-col gap-5 fade-up">
          <h3 className="text-[15px] font-bold text-[var(--ink)]">
            {isDone ? '게시 완료' : '미리보기 · 게시 확인'}
          </h3>

          <PreviewPlayer url={job.preview_url} ready={job.preview_ready} />

          {!isDone && (
            <>
              <Field label="올릴 계정">
                {accounts.length === 0 ? (
                  <p className="text-[13px] text-[var(--muted)]">
                    연결된 계정이 없어요. 채널 설정에서 릴스 계정을 먼저 추가해 주세요.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {accounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={uploading || busy}
                        onClick={() => setAccountId(a.id)}
                        className={`no-drag text-left px-4 py-3 rounded-xl border transition ${
                          accountId === a.id
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--line)] bg-[var(--paper)]'
                        }`}
                      >
                        <div className="text-[14px] font-semibold text-[var(--ink)]">{a.label}</div>
                        <div className="text-[12px] text-[var(--muted)] mt-0.5">
                          {a.ready
                            ? `업로드 가능 · IG ${a.ig_user_id}`
                            : a.hasToken
                              ? 'IG 사용자 ID가 필요해요'
                              : '토큰 없음 — 채널 설정에서 저장 필요'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="캡션" hint="해시태그·멘션을 포함해 적어도 됩니다.">
                <textarea
                  value={caption}
                  disabled={uploading || busy}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  placeholder="릴스에 함께 올릴 문구"
                  className="no-drag w-full bg-[var(--paper)] border border-[var(--line)] rounded-[10px] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition resize-y"
                />
              </Field>

              <label className="flex items-center gap-3 text-[14px] text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="no-drag accent-[var(--accent)] w-4 h-4"
                  checked={opts.share_to_feed !== false}
                  disabled={uploading || busy}
                  onChange={(e) => setOpts({ ...opts, share_to_feed: e.target.checked })}
                />
                피드에도 함께 공유
              </label>

              <div className="rounded-xl bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-4 py-3 text-[12.5px] text-[var(--ink-soft)] leading-relaxed">
                게시 버튼을 누르면 인스타그램 릴스로 올라갑니다. 첫 댓글은 다음 단계에서 따로 작성할 수 있어요.
              </div>
            </>
          )}

          {(uploading || busy) && job.stage !== 'done' && (
            <div className="flex flex-col gap-4">
              <ProgressBar value={job.progress} message={job.message} />
              <ActivityList items={job.activity_log} />
            </div>
          )}

          {isDone && Array.isArray(job.activity_log) && job.activity_log.length > 0 && (
            <ActivityList items={job.activity_log} />
          )}

          {job.error && job.stage === 'confirm' && Array.isArray(job.activity_log) && job.activity_log.length > 0 && !uploading && (
            <ActivityList items={job.activity_log} />
          )}

          {job.error && job.stage === 'confirm' && (
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] px-4 py-3 text-[13px] text-[var(--crit)] leading-relaxed">
              {job.error}
            </div>
          )}

          {isDone && (
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--good)_12%,transparent)] px-4 py-3 text-[13px] text-[var(--good)] font-medium">
              게시가 완료됐어요. {job.published_id ? `게시 ID: ${job.published_id}` : ''}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {isDone ? (
              <Button onClick={onBackToReferences}>레퍼런스로 돌아가기</Button>
            ) : (
              <>
                <Button
                  variant="soft"
                  disabled={uploading || busy}
                  onClick={backToEdit}
                >
                  다시 편집
                </Button>
                <Button
                  onClick={publish}
                  disabled={uploading || busy || !accountId || accounts.length === 0}
                >
                  {uploading || busy ? '게시 중…' : '릴스 게시'}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
