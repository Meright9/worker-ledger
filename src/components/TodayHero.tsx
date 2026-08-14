import { useLedger } from '../state/useLedger'
import { useSettings } from '../state/useSettings'
import { todayQuota, money } from '../lib/ledger'

export default function TodayHero() {
  const records = useLedger((s) => s.records)
  const budgetTotal = useSettings((s) => s.budgetTotal)
  const q = todayQuota(records, budgetTotal)
  if (!q.hasBudget) {
    return (
      <div className="hero">
        <div className="hlabel">今日还能花多少</div>
        <div className="heroAmt">—</div>
        <div className="heroSub">
          还没设月度总预算。到「我的」里填一下月度预算，就能看到每天还能花多少。
        </div>
      </div>
    )
  }
  return (
    <div className="hero">
      <div className="hlabel">今日还能花多少</div>
      <div className={'heroAmt ' + q.color}>{money(q.todayLeft)}</div>
      <div className="heroSub">{q.msg}</div>
      <div className="hint">
        月预算 {money(budgetTotal)} · 本月已花 {money(q.remain >= 0 ? budgetTotal - q.remain : budgetTotal)} · 日均额度{' '}
        {money(q.quota)}
      </div>
    </div>
  )
}
