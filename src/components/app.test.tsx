import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import HomePage from './HomePage'
import MedalWall from './MedalWall'
import QuickAddModal from './QuickAddModal'
import AddForm from './AddForm'
import StatsPage from './StatsPage'
import MePage from './MePage'
import RecList from './RecList'
import { useLedger } from '../state/useLedger'
import { useUI } from '../state/useUI'
import { useSettings } from '../state/useSettings'
import type { Rec } from '../api/db'

function dayTs(offset: number): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - offset)
  return d.getTime()
}

function storedRecords(): Rec[] {
  const raw = localStorage.getItem('ledger_v2')
  if (!raw) return []
  return (JSON.parse(raw).records || []) as Rec[]
}

function resetAll() {
  localStorage.clear()
  useSettings.setState({ budgetTotal: 0 })
  useLedger.setState({ records: [], accounts: [], loaded: true })
  useUI.setState({ quickAddOpen: false, page: 'home' })
}

describe('首页渲染', () => {
  beforeEach(resetAll)
  afterEach(cleanup)

  it('无预算时今日额度显示 —', () => {
    render(<HomePage />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('有预算时今日额度显示金额', () => {
    useSettings.setState({ budgetTotal: 4000 })
    useLedger.setState({
      records: [{ id: 1, type: 'expense', cat: '吃饭', amount: 20, ts: dayTs(0) }],
      loaded: true,
    })
    render(<HomePage />)
    expect(screen.getByText(/今日还能花多少/)).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('连续 7 天点亮 ≥2 枚勋章', () => {
    const rs: Rec[] = Array.from({ length: 7 }, (_, i) => ({
      id: i,
      type: 'expense',
      cat: '吃饭',
      amount: 10,
      ts: dayTs(i),
    }))
    useLedger.setState({ records: rs, loaded: true })
    render(<MedalWall />)
    expect(document.querySelectorAll('.medal').length).toBe(6)
    expect(document.querySelectorAll('.medal.on').length).toBeGreaterThanOrEqual(2)
  })

  it('零记录时勋章全灭', () => {
    render(<MedalWall />)
    expect(document.querySelectorAll('.medal.on').length).toBe(0)
  })
})

describe('悬浮速记 QuickAddModal', () => {
  beforeEach(resetAll)
  afterEach(cleanup)

  it('默认不渲染', () => {
    const { container } = render(<QuickAddModal />)
    expect(container.querySelector('.mask')).toBeNull()
  })

  it('打开→填金额→保存→记录入库→关闭', async () => {
    render(<QuickAddModal />)
    useUI.getState().openQuickAdd()
    const amt = await screen.findByPlaceholderText('0.00')
    fireEvent.change(amt, { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: /记 ¥42/ }))
    await waitFor(() => expect(useUI.getState().quickAddOpen).toBe(false))
    const stored = storedRecords()
    expect(stored).toHaveLength(1)
    expect(stored[0].amount).toBe(42)
    expect(stored[0].type).toBe('expense')
    expect(useLedger.getState().records).toHaveLength(1)
  })

  it('空金额不入库且保持打开', async () => {
    render(<QuickAddModal />)
    useUI.getState().openQuickAdd()
    await screen.findByPlaceholderText('0.00')
    fireEvent.click(screen.getByRole('button', { name: /^记/ }))
    expect(await screen.findByText('先填个金额')).toBeInTheDocument()
    expect(storedRecords()).toHaveLength(0)
    expect(useUI.getState().quickAddOpen).toBe(true)
  })

  it('Ctrl+Shift+K 唤起', () => {
    render(<QuickAddModal />)
    expect(useUI.getState().quickAddOpen).toBe(false)
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true })
    expect(useUI.getState().quickAddOpen).toBe(true)
  })

  it('点遮罩关闭', async () => {
    const { container } = render(<QuickAddModal />)
    useUI.getState().openQuickAdd()
    await screen.findByPlaceholderText('0.00')
    fireEvent.click(container.querySelector('.mask')!)
    expect(useUI.getState().quickAddOpen).toBe(false)
  })
})

describe('记账表单 AddForm', () => {
  beforeEach(resetAll)
  afterEach(cleanup)

  it('单笔保存入库', async () => {
    render(<AddForm />)
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '记这一笔' }))
    await waitFor(() => expect(storedRecords()).toHaveLength(1))
    expect(storedRecords()[0].amount).toBe(18)
    expect(storedRecords()[0].bucket).toBe('必要')
  })

  it('切到一键多笔：预览 + 批量入库', async () => {
    render(<AddForm />)
    fireEvent.click(screen.getByRole('button', { name: '一键多笔' }))
    const ta = await screen.findByPlaceholderText(/午饭/)
    fireEvent.change(ta, { target: { value: '午饭 32\n地铁 6\n奶茶 18' } })
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(document.querySelectorAll('.multiItem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '全部记上' }))
    await waitFor(() => expect(storedRecords()).toHaveLength(3))
    expect(storedRecords().map((r) => r.amount)).toEqual([32, 6, 18])
    expect(storedRecords().map((r) => r.cat)).toEqual(['吃饭', '交通', '咖啡'])
  })

  it('金额为空时不入库并提示', async () => {
    render(<AddForm />)
    fireEvent.click(screen.getByRole('button', { name: '记这一笔' }))
    expect(await screen.findByText(/先填个金额/)).toBeInTheDocument()
    expect(storedRecords()).toHaveLength(0)
  })

  it('切收入后分类换成收入类目，且分桶行隐藏', () => {
    render(<AddForm />)
    expect(screen.getByRole('button', { name: '吃饭' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    expect(screen.getByRole('button', { name: '副业' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '吃饭' })).not.toBeInTheDocument()
    expect(screen.queryByText('把钱归到哪个桶')).not.toBeInTheDocument()
  })

  it('收支切换的 on 态互斥', () => {
    render(<AddForm />)
    expect(screen.getByRole('button', { name: '支出' }).className).toContain('on')
    expect(screen.getByRole('button', { name: '收入' }).className).not.toContain('on')
    fireEvent.click(screen.getByRole('button', { name: '收入' }))
    expect(screen.getByRole('button', { name: '收入' }).className).toContain('on')
    expect(screen.getByRole('button', { name: '支出' }).className).not.toContain('on')
  })
})

describe('列表与统计', () => {
  beforeEach(resetAll)
  afterEach(cleanup)

  it('RecList 空态提示', () => {
    render(<RecList />)
    expect(screen.getByText(/还没有记账/)).toBeInTheDocument()
  })

  it('RecList 渲染收支符号并可删除', async () => {
    useLedger.setState({
      records: [
        { id: 1, type: 'expense', cat: '吃饭', amount: 30, ts: dayTs(0) },
        { id: 2, type: 'income', cat: '工资', amount: 8000, ts: dayTs(0) },
      ],
      loaded: true,
    })
    render(<RecList />)
    expect(screen.getByText(/^-¥30$/)).toBeInTheDocument()
    expect(screen.getByText(/^\+¥8,000$/)).toBeInTheDocument()
    expect(document.querySelectorAll('.recItem')).toHaveLength(2)
  })

  it('RecList limit 截断', () => {
    useLedger.setState({
      records: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        type: 'expense' as const,
        cat: '吃饭',
        amount: 10 + i,
        ts: dayTs(i),
      })),
      loaded: true,
    })
    render(<RecList limit={3} />)
    expect(document.querySelectorAll('.recItem')).toHaveLength(3)
  })

  it('StatsPage 渲染三块图表', () => {
    useLedger.setState({
      records: [
        { id: 1, type: 'expense', cat: '吃饭', amount: 300, bucket: '必要', ts: dayTs(0) },
        { id: 2, type: 'expense', cat: '咖啡', amount: 100, bucket: '想要', ts: dayTs(1) },
      ],
      loaded: true,
    })
    render(<StatsPage />)
    expect(screen.getByText('本月分桶占比')).toBeInTheDocument()
    expect(screen.getByText('近 30 天支出趋势')).toBeInTheDocument()
    expect(screen.getByText('本月分类 TOP')).toBeInTheDocument()
    expect(screen.getByText('全部记账')).toBeInTheDocument()
  })

  it('MePage 可设置月预算', () => {
    render(<MePage />)
    fireEvent.change(screen.getByPlaceholderText('如 4000'), { target: { value: '5000' } })
    expect(useSettings.getState().budgetTotal).toBe(5000)
    expect(screen.getByText(/¥5,000 \/ 月/)).toBeInTheDocument()
  })

  it('MePage 显示版本号 2.0.0', () => {
    render(<MePage />)
    expect(screen.getByText('v2.0.0')).toBeInTheDocument()
  })
})
