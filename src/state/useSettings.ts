import { create } from 'zustand'

const KEY = 'ledger_settings_v2'

interface SettingsState {
  ready: boolean
  budgetTotal: number
  setBudgetTotal: (n: number) => void
}

function load(): { budgetTotal: number } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '')
    return { budgetTotal: Number(s.budgetTotal) || 0 }
  } catch {
    return { budgetTotal: 0 }
  }
}
function persist(s: { budgetTotal: number }) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export const useSettings = create<SettingsState>((set) => ({
  ready: true,
  budgetTotal: load().budgetTotal,
  setBudgetTotal: (n) => {
    const budgetTotal = Math.max(0, Math.round(n * 100) / 100)
    persist({ budgetTotal })
    set({ budgetTotal })
  },
}))
