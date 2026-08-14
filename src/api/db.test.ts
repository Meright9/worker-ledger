import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

// ---------- 本地回退（localStorage）模式 ----------
describe('db 本地模式（localStorage）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('init 建空库', async () => {
    const { db } = await import('./db')
    await db.init()
    expect(JSON.parse(localStorage.getItem('ledger_v2')!).records).toEqual([])
  })

  it('CRUD 闭环', async () => {
    const { db } = await import('./db')
    await db.init()
    const id = await db.recordInsert({ type: 'expense', cat: '吃饭', amount: 32, ts: Date.now() })
    expect(typeof id).toBe('number')
    let list = await db.recordList()
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(32)
    await db.recordUpdate(id, { type: 'expense', cat: '吃饭', amount: 50, ts: Date.now() })
    list = await db.recordList()
    expect(list[0].amount).toBe(50)
    await db.recordDelete(id)
    expect(await db.recordList()).toHaveLength(0)
  })

  it('账户 upsert + list', async () => {
    const { db } = await import('./db')
    await db.init()
    await db.accountUpsert('储蓄卡', 1000)
    await db.accountUpsert('储蓄卡', 2000)
    const a = await db.accountList()
    expect(a).toHaveLength(1)
    expect(a[0].balance).toBe(2000)
  })

  it('导出/导入往返', async () => {
    const { db } = await import('./db')
    await db.init()
    await db.recordInsert({ type: 'income', cat: '副业', amount: 999, ts: Date.now() })
    const blob = await db.exportData()
    const parsed = JSON.parse(blob)
    expect(parsed.records.length).toBe(1)
    await db.recordDelete(parsed.records[0].id)
    expect(await db.recordList()).toHaveLength(0)
    await db.importData(blob)
    expect(await db.recordList()).toHaveLength(1)
  })
})

// ---------- Tauri 模式（mock invoke） ----------
describe('db Tauri 模式（invoke）', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(invoke).mockReset()
  })

  it('hasTauri 探测', async () => {
    expect((await import('./db')).hasTauri()).toBe(false)
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {}
    expect((await import('./db')).hasTauri()).toBe(true)
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  // 注意：导出的 db 在模块加载时即按 hasTauri() 定型，jsdom 下恒为 localDb。
  // 因此 Tauri 通道必须直接对 tauriDb 打点，而不是改 window 再用 db。
  it('db_init 命令名', async () => {
    const { tauriDb } = await import('./db')
    await tauriDb.init()
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('db_init')
  })

  it('record_insert 透传 p 载荷', async () => {
    vi.mocked(invoke).mockResolvedValue(7)
    const { tauriDb } = await import('./db')
    const id = await tauriDb.recordInsert({ type: 'expense', cat: '吃饭', amount: 12, ts: 1700000000000 })
    expect(id).toBe(7)
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      'record_insert',
      expect.objectContaining({ p: expect.objectContaining({ cat: '吃饭', amount: 12 }) }),
    )
  })

  it('record_list 使用 range 形参', async () => {
    const { tauriDb } = await import('./db')
    vi.mocked(invoke).mockResolvedValue([])
    await tauriDb.recordList([100, 200])
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('record_list', { range: [100, 200] })
  })

  it('record_list 无 range 时传 null', async () => {
    const { tauriDb } = await import('./db')
    vi.mocked(invoke).mockResolvedValue([])
    await tauriDb.recordList()
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('record_list', { range: null })
  })

  it('record_update / record_delete 形参', async () => {
    const { tauriDb } = await import('./db')
    await tauriDb.recordUpdate(3, { type: 'income', cat: '工资', amount: 8000, ts: 1 })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('record_update', expect.objectContaining({ id: 3 }))
    await tauriDb.recordDelete(3)
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('record_delete', { id: 3 })
  })

  it('account_list / account_upsert 形参', async () => {
    const { tauriDb } = await import('./db')
    vi.mocked(invoke).mockResolvedValue([])
    await tauriDb.accountList()
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('account_list')
    await tauriDb.accountUpsert('储蓄卡', 1000)
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('account_upsert', { name: '储蓄卡', balance: 1000 })
  })

  it('export_data / import_data 形参', async () => {
    const { tauriDb } = await import('./db')
    vi.mocked(invoke).mockResolvedValue('{}')
    expect(await tauriDb.exportData()).toBe('{}')
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('export_data')
    await tauriDb.importData('{"records":[]}')
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('import_data', { json: '{"records":[]}' })
  })

  it('localDb 不触发 invoke', async () => {
    const { localDb } = await import('./db')
    await localDb.init()
    await localDb.recordInsert({ type: 'expense', cat: '交通', amount: 5, ts: 1 })
    expect(vi.mocked(invoke)).not.toHaveBeenCalled()
  })
})
