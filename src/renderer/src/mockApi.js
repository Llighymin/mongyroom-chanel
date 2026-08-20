/**
 * 브라우저(일반 웹)에서 미리보기·개발할 때만 쓰는 가짜 백엔드.
 * 실제 Electron 앱에서는 preload가 window.api를 먼저 주입하므로 이 코드는 실행되지 않는다.
 */
export function installMockApi() {
  if (window.api) return // 진짜 Electron 환경

  let wsSeq = 2
  let accSeq = 1
  let refSeq = 2
  let jobSeq = 0
  const workspaces = [
    {
      id: 1,
      name: '홈카페',
      keywords: [],
      interval_minutes: 60,
      reference_sources: [
        {
          id: 'youtube:cafehome',
          platform: 'youtube',
          handle: 'cafehome',
          label: '@cafehome',
          url: 'https://www.youtube.com/@cafehome/videos'
        }
      ],
      default_edit_options: {
        share_to_feed: true,
        fill_color: '#000000',
        crop: { x: 0, y: 0, w: 1, h: 1 },
        watermark: { on: true, kind: 'text', text: '홈카페', position: 'bottom-center', px: 0.5, py: 0.92 },
        texts: [],
        images: []
      },
      created_at: '2026-08-03'
    }
  ]
  const accounts = [
    { id: 1, workspace_id: 1, label: '우리카페 인스타', ig_user_id: '17841400000000000', page_id: '1000000000000000', hasToken: true, ready: true }
  ]
  const references = [
    {
      id: 1,
      workspace_id: 1,
      title: '집에서도 카페처럼 — 라떼아트 초간단 팁',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      source: 'youtube',
      thumbnail_url: '',
      author: '홈카페 채널',
      keyword: 'cafehome',
      score: 8.4,
      notes: '',
      status: 'published',
      source_account: 'youtube:cafehome',
      created_at: '2026-08-09'
    },
    {
      id: 2,
      workspace_id: 1,
      title: '원두 보관법 — 향이 안 날아가는 방법',
      url: 'https://www.instagram.com/reel/example/',
      source: 'instagram',
      thumbnail_url: '',
      author: '@coffeedaily',
      keyword: 'coffeedaily',
      score: 7.1,
      notes: '',
      status: 'new',
      source_account: 'instagram:coffeedaily',
      created_at: '2026-08-08'
    }
  ]
  const jobs = []
  const presets = []
  let presetSeq = 0
  const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
  const secrets = { claude_api_key: true, youtube_api_key: false, meta_app_id: false, meta_app_secret: false }
  const delay = (v, ms = 120) => new Promise((r) => setTimeout(() => r(v), ms))
  const progressListeners = new Set()

  const enrich = (job) => {
    if (!job) return null
    const ref = references.find((r) => r.id === job.reference_id)
    const canPreview =
      job.stage === 'confirm' || job.stage === 'uploading' || job.stage === 'done'
    return {
      ...job,
      edit_options: { ...(job.edit_options || {}) },
      reference: ref
        ? { id: ref.id, title: ref.title, url: ref.url, source: ref.source, author: ref.author, thumbnail_url: ref.thumbnail_url }
        : null,
      // 브라우저 미리보기용 샘플 영상 (실제 Electron에선 studio-media:// 사용)
      preview_ready: canPreview,
      preview_url: canPreview ? SAMPLE : null,
      source_ready: !!job.source_path || job.stage === 'edit' || job.stage === 'failed' || canPreview,
      source_url: SAMPLE,
      thumb_url: null,
      watermark_preview_url: null,
      overlay_preview_urls: {}
    }
  }

  const emit = (job) => {
    const e = enrich(job)
    progressListeners.forEach((cb) => cb(e))
    return e
  }

  const activeStages = new Set(['select', 'edit', 'confirm', 'uploading', 'failed'])

  window.api = {
    workspaces: {
      list: () => delay(workspaces.map((w) => ({ ...w }))),
      create: (name) => {
        const wsName = name || '새 워크스페이스'
        const w = {
          id: ++wsSeq,
          name: wsName,
          keywords: [],
          interval_minutes: 60,
          reference_sources: [],
          default_edit_options: {
            share_to_feed: true,
            fill_color: '#000000',
            crop: { x: 0, y: 0, w: 1, h: 1 },
            watermark: { on: true, kind: 'text', text: wsName, position: 'bottom-center', px: 0.5, py: 0.92 },
            texts: [],
            images: []
          },
          created_at: '오늘'
        }
        workspaces.push(w)
        return delay({ ...w })
      },
      update: (id, f) => { const w = workspaces.find((x) => x.id === id); Object.assign(w, f); return delay({ ...w }) },
      remove: (id) => { const i = workspaces.findIndex((x) => x.id === id); if (i >= 0) workspaces.splice(i, 1); return delay(true) }
    },
    accounts: {
      list: (wsId) => delay(accounts.filter((a) => a.workspace_id === wsId).map((a) => ({
        ...a,
        ready: !!(a.ig_user_id && a.hasToken)
      }))),
      create: (wsId, d) => {
        if (!d.token) return delay({ ok: false, error: '액세스 토큰을 입력해 주세요.' })
        if (!d.ig_user_id && !d.page_id) {
          return delay({ ok: false, error: '인스타그램 사용자 ID 또는 페이지 ID가 필요해요.' })
        }
        const a = {
          id: ++accSeq,
          workspace_id: wsId,
          label: d.label,
          ig_user_id: d.ig_user_id || '17841400000000000',
          page_id: d.page_id || '',
          hasToken: true,
          ready: true
        }
        accounts.push(a)
        return delay({ ok: true, account: { ...a }, message: '(미리보기) 계정 연결 확인' })
      },
      update: (id, d) => {
        const a = accounts.find((x) => x.id === id)
        if (!a) return delay({ ok: false, error: '계정 없음' })
        Object.assign(a, {
          label: d.label ?? a.label,
          ig_user_id: d.ig_user_id || a.ig_user_id,
          page_id: d.page_id ?? a.page_id,
          hasToken: d.token ? true : a.hasToken,
          ready: true
        })
        return delay({ ok: true, account: { ...a }, message: '(미리보기) 계정 수정 완료' })
      },
      setToken: (id, t) => { const a = accounts.find((x) => x.id === id); if (a) { a.hasToken = !!t; a.ready = !!(a.ig_user_id && a.hasToken) } return delay({ ok: true }) },
      test: (payload) => delay({
        ok: true,
        message: '(미리보기) 인스타그램 계정 연결이 확인됐어요.',
        ig_user_id: payload?.ig_user_id || '17841400000000000',
        page_id: payload?.page_id || '',
        username: 'preview_account'
      }),
      validate: (data) => delay({ ok: !!(data?.token && (data?.ig_user_id || data?.page_id)), errors: [], value: data }),
      remove: (id) => { const i = accounts.findIndex((x) => x.id === id); if (i >= 0) accounts.splice(i, 1); return delay(true) }
    },
    references: {
      list: (wsId) => delay(references.filter((r) => r.workspace_id === wsId).map((r) => ({ ...r }))),
      create: (wsId, d) => {
        const r = {
          id: ++refSeq,
          workspace_id: wsId,
          title: d.title || '제목 없음',
          url: d.url || '',
          source: d.source || 'manual',
          thumbnail_url: d.thumbnail_url || '',
          author: d.author || '',
          keyword: d.keyword || '',
          score: d.score ?? null,
          notes: d.notes || '',
          status: d.status || 'new',
          created_at: '방금'
        }
        references.unshift(r)
        return delay({ ...r })
      },
      update: (id, f) => {
        const r = references.find((x) => x.id === id)
        if (r) Object.assign(r, f)
        return delay(r ? { ...r } : null)
      },
      remove: (id) => {
        const i = references.findIndex((x) => x.id === id)
        if (i >= 0) references.splice(i, 1)
        return delay(true)
      },
      addSource: (wsId, input, platform) => {
        const w = workspaces.find((x) => x.id === wsId)
        if (!w) return delay({ ok: false, error: '워크스페이스 없음' })
        const handle = String(input || '').replace(/^@/, '').split('/').filter(Boolean).pop() || 'channel'
        const id = `${platform || 'youtube'}:${handle.toLowerCase()}`
        w.reference_sources = w.reference_sources || []
        if (w.reference_sources.some((s) => s.id === id)) {
          return delay({ ok: true, already: true, sources: w.reference_sources, workspace: { ...w } })
        }
        const src = {
          id,
          platform: platform || 'youtube',
          handle,
          label: `@${handle}`,
          url:
            platform === 'instagram'
              ? `https://www.instagram.com/${handle}/`
              : `https://www.youtube.com/@${handle}/videos`
        }
        w.reference_sources = [src, ...w.reference_sources]
        return delay({ ok: true, already: false, added: src, sources: w.reference_sources, workspace: { ...w } })
      },
      removeSource: (wsId, sourceId) => {
        const w = workspaces.find((x) => x.id === wsId)
        if (!w) return delay({ ok: false, error: '워크스페이스 없음' })
        w.reference_sources = (w.reference_sources || []).filter((s) => s.id !== sourceId)
        return delay({ ok: true, sources: w.reference_sources, workspace: { ...w } })
      },
      collect: (wsId, _sourceId, limit = 100) => {
        const w = workspaces.find((x) => x.id === wsId)
        const src = (w?.reference_sources || [])[0]
        if (!src) return delay({ ok: false, error: '계정이 없어요' })
        const r = {
          id: ++refSeq,
          workspace_id: wsId,
          title: `(미리보기) ${src.label} 새 영상`,
          url: src.platform === 'youtube'
            ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            : 'https://www.instagram.com/reel/mock/',
          source: src.platform,
          thumbnail_url: '',
          author: src.label,
          keyword: src.handle,
          source_account: src.id,
          score: null,
          notes: '',
          status: 'new',
          created_at: '방금'
        }
        references.unshift(r)
        return delay({ ok: true, added: 1, scanned: 1, sourceCount: 1, limit: limit, errors: [] })
      }
    },
    tools: {
      status: () => delay({
        ytdlp: { ok: true, path: '/mock/yt-dlp', version: '(미리보기)' },
        ffmpeg: { ok: true, path: '/mock/ffmpeg', version: '(미리보기)' },
        hint: null
      })
    },
    jobs: {
      list: (wsId) => delay(jobs.filter((j) => j.workspace_id === wsId).map(enrich)),
      get: (id) => delay(enrich(jobs.find((j) => j.id === id))),
      active: (wsId) => delay(enrich(jobs.find((j) => j.workspace_id === wsId && activeStages.has(j.stage)))),
      create: (wsId, referenceId) => {
        if (jobs.some((j) => j.workspace_id === wsId && activeStages.has(j.stage))) {
          return delay({ ok: false, error: '이미 진행 중인 제작이 있어요. 먼저 마무리하거나 취소해 주세요.' })
        }
        const ref = references.find((r) => r.id === referenceId)
        if (!ref) return delay({ ok: false, error: '레퍼런스를 찾을 수 없습니다.' })
        ref.status = 'in_pipeline'
        const job = {
          id: ++jobSeq,
          workspace_id: wsId,
          reference_id: referenceId,
          account_id: null,
          stage: 'select',
          edit_options: {},
          caption: '',
          progress: 0,
          message: '레퍼런스를 확인한 뒤 편집으로 넘어가세요.',
          source_path: '',
          output_path: '',
          container_id: '',
          published_id: '',
          error: ''
        }
        jobs.unshift(job)
        return delay(enrich(job))
      },
      update: (id, f) => {
        const j = jobs.find((x) => x.id === id)
        if (j) Object.assign(j, f)
        return delay(emit(j))
      },
      prepareSource: async (id) => {
        const j = jobs.find((x) => x.id === id)
        if (!j) return { ok: false, error: '작업을 찾을 수 없어요.' }
        j.source_path = '/mock/source.mp4'
        j.message = '원본을 불러왔어요. 영역을 고른 뒤 편집을 시작해 주세요.'
        j.progress = 100
        emit(j)
        return { ok: true, job: enrich(j) }
      },
      cancel: (id) => {
        const j = jobs.find((x) => x.id === id)
        if (j) {
          j.stage = 'cancelled'
          j.message = '작업을 취소했어요.'
          j.error = 'cancelled'
          const ref = references.find((r) => r.id === j.reference_id)
          if (ref) ref.status = 'new'
        }
        return delay(enrich(j))
      },
      startEdit: async (id, editOptions) => {
        const j = jobs.find((x) => x.id === id)
        if (!j) return { ok: false, error: '작업을 찾을 수 없어요.' }
        j.edit_options = { ...(editOptions || {}) }
        j.stage = 'edit'
        j.error = ''
        const wm = !!editOptions?.watermark_on
        j.activity_log = [
          { id: 'tools', label: '편집 도구 확인 (yt-dlp · ffmpeg)', status: 'pending', detail: '' },
          { id: 'download', label: '원본 영상 내려받기', status: 'pending', detail: '' },
          { id: 'convert', label: '세로(9:16) 비율로 변환', status: 'pending', detail: '' },
          { id: 'watermark', label: '워터마크 넣기', status: wm ? 'pending' : 'skipped', detail: wm ? '' : '사용 안 함' },
          { id: 'save', label: '릴스용 파일 저장', status: 'pending', detail: '' }
        ]
        const mark = (taskId, status, detail) => {
          j.activity_log = j.activity_log.map((t) => (t.id === taskId ? { ...t, status, detail: detail ?? t.detail } : t))
        }
        const steps = [
          [8, '편집 도구를 확인하고 있어요…', () => { mark('tools', 'running', '확인 중') }],
          [12, '편집 도구가 준비됐어요.', () => { mark('tools', 'done', '준비됨') }],
          [25, '원본 영상을 내려받고 있어요…', () => { mark('download', 'running', '35% 완료') }],
          [48, '다운로드가 끝났어요. 편집을 준비해요…', () => { mark('download', 'done', '원본 저장 완료') }],
          [70, '세로 비율로 바꾸고 있어요…', () => {
            mark('convert', 'running', '변환 중')
            if (wm) mark('watermark', 'running', editOptions?.watermark_text || 'Studio')
          }],
          [100, '편집이 끝났어요. 미리보기 후 게시해 주세요.', () => {
            mark('convert', 'done', '9:16 변환 완료')
            if (wm) mark('watermark', 'done', editOptions?.watermark_text || 'Studio')
            mark('save', 'done', 'output.mp4')
          }]
        ]
        for (const [p, m, fn] of steps) {
          fn()
          j.progress = p
          j.message = m
          emit(j)
          await delay(null, 400)
        }
        j.stage = 'confirm'
        j.output_path = '/mock/output.mp4'
        emit(j)
        return { ok: true, job: enrich(j) }
      },
      publish: async (id, payload) => {
        const j = jobs.find((x) => x.id === id)
        if (!j) return { ok: false, error: '작업을 찾을 수 없어요.' }
        j.stage = 'uploading'
        j.account_id = payload?.accountId
        j.caption = payload?.caption || ''
        j.activity_log = [
          { id: 'prepare', label: '인스타그램 업로드 준비', status: 'pending', detail: '' },
          { id: 'transfer', label: '편집된 영상 파일 전송', status: 'pending', detail: '' },
          { id: 'process', label: '인스타그램 영상 처리 대기', status: 'pending', detail: '' },
          { id: 'publish', label: '릴스 게시', status: 'pending', detail: '' }
        ]
        const mark = (taskId, status, detail) => {
          j.activity_log = j.activity_log.map((t) => (t.id === taskId ? { ...t, status, detail: detail ?? t.detail } : t))
        }
        const steps = [
          [20, '인스타그램에 올릴 준비를 하고 있어요…', () => mark('prepare', 'running', '세션 생성')],
          [25, '영상을 보내고 있어요…', () => { mark('prepare', 'done'); mark('transfer', 'running', '전송 중') }],
          [60, '인스타그램이 영상을 처리하고 있어요…', () => { mark('transfer', 'done'); mark('process', 'running', 'IN_PROGRESS') }],
          [100, '릴스 게시를 완료했어요.', () => {
            mark('process', 'done', 'FINISHED')
            mark('publish', 'done', '게시 완료')
          }]
        ]
        for (const [p, m, fn] of steps) {
          fn()
          j.progress = p
          j.message = m
          emit(j)
          await delay(null, 350)
        }
        j.stage = 'done'
        j.published_id = 'mock_media_' + j.id
        const ref = references.find((r) => r.id === j.reference_id)
        if (ref) ref.status = 'published'
        emit(j)
        return { ok: true, job: enrich(j) }
      },
      onProgress: (cb) => {
        progressListeners.add(cb)
        return () => progressListeners.delete(cb)
      }
    },
    secrets: {
      status: () => delay({ ...secrets }),
      set: (k, v) => { secrets[k] = !!v; return delay({ ok: true }) },
      clear: (k) => { secrets[k] = false; return delay({ ok: true }) }
    },
    test: {
      claude: () => delay({ ok: true, message: '(미리보기) Claude 연결 성공' }),
      youtube: () => delay({ ok: false, message: '(미리보기) 키를 저장하면 확인됩니다' })
    },
    presets: {
      list: (wsId) => delay(presets.filter((p) => p.workspace_id === wsId).map((p) => ({ ...p, options: { ...p.options } }))),
      save: (wsId, name, options) => {
        const p = { id: ++presetSeq, workspace_id: wsId, name: name || '새 프리셋', options: { ...(options || {}) } }
        presets.unshift(p)
        return delay({ ...p })
      },
      remove: (id) => {
        const i = presets.findIndex((p) => p.id === id)
        if (i >= 0) presets.splice(i, 1)
        return delay(true)
      }
    },
    assets: {
      pickWatermark: () => delay({
        path: '/mock/wm.png',
        name: 'logo.png',
        filename: 'logo.png',
        url: 'https://placehold.co/200x80/png?text=IMG'
      })
    },
    fonts: {
      list: () => delay([]),
      register: () => delay(null),
      remove: () => delay(true)
    },
    theme: { get: () => delay('light') }
  }
}
