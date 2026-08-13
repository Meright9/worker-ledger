import { create } from 'zustand'

interface SettingsState {
  ready: boolean
}

export const useSettings = create<SettingsState>(() => ({ ready: true }))
