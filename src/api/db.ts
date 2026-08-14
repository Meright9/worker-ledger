import { invoke } from '@tauri-apps/api/core'

export type TType = 'expense' | 'income'

export interface Rec {
  id?: number
  type: TType
  cat: string
  subcat?: string
  amount: number
  account?: string
  bucket?: string
  mood?: string
  note?: string
  ts: number
}

export interface Account {
  id?: number
  name: string
  balance: number
}

export type RecPayload = Omit<Rec, 'id'>

export interface Db {
  init(): Promise<void>
  recordList(range?: [number, number]): Promise<Rec[]>
  recordInsert(p: RecPayload): Promise<number>
  recordUpdate(id: number, p: RecPayload): Promise<void>
  recordDelete(id: number): Promise<void>
  accountList(): Promise<Account[]>
  accountUpsert(name: string, balance: number): Promise<void>
  exportData(): Promise<string>
  importData(json: string): Promise<void>
}

// ---------- 本地回退实现（dev 预览 / 测试 / 无 Tauri 环境） ----------
const KEY = 'ledger_v2'
interface Store {
  records: Rec[]
  accounts: Account[]
  meta: Record<string, string>
  seq: number
}
function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '') as Store
  } catch {
    return { records: [], accounts: [], meta: {}, seq: 0 }
  }
}
function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export const localDb: Db = {
  async init() {
    if (!localStorage.getItem(KEY)) {
      write({ records: [], accounts: [], meta: { version: '2' }, seq: 0 })
    }
  },
  async recordList(range) {
    const rs = read().records
    return range ? rs.filter((r) => r.ts >= range[0] && r.ts <= range[1]) : rs
  },
  async recordInsert(p) {
    const s = read()
    s.seq += 1
    s.records.push({ ...p, id: s.seq })
    write(s)
    return s.seq
  },
  async recordUpdate(id, p) {
    const s = read()
    const i = s.records.findIndex((r) => r.id === id)
    if (i >= 0) {
      s.records[i] = { ...(s.records[i] as Rec), ...p, id }
      write(s)
    }
  },
  async recordDelete(id) {
    const s = read()
    s.records = s.records.filter((r) => r.id !== id)
    write(s)
  },
  async accountList() {
    return read().accounts
  },
  async accountUpsert(name, balance) {
    const s = read()
    const i = s.accounts.findIndex((a) => a.name === name)
    if (i >= 0) s.accounts[i].balance = balance
    else s.accounts.push({ name, balance })
    write(s)
  },
  async exportData() {
    return JSON.stringify(read())
  },
  async importData(json) {
    const s = JSON.parse(json) as Store
    write({ records: s.records || [], accounts: s.accounts || [], meta: s.meta || {}, seq: s.seq || 0 })
  },
}

// ---------- Tauri 实现（走 Rust 命令，命令在阶段 2 落地） ----------
export const tauriDb: Db = {
  init: () => invoke('db_init') as Promise<void>,
  recordList: (range) => invoke<Rec[]>('record_list', { range: range ?? null }),
  recordInsert: (p) => invoke<number>('record_insert', { p }),
  recordUpdate: (id, p) => invoke('record_update', { id, p }) as Promise<void>,
  recordDelete: (id) => invoke('record_delete', { id }) as Promise<void>,
  accountList: () => invoke<Account[]>('account_list'),
  accountUpsert: (name, balance) => invoke('account_upsert', { name, balance }) as Promise<void>,
  exportData: () => invoke<string>('export_data'),
  importData: (json) => invoke('import_data', { json }) as Promise<void>,
}

export function hasTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
}

export const db: Db = hasTauri() ? tauriDb : localDb
