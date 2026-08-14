import { useLedger } from '../state/useLedger'
import { money, dateStr } from '../lib/ledger'

interface Props {
  limit?: number
}

const ICN: Record<string, string> = { 吃饭: '🍚', 咖啡: '☕', 交通: '🚌', 购物: '🛍️', 娱乐: '🎮', 居住: '🏠', 医疗: '💊', 人情: '🎁', 其他: '📝', 副业: '💡', 红包: '🧧', 报销: '🧾', 理财: '📈' }

export default function RecList({ limit }: Props) {
  const records = useLedger((s) => s.records)
  const del = useLedger((s) => s.del)
  const rows = [...records].sort((a, b) => b.ts - a.ts)
  const shown = limit ? rows.slice(0, limit) : rows
  if (!shown.length) return <div className="empty">还没有记账，去「记账」记一笔吧 🌿</div>
  return (
    <div className="recList">
      {shown.map((r) => (
        <div className="recItem" key={r.id}>
          <div className={'ic' + (r.type === 'income' ? ' income' : '')}>{ICN[r.cat] || '📝'}</div>
          <div className="tx">
            <div className="t1">{r.cat}{r.note ? ' · ' + r.note : ''}</div>
            <div className="t2">{dateStr(r.ts)}{r.mood ? ' ' + r.mood : ''}{r.bucket ? ' · ' + r.bucket : ''}</div>
          </div>
          <div className={'am ' + (r.type === 'income' ? 'inc' : 'exp')}>
            {r.type === 'income' ? '+' : '-'}
            {money(r.amount)}
          </div>
          <button className="del" title="删除" onClick={() => del(r.id!)}>×</button>
        </div>
      ))}
    </div>
  )
}
