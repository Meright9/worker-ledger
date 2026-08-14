import { useLedger } from '../state/useLedger'
import { money, ym, streakDays, monthRecords } from '../lib/ledger'
import TodayHero from './TodayHero'
import MedalWall from './MedalWall'
import MemoryCard from './MemoryCard'
import RecList from './RecList'

export default function HomePage() {
  const records = useLedger((s) => s.records)
  const m = ym(new Date())
  const all = monthRecords(records, m)
  let inc = 0
  let exp = 0
  all.forEach((r) => (r.type === 'income' ? (inc += r.amount) : (exp += r.amount)))
  const net = inc - exp
  const st = streakDays(records)

  const kpis = [
    { k: '本月支出', v: money(exp), cls: exp > 0 ? 'neg' : '' },
    { k: '本月收入', v: money(inc), cls: inc > 0 ? 'pos' : '' },
    { k: '结余', v: money(net), cls: net >= 0 ? 'pos' : 'neg' },
    { k: '连续', v: st + ' 天', cls: '' },
  ]

  return (
    <div className="page">
      <TodayHero />
      <div className="kpiRow">
        {kpis.map((k) => (
          <div className="kpi" key={k.k}>
            <div className={'kv ' + k.cls}>{k.v}</div>
            <div className="kl">{k.k}</div>
          </div>
        ))}
      </div>
      <MedalWall />
      <MemoryCard />
      <div className="section-title">
        <h3>最近记账</h3>
      </div>
      <RecList limit={8} />
    </div>
  )
}
