import { useEffect, useState } from 'react'
import { useLedger } from '../state/useLedger'
import { useUI } from '../state/useUI'
import { CATS_E, MOODS, money } from '../lib/ledger'
import { hasTauri } from '../api/db'

export default function QuickAddModal() {
  const open = useUI((s) => s.quickAddOpen)
  const close = useUI((s) => s.closeQuickAdd)
  const add = useLedger((s) => s.add)

  const [cat, setCat] = useState(CATS_E[0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')
  const [err, setErr] = useState('')

  // 接线：Tauri 事件 + 浏览器回退热键
  useEffect(() => {
    let unlisten: (() => void) | undefined
    if (hasTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) =>
        listen('quick-add', () => useUI.getState().openQuickAdd()),
      ).then((fn) => (unlisten = fn as () => void))
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault()
        useUI.getState().openQuickAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (open) {
      setAmount('')
      setNote('')
      setMood('')
      setErr('')
    }
  }, [open])

  if (!open) return null

  const save = async () => {
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!(amt > 0)) {
      setErr('先填个金额')
      return
    }
    await add({ type: 'expense', cat, amount: amt, bucket: '必要', mood, note: note.trim(), ts: Date.now() })
    close()
  }

  return (
    <div className="mask" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>快速记一笔</h3>
        <div className="form">
          <input
            className="input amountBig"
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <div className="chips">
            {CATS_E.map((c) => (
              <button key={c} className={'chip' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <input className="input" placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="chips">
            {MOODS.map((m) => (
              <button key={m} className={'chip' + (m === mood ? ' on' : '')} onClick={() => setMood(mood === m ? '' : m)}>
                {m}
              </button>
            ))}
            <button className={'chip' + (mood === '' ? ' on' : '')} onClick={() => setMood('')}>不加</button>
          </div>
          {err && <div className="muted" style={{ color: 'var(--red)' }}>{err}</div>}
          <div className="row">
            <button className="btn ghost" onClick={close}>取消</button>
            <button className="btn primary" onClick={save}>记 {amount ? money(parseFloat(amount)) : ''}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
