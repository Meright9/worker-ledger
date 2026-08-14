import { useRef, useState } from 'react'
import { useSettings } from '../state/useSettings'
import { useLedger } from '../state/useLedger'
import { db } from '../api/db'
import { money } from '../lib/ledger'

const VERSION = '2.0.0'

export default function MePage() {
  const budgetTotal = useSettings((s) => s.budgetTotal)
  const setBudgetTotal = useSettings((s) => s.setBudgetTotal)
  const init = useLedger((s) => s.init)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2200)
  }

  const doExport = async () => {
    const json = await db.exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ledger-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    flash('已导出备份')
  }
  const doImport = async (file: File) => {
    try {
      const text = await file.text()
      await db.importData(text)
      await init()
      flash('导入成功')
    } catch {
      flash('导入失败，文件格式不对？')
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="section-title">
          <h3>月度预算</h3>
        </div>
        <div className="setRow">
          <span>本月总预算</span>
          <input
            className="input"
            style={{ width: 160, textAlign: 'right' }}
            inputMode="decimal"
            placeholder="如 4000"
            value={budgetTotal || ''}
            onChange={(e) => setBudgetTotal(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="muted">当前：{budgetTotal > 0 ? money(budgetTotal) + ' / 月' : '未设置（首页「今日额度」会显示 —）'}</div>
      </div>

      <div className="card">
        <div className="section-title">
          <h3>数据</h3>
        </div>
        <div className="setRow">
          <span>导出 / 导入备份</span>
          <div className="row" style={{ flex: '0 0 auto', gap: 8 }}>
            <button className="btn" onClick={doExport}>导出</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>导入</button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
        {msg && <div className="muted" style={{ color: 'var(--mint-d)', marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="card">
        <div className="section-title">
          <h3>关于</h3>
        </div>
        <div className="setRow">
          <span>打工人小账本</span>
          <span className="muted">v{VERSION}</span>
        </div>
        <div className="muted" style={{ lineHeight: 1.7 }}>
          宏大自然风光里，把每天的开销记成一座座小山。React + SQLite 重制版，数据存在本机 ledger.db。
        </div>
      </div>
    </div>
  )
}
