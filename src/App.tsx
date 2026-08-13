import { useEffect } from 'react'
import Scenery from './components/Scenery'
import NavBar from './components/NavBar'
import HomePage from './components/HomePage'
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
        <NavBar />
      </div>
    </>
  )
}
