import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import WorkspaceView from './components/WorkspaceView.jsx'
import SettingsView from './components/SettingsView.jsx'
import { ToastProvider, Icon, Button } from './components/ui.jsx'
import { setCustomFonts } from '@shared/editOptions.js'

function CustomFontFaces() {
  const [css, setCss] = useState('')
  useEffect(() => {
    const load = async () => {
      if (!window.api?.fonts?.list) return
      const list = await window.api.fonts.list()
      setCustomFonts(list || [])
      setCss(
        (list || [])
          .map((f) => `@font-face{font-family:"${f.cssFamily}";src:url("${f.url}");font-display:swap;}`)
          .join('\n')
      )
    }
    load()
    window.addEventListener('studio-fonts-changed', load)
    return () => window.removeEventListener('studio-fonts-changed', load)
  }, [])
  if (!css) return null
  return <style>{css}</style>
}

function Shell() {
  const [workspaces, setWorkspaces] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('empty') // 'empty' | 'workspace' | 'settings'
  const [theme, setTheme] = useState('light')
  const [loaded, setLoaded] = useState(false)

  // 초기 로드
  useEffect(() => {
    ;(async () => {
      const savedTheme = localStorage.getItem('theme') || (await window.api.theme.get())
      applyTheme(savedTheme)
      const ws = await window.api.workspaces.list()
      setWorkspaces(ws)
      if (ws.length) { setActiveId(ws[0].id); setView('workspace') }
      setLoaded(true)
    })()
  }, [])

  const applyTheme = (t) => {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('theme', t)
  }
  const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark')

  const createWorkspace = async () => {
    const ws = await window.api.workspaces.create('새 워크스페이스')
    setWorkspaces((s) => [...s, ws])
    setActiveId(ws.id)
    setView('workspace')
  }

  const onUpdated = (updated) => {
    setWorkspaces((s) => s.map((w) => (w.id === updated.id ? updated : w)))
  }
  const onDeleted = (id) => {
    const next = workspaces.filter((w) => w.id !== id)
    setWorkspaces(next)
    if (next.length) { setActiveId(next[0].id); setView('workspace') }
    else { setActiveId(null); setView('empty') }
  }

  const active = workspaces.find((w) => w.id === activeId)

  return (
    <div className="h-full flex bg-[var(--paper)]">
      <Sidebar
        workspaces={workspaces}
        activeId={activeId}
        view={view}
        onSelectWorkspace={(id) => { setActiveId(id); setView('workspace') }}
        onOpenSettings={() => setView('settings')}
        onCreateWorkspace={createWorkspace}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 h-full overflow-y-auto">
        {/* 드래그 가능한 상단 여백 (신호등 버튼 영역 확보) */}
        <div className="drag h-9 w-full" />
        {loaded && view === 'settings' && <SettingsView />}
        {loaded && view === 'workspace' && active && (
          <WorkspaceView key={active.id} workspace={active} onUpdated={onUpdated} onDeleted={onDeleted} />
        )}
        {loaded && view === 'empty' && <Welcome onCreate={createWorkspace} />}
      </main>
    </div>
  )
}

function Welcome({ onCreate }) {
  return (
    <div className="fade-up h-[calc(100%-2.25rem)] grid place-items-center px-8">
      <div className="text-center max-w-[420px]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] grid place-items-center text-white mx-auto mb-6 shadow-soft">
          <Icon name="spark" className="w-8 h-8" />
        </div>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">영상 자동화 스튜디오</h1>
        <p className="text-[14px] text-[var(--muted)] mt-2.5 leading-relaxed">
          채널(워크스페이스)을 하나 만들고 수집 키워드와 릴스 계정을 연결하면,<br />
          레퍼런스 수집부터 업로드까지 자동으로 이어집니다.
        </p>
        <div className="mt-7">
          <Button size="lg" onClick={onCreate}>
            <Icon name="plus" className="w-5 h-5" /> 첫 워크스페이스 만들기
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <CustomFontFaces />
      <Shell />
    </ToastProvider>
  )
}
