import { useLedger } from '../state/useLedger'
import { memorySummary, money, ym } from '../lib/ledger'

export default function MemoryCard() {
  const records = useLedger((s) => s.records)
  const m = ym(new Date())
  const s = memorySummary(records, m)
  if (!s.has) {
    return (
      <div className="memCard">
        <div className="lines">
          <div className="empty">这个月还没怎么记账，记一笔就有回忆啦 🌿</div>
        </div>
      </div>
    )
  }
  const lines: JSX.Element[] = []
  lines.push(
    <span key="a">
      这个月你记了 <b>{s.count}</b> 笔支出，覆盖 <b>{s.days}</b> 天，共 <b>{money(s.total)}</b>。
    </span>,
  )
  if (s.topMood) lines.push(<span key="b">最常有的心情是 {s.topMood}，辛苦了，钱花在值得的地方就好。</span>)
  if (s.best)
    lines.push(
      <span key="c">
        最大一笔是「{s.best.cat}
        {s.best.note ? `（${s.best.note}）` : ''}」 {money(s.best.amount)}。
      </span>,
    )
  lines.push(
    <span key="d">
      {s.net >= 0
        ? `这个月还结余 ${money(s.net)}，离自由近了一点 🌿`
        : `这个月小超支 ${money(-s.net)}，下个月我们一起匀回来。`}
    </span>,
  )
  return (
      <div className="memCard">
        <div className="lines">
          {lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{l}</div>
          ))}
        </div>
      </div>
  )
}
