import { useLedger } from '../state/useLedger'
import { bucketStat, trend30, catTop, money, ym } from '../lib/ledger'

const BUCKET_COLOR: Record<string, string> = { 必要: '#5E8C72', 想要: '#C07E5E', 储蓄: '#6E97AE' }

function Bars({ data }: { data: { label: string; amt: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amt))
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="barRow" key={d.label}>
          <span className="nm">{d.label}</span>
          <span className="track">
            <span className="fill" style={{ width: (d.amt / max) * 100 + '%', background: d.color }} />
          </span>
          <span className="vl">{money(d.amt)}</span>
        </div>
      ))}
    </div>
  )
}

function Trend() {
  const records = useLedger((s) => s.records)
  const data = trend30(records)
  const w = 300
  const h = 80
  const max = Math.max(1, ...data.map((d) => d.amt))
  const step = w / (data.length - 1)
  const pts = data.map((d, i) => [i * step, h - (d.amt / max) * (h - 8) - 4])
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = `M0 ${h} ` + pts.map((p) => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ` L${w} ${h} Z`
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9CC2A6" stopOpacity=".5" />
          <stop offset="100%" stopColor="#9CC2A6" stopOpacity=".04" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#gTrend)" />
      <path d={line} fill="none" stroke="#5E8C72" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function Charts() {
  const records = useLedger((s) => s.records)
  const m = ym(new Date())
  const bk = bucketStat(records, m)
  const bucketData = (['必要', '想要', '储蓄'] as const).map((k) => ({ label: k, amt: bk[k], color: BUCKET_COLOR[k] }))
  const catData = catTop(records, m, 5).map((c, i) => ({
    label: c.cat,
    amt: c.amt,
    color: ['#5E8C72', '#C07E5E', '#6E97AE', '#E0A24A', '#9FC4CE'][i % 5],
  }))
  return (
    <>
      <div className="card">
        <div className="section-title">
          <h3>本月分桶占比</h3>
        </div>
        <div style={{ marginTop: 10 }}>
          <Bars data={bucketData} />
        </div>
      </div>
      <div className="card">
        <div className="section-title">
          <h3>近 30 天支出趋势</h3>
        </div>
        <div style={{ marginTop: 10 }}>
          <Trend />
        </div>
      </div>
      <div className="card">
        <div className="section-title">
          <h3>本月分类 TOP</h3>
        </div>
        <div style={{ marginTop: 10 }}>
          {catData.length ? <Bars data={catData} /> : <div className="empty">本月还没有支出记录</div>}
        </div>
      </div>
    </>
  )
}
