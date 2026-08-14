import Charts from './Charts'
import RecList from './RecList'

export default function StatsPage() {
  return (
    <div className="page">
      <Charts />
      <div className="section-title">
        <h3>全部记账</h3>
      </div>
      <RecList />
    </div>
  )
}
