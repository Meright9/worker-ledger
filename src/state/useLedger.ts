import { create } from 'zustand'
import { db, Rec, RecPayload, Account } from '../api/db'

interface LedgerState {
  records: Rec[]
  accounts: Account[]
  loaded: boolean
  init: () => Promise<void>
  add: (p: RecPayload) => Promise<void>
  addMany: (ps: RecPayload[]) => Promise<void>
  update: (id: number, p: RecPayload) => Promise<void>
  del: (id: number) => Promise<void>
  upsertAccount: (name: string, balance: number) => Promise<void>
}

export const useLedger = create<LedgerState>((set) => ({
  records: [],
  accounts: [],
  loaded: false,
  init: async () => {
    await db.init()
    const [records, accounts] = await Promise.all([db.recordList(), db.accountList()])
    set({ records, accounts, loaded: true })
  },
  add: async (p) => {
    await db.recordInsert(p)
    set({ records: await db.recordList() })
  },
  addMany: async (ps) => {
    for (const p of ps) await db.recordInsert(p)
    set({ records: await db.recordList() })
  },
  update: async (id, p) => {
    await db.recordUpdate(id, p)
    set({ records: await db.recordList() })
  },
  del: async (id) => {
    await db.recordDelete(id)
    set({ records: await db.recordList() })
  },
  upsertAccount: async (name, balance) => {
    await db.accountUpsert(name, balance)
    set({ accounts: await db.accountList() })
  },
}))
