import { useUI, Page } from '../state/useUI'

const items: { key: Page; label: string }[] = [
  { key: 'home', label: '首页' },
  { key: 'add', label: '记账' },
  { key: 'stats', label: '统计' },
  { key: 'me', label: '我的' },
]

export default function NavBar() {
  const page = useUI((s) => s.page)
  const setPage = useUI((s) => s.setPage)
  return (
    <nav className="nav">
      {items.map((it) => (
        <button
          key={it.key}
          className={'navbtn' + (page === it.key ? ' on' : '')}
          onClick={() => setPage(it.key)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  )
}
