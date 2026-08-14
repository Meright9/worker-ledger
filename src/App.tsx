import { useEffect } from 'react'
import Scenery from './components/Scenery'
import NavBar from './components/NavBar'
import HomePage from './components/HomePage'
import AddForm from './components/AddForm'
import StatsPage from './components/StatsPage'
import MePage from './components/MePage'
import QuickAddModal from './components/QuickAddModal'
import { useLedger } from './state/useLedger'
import { useUI } from './state/useUI'

export default function App() {
  const init = useLedger((s) => s.init)
  const page = useUI((s) => s.page)
  useEffect(() => {
    init()
  }, [init])
  return (
    <>
      <Scenery />
      <div className="app">
        {page === 'home' && <HomePage />}
        {page === 'add' && (
          <div className="page">
            <div className="card">
              <div className="section-title">
                <h3>记一笔</h3>
              </div>
              <div style={{ marginTop: 12 }}>
                <AddForm onDone={() => useUI.getState().setPage('home')} />
              </div>
            </div>
          </div>
        )}
        {page === 'stats' && <StatsPage />}
        {page === 'me' && <MePage />}
        <NavBar />
      </div>
      <QuickAddModal />
    </>
  )
}
