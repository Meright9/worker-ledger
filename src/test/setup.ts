import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom 环境下没有真实 Tauri 运行时；全局 mock invoke，
// - 组件/状态测试走 localDb 时根本不会调用 invoke；
// - tauriDb 路径测试通过 vi.mocked(invoke) 配置返回值。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {
    /* default: resolve undefined */
  }),
}))
