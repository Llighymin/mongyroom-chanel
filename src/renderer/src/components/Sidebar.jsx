import React from 'react'
import { Icon } from './ui.jsx'

export default function Sidebar({
  workspaces, activeId, view, onSelectWorkspace, onOpenSettings,
  onCreateWorkspace, theme, onToggleTheme
}) {
  return (
    <aside className="drag w-[260px] flex-none h-full flex flex-col border-r border-[var(--line)] bg-[var(--surface)]">
      {/* 브랜드 */}
      <div className="px-5 pt-10 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[9px] bg-[var(--accent)] grid place-items-center text-white">
            <Icon name="spark" className="w-[18px] h-[18px]" />
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-extrabold tracking-tight text-[var(--ink)]">영상 자동화</div>
            <div className="text-[11px] text-[var(--muted)] font-medium">스튜디오</div>
          </div>
        </div>
      </div>

      {/* 워크스페이스 목록 */}
      <div className="px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--muted)]">워크스페이스</span>
          <button
            onClick={onCreateWorkspace}
            className="no-drag w-6 h-6 grid place-items-center rounded-md text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition"
            title="새 워크스페이스"
          >
            <Icon name="plus" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {workspaces.length === 0 && (
            <p className="px-2 py-3 text-[13px] text-[var(--muted)] leading-relaxed">
              아직 워크스페이스가 없어요.<br />+ 를 눌러 첫 채널을 만들어 보세요.
            </p>
          )}
          {workspaces.map((w) => {
            const active = view === 'workspace' && w.id === activeId
            return (
              <button
                key={w.id}
                onClick={() => onSelectWorkspace(w.id)}
                className={`no-drag group flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left transition ${
                  active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--ink-soft)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Icon name="layers" className="w-[18px] h-[18px] flex-none" />
                <span className="text-[13.5px] font-medium truncate flex-1">{w.name}</span>
                {w.reference_sources?.length > 0 && (
                  <span className={`text-[11px] font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>{w.reference_sources.length}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 하단: 설정 + 테마 */}
      <div className="p-3 border-t border-[var(--line)] flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className={`no-drag flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left transition ${
            view === 'settings' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--ink-soft)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Icon name="settings" className="w-[18px] h-[18px]" />
          <span className="text-[13.5px] font-medium">앱 설정 · API 키</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="no-drag flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[var(--ink-soft)] hover:bg-[var(--surface-2)] transition"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-[18px] h-[18px]" />
          <span className="text-[13.5px] font-medium">{theme === 'dark' ? '라이트 모드' : '다크 모드'}</span>
        </button>
      </div>
    </aside>
  )
}
