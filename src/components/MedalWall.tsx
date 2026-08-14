import { useLedger } from '../state/useLedger'
import { streakDays } from '../lib/ledger'

const TIERS = [
  { d: 3, e: '🌱', t: '破土' },
  { d: 7, e: '🌿', t: '一周' },
  { d: 21, e: '🌳', t: '21天' },
  { d: 30, e: '⛰️', t: '满月' },
  { d: 100, e: '🏔️', t: '百天' },
  { d: 365, e: '🌅', t: '周年' },
]

export default function MedalWall() {
  const records = useLedger((s) => s.records)
  const st = streakDays(records)
  const next = TIERS.find((m) => st < m.d)
  return (
    <div className="card">
      <div className="section-title">
        <h3>连续记账勋章墙</h3>
      </div>
      <div className="medals" style={{ marginTop: 10 }}>
        {TIERS.map((m) => {
          const lit = st >= m.d
          return (
            <div key={m.d} className={'medal' + (lit ? ' on' : '')}>
              <div className="me">{lit ? m.e : '🔒'}</div>
              <div className="mt">{m.t}</div>
              <div className="md">{m.d} 天</div>
            </div>
          )
        })}
      </div>
      <div className="medalHint">
        {next
          ? `已连续记账 ${st} 天 · 再坚持 ${next.d - st} 天解锁「${next.t}」${next.e}`
          : `已连续记账 ${st} 天 · 勋章全点亮了，了不起 🌟`}
      </div>
    </div>
  )
}
