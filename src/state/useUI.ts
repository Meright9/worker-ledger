import { create } from 'zustand'

export type Page = 'home' | 'add' | 'stats' | 'me'

interface UIState {
  page: Page
  quickAddOpen: boolean
  setPage: (p: Page) => void
  openQuickAdd: () => void
  closeQuickAdd: () => void
}

export const useUI = create<UIState>((set) => ({
  page: 'home',
  quickAddOpen: false,
  setPage: (page) => set({ page }),
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
}))
