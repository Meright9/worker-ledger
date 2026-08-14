import { useState } from 'react'
import { useLedger } from '../state/useLedger'
import { CATS_E, CATS_I, BUCKETS, MOODS, parseMulti, money, emptyPayload } from '../lib/ledger'
import type { RecPayload, TType } from '../api/db'

interface Props {
  onDone?: () => void
}

export default function AddForm({ onDone }: Props) {
  const add = useLedger((s) => s.add)
  const addMany = useLedger((s) => s.addMany)
  const accounts = useLedger((s) => s.accounts)

  const [mode, setMode] = useState<'one' | 'multi'>('one')
  const [type, setType] = useState<TType>('expense')
  const [cat, setCat] = useState(CATS_E[0])
  const [subcat, setSubcat] = useState('')
  const [amount, setAmount] = useState('')
  const [bucket, setBucket] = useState('必要')
  const [mood, setMood] = useState('')
  const [note, setNote] = useState('')
  const [account, setAccount] = useState('')
  const [multi, setMulti] = useState('')
  const [preview, setPreview] = useState<RecPayload[]>([])
  const [toast, setToast] = useState('')

  const list = type === 'expense' ? CATS_E : CATS_I
  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2000)
  }
  const reset = () => {
    setCat(CATS_E[0])
    setSubcat('')
    setAmount('')
    setBucket('必要')
    setMood('')
    setNote('')
    setAccount('')
    setMulti('')
    setPreview([])
  }

  const saveOne = async () => {
    const amt = Math.round(parseFloat(amount) * 100) / 100
    if (!(amt > 0)) return flash('先填个金额吧')
    await add({
      type,
      cat,
      subcat,
      amount: amt,
      bucket: type === 'expense' ? bucket : '储蓄',
      mood,
      note: note.trim(),
      account: account || undefined,
      ts: Date.now(),
    })
    flash('记好啦 🌿')
    reset()
    onDone?.()
  }

  const previewMulti = () => {
    setPreview(parseMulti(multi))
  }
  const saveMulti = async () => {
    const ps = parseMulti(multi)
    if (!ps.length) return flash('没解析出任何一笔，检查一下格式？')
    await addMany(ps)
    flash(`已记 ${ps.length} 笔 ✓`)
    setMulti('')
    setPreview([])
    onDone?.()
  }

  return (
    <div className="form">
      {toast && <div className="toast on" style={{ position: 'static', transform: 'none', opacity: 0.96, marginBottom: 4 }}>{toast}</div>}
      <div className="seg">
        <button className={type === 'expense' ? 'on' : ''} onClick={() => { setType('expense'); setCat(CATS_E[0]) }}>
          支出
        </button>
        <button className={type === 'income' ? 'on income' : ''} onClick={() => { setType('income'); setCat(CATS_I[0]) }}>
          收入
        </button>
      </div>

      <div className="seg">
        <button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>单笔</button>
        <button className={mode === 'multi' ? 'on' : ''} onClick={() => setMode('multi')}>一键多笔</button>
      </div>

      {mode === 'one' ? (
        <>
          <div className="field">
            <label>分类</label>
            <div className="chips">
              {list.map((c) => (
                <button key={c} className={'chip' + (c === cat ? ' on' + (type === 'income' ? ' income' : '') : '')} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>金额（元）</label>
            <input
              className="input amountBig"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <div className="field">
            <label>二级分类 / 备注（可选）</label>
            <input className="input" placeholder="如：公司楼下便当" value={subcat} onChange={(e) => setSubcat(e.target.value)} />
          </div>
          {type === 'expense' && (
            <div className="field">
              <label>把钱归到哪个桶</label>
              <div className="chips">
                {BUCKETS.map((b) => (
                  <button key={b} className={'chip' + (b === bucket ? ' on' : '')} onClick={() => setBucket(b)}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label>此刻的心情</label>
            <div className="chips">
              {MOODS.map((m) => (
                <button key={m} className={'chip' + (m === mood ? ' on' : '')} onClick={() => setMood(mood === m ? '' : m)}>
                  {m}
                </button>
              ))}
              <button className={'chip' + (mood === '' ? ' on' : '')} onClick={() => setMood('')}>不加</button>
            </div>
          </div>
          <div className="field">
            <label>碎碎念（可选）</label>
            <textarea className="input" placeholder="记一笔，也记一下今天" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {accounts.length > 0 && (
            <div className="field">
              <label>账户（可选）</label>
              <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">不指定账户</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn primary block" onClick={saveOne}>记这一笔</button>
        </>
      ) : (
        <>
          <div className="field">
            <label>每行一笔，金额跟在后面：午饭 32 / 地铁 6 回家 / 42</label>
            <textarea className="input" placeholder={'午饭 32\n地铁 6 回家\n奶茶 18'} value={multi} onChange={(e) => setMulti(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn ghost" onClick={previewMulti}>预览</button>
            <button className="btn primary" onClick={saveMulti}>全部记上</button>
          </div>
          {preview.length > 0 && (
            <div className="multiPreview">
              {preview.map((r, i) => (
                <div className="multiItem" key={i}>
                  <span>{r.cat}{r.note ? ' · ' + r.note : ''}</span>
                  <span className="am">-{money(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
