import { useLedger } from '../state/useLedger'

export default function HomePage() {
  const records = useLedger((s) => s.records)
  return (
    <section className="hero card">
      <h2>今日 · 打工人小账本</h2>
      <p>当前记录数：{records.length}</p>
    </section>
  )
}
