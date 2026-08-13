import { create } from 'zustand'
import { db, Rec, RecPayload } from '../api/db'

interface LedgerState {
  records: Rec[]
  loaded: boolean
  init: () => Promise<void>
  add: (p: RecPayload) => Promise<void>
  update: (id: number, p: RecPayload) => Promise<void>
  del: (id: number) => Promise<void>
}

export const useLedger = create<LedgerState>((set) => ({
  records: [],
  loaded: false,
  init: async () => {
    await db.init()
    const records = await db.recordList()
    set({ records, loaded: true })
  },
  add: async (p) => {
    await db.recordInsert(p)
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
}))
