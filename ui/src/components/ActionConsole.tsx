import { useState, useRef, useEffect } from 'react'

interface Props {
  title: string
  description: string
  endpoint: string
  params?: Record<string, string>
  children?: React.ReactNode
}

export function ActionConsole({ title, description, endpoint, params = {}, children }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  function start() {
    setLines([]); setExitCode(null); setRunning(true)
    const qs = new URLSearchParams(params).toString()
    const es = new EventSource(qs ? `${endpoint}?${qs}` : endpoint)
    esRef.current = es
    es.onmessage = e => { const { line } = JSON.parse(e.data); setLines(p => [...p, line]) }
    es.addEventListener('done', e => {
      setExitCode(JSON.parse((e as MessageEvent).data).code)
      setRunning(false); es.close()
    })
    es.onerror = () => { setRunning(false); es.close() }
  }

  function stop() { esRef.current?.close(); setRunning(false) }

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <div className="font-semibold text-stone-800 text-sm">{title}</div>
          <div className="text-xs text-stone-400">{description}</div>
        </div>
        {running
          ? <button onClick={stop} className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Stop</button>
          : <button onClick={start} className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded hover:bg-stone-700">Run</button>
        }
      </div>
      {children && <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">{children}</div>}
      <div className="bg-stone-950 font-mono text-xs text-stone-300 h-40 overflow-y-auto p-3">
        {lines.length === 0 && !running && <span className="text-stone-600">Ready — press Run</span>}
        {lines.map((l, i) => <div key={i}>{l}</div>)}
        {exitCode !== null && (
          <div className={`mt-2 ${exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Exited {exitCode}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
