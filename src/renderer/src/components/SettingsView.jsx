import React, { useEffect, useState } from 'react'
import { Card, Field, TextInput, Button, Icon, Pill, useToast } from './ui.jsx'

export default function SettingsView() {
  const toast = useToast()
  const [status, setStatus] = useState({})

  const load = async () => setStatus(await window.api.secrets.status())
  useEffect(() => { load() }, [])

  return (
    <div className="fade-up max-w-[760px] mx-auto px-8 py-8 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--ink)]">앱 설정</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1.5">
          아래 키는 모든 워크스페이스가 함께 사용합니다. 맥 키체인에 암호화되어 저장되며, 화면으로 다시 표시되지 않습니다.
        </p>
      </header>

      <Card className="p-6 flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="spark" className="w-[18px] h-[18px] text-[var(--accent)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">AI 엔진</h2>
        </div>
        <KeyRow
          k="claude_api_key" name="Claude API 키" saved={status.claude_api_key}
          desc="레퍼런스 추천·점수화, 댓글 문구 추천에 사용됩니다."
          placeholder="sk-ant-..." canTest test={() => window.api.test.claude()}
          onChanged={load}
        />
      </Card>

      <Card className="p-6 flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="key" className="w-[18px] h-[18px] text-[var(--collect)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">영상 검색</h2>
        </div>
        <KeyRow
          k="youtube_api_key" name="YouTube Data API 키" saved={status.youtube_api_key}
          desc="키워드로 유튜브 영상을 검색합니다. Google Cloud에서 발급합니다."
          placeholder="AIza..." canTest test={() => window.api.test.youtube()}
          onChanged={load}
        />
      </Card>

      <Card className="p-6 flex flex-col gap-1">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="user" className="w-[18px] h-[18px] text-[var(--upload)]" />
          <h2 className="text-[16px] font-bold text-[var(--ink)]">메타(인스타그램) 앱</h2>
        </div>
        <p className="text-[12px] text-[var(--muted)] mb-3 leading-relaxed">
          릴스 업로드 시 액세스 토큰을 장기 토큰으로 바꾸는 데 사용합니다.
          계정별 토큰·IG User ID·페이지 ID는 각 워크스페이스의 「릴스 업로드 계정」에서 등록하세요.
        </p>
        <KeyRow k="meta_app_id" name="메타 앱 ID" saved={status.meta_app_id} placeholder="1234567890" onChanged={load} />
        <div className="h-4" />
        <KeyRow k="meta_app_secret" name="메타 앱 시크릿" saved={status.meta_app_secret} placeholder="••••••••" onChanged={load} />
      </Card>
    </div>
  )
}

function KeyRow({ k, name, desc, saved, placeholder, canTest, test, onChanged }) {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const save = async () => {
    if (!value.trim()) return toast('값을 입력해 주세요.', 'crit')
    await window.api.secrets.set(k, value.trim())
    setValue('')
    setResult(null)
    onChanged()
    toast(`${name} 저장 완료`)
  }

  const clear = async () => {
    if (!window.confirm(`${name}를 삭제할까요?`)) return
    await window.api.secrets.clear(k)
    setResult(null)
    onChanged()
    toast(`${name} 삭제됨`)
  }

  const runTest = async () => {
    setBusy(true); setResult(null)
    const r = await test()
    setBusy(false)
    setResult(r)
  }

  return (
    <Field label={<span>{name}</span>} hint={desc}>
      <div className="flex items-center gap-2 mb-1.5">
        {saved
          ? <Pill tone="good"><Icon name="check" className="w-3.5 h-3.5" /> 저장됨</Pill>
          : <Pill tone="warn">미설정</Pill>}
      </div>
      <div className="flex gap-2">
        <TextInput
          type="password" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={saved ? '새 값으로 바꾸려면 입력' : placeholder}
        />
        <Button onClick={save} size="md" className="flex-none">저장</Button>
        {saved && <Button onClick={clear} variant="soft" size="md" className="flex-none">삭제</Button>}
      </div>

      {canTest && (
        <div className="flex items-center gap-3 mt-2.5">
          <Button variant="ghost" size="sm" onClick={runTest} disabled={busy || !saved}>
            {busy ? '확인 중…' : '연결 테스트'}
          </Button>
          {result && (
            <span className={`text-[13px] font-medium inline-flex items-center gap-1.5 ${result.ok ? 'text-[var(--good)]' : 'text-[var(--crit)]'}`}>
              <Icon name={result.ok ? 'check' : 'x'} className="w-4 h-4" />
              {result.message}
            </span>
          )}
        </div>
      )}
    </Field>
  )
}
