// 纯函数域逻辑层（2.0 重构）
// 把 1.1.0 frontend/index.html 的核心算法搬入 TS，单一事实源；
// 不依赖存储，全部以 Rec[] 为输入，便于 Vitest 双模测试。
import type { Rec, RecPayload, TType } from '../api/db'

export const CATS_E = ['吃饭', '咖啡', '交通', '购物', '娱乐', '居住', '医疗', '人情', '其他']
export const CATS_I = ['副业', '红包', '报销', '理财', '其他']
export const BUCKETS = ['必要', '想要', '储蓄']
export const MOODS = ['😌', '🙂', '😀', '😄', '🥰', '😣', '😮‍💨', '🤔']

// ---------- 时间 ----------
function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}
export function ymd(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
export function ym(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1)
}
export function dateStr(ts: number): string {
  return ymd(new Date(ts))
}
export function monthStr(ts: number): string {
  return ym(new Date(ts))
}
export function daysLeft(): number {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate() + 1
}

// ---------- 金额格式化 ----------
export function money(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString('zh-CN')
  return (n < 0 ? '-' : '') + '¥' + s
}
export function money2(n: number): string {
  return '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
export function num(v: unknown, d = 0): number {
  const x = parseFloat(String(v))
  return isFinite(x) ? x : d
}
export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string))
}

// ---------- 分类猜测 ----------
export function catGuess(name: string): string {
  const map: [string, string][] = [
    ['咖啡', '咖啡'], ['拿铁', '咖啡'], ['星巴克', '咖啡'], ['瑞幸', '咖啡'], ['奶茶', '咖啡'],
    ['吃', '吃饭'], ['餐', '吃饭'], ['午', '吃饭'], ['饭', '吃饭'], ['外卖', '吃饭'],
    ['交通', '交通'], ['车', '交通'], ['地铁', '交通'], ['公交', '交通'], ['打车', '交通'],
    ['购物', '购物'], ['买', '购物'], ['服', '购物'],
    ['娱乐', '娱乐'], ['电影', '娱乐'], ['游戏', '娱乐'],
    ['居', '居住'], ['房租', '居住'], ['物业', '居住'], ['水电', '居住'],
    ['医', '医疗'], ['药', '医疗'],
    ['人情', '人情'], ['红包', '人情'], ['礼', '人情'],
  ]
  const s = '' + (name || '')
  for (const [k, v] of map) if (s.indexOf(k) >= 0) return v
  return '其他'
}

// ---------- 一键多笔解析 ----------
// 输入多行文本，每行形如「午饭 32」「地铁 6 回家」或纯数字「42」；
// 输出 RecPayload 数组（ts 统一设为录入时刻 Date.now()）。
export function parseMulti(text: string): RecPayload[] {
  const out: RecPayload[] = []
  const needCats: Record<string, string> = { 吃饭: '必要', 交通: '必要', 居住: '必要', 医疗: '必要' }
  const ts = Date.now()
  ;(text || '').split(/\n/).forEach((rawLine) => {
    const line = rawLine
      .replace(/([^\d\s])(\d)/g, '$1 $2')
      .replace(/(\d)([^\d\s])/g, '$1 $2')
      .trim()
    if (!line) return
    const toks = line.split(/[\s,，、]+/).filter(Boolean)
    const name: string[] = []
    toks.forEach((t) => {
      const mm = t.match(/^(\d+(\.\d+)?)$/)
      if (mm) {
        const amt = num(mm[1])
        if (amt > 0) {
          const nm = name.join(' ').trim()
          const cat = nm ? catGuess(nm) : '其他'
          out.push({
            type: 'expense',
            cat,
            amount: Math.round(amt * 100) / 100,
            note: nm,
            bucket: needCats[cat] || '想要',
            subcat: '',
            ts,
          })
          name.length = 0
        }
      } else {
        name.push(t)
      }
    })
  })
  return out
}

// ---------- 连续记账天数 ----------
export function streakDays(records: Rec[]): number {
  if (!records.length) return 0
  const set = new Set(records.map((r) => dateStr(r.ts)))
  const dates = [...set].sort()
  let cur = dates[dates.length - 1]
  let n = 0
  while (set.has(cur)) {
    n++
    const d = new Date(cur + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    cur = ymd(d)
  }
  return n
}

// ---------- 勋章墙 ----------
export interface MedalTier {
  d: number
  e: string
  t: string
}
export const MEDAL_TIERS: MedalTier[] = [
  { d: 3, e: '🌱', t: '破土' },
  { d: 7, e: '🌿', t: '一周' },
  { d: 21, e: '🌳', t: '21天' },
  { d: 30, e: '⛰️', t: '满月' },
  { d: 100, e: '🏔️', t: '百天' },
  { d: 365, e: '🌅', t: '周年' },
]
export function medals(streak: number): { on: MedalTier[]; next: MedalTier | undefined } {
  return {
    on: MEDAL_TIERS.filter((m) => streak >= m.d),
    next: MEDAL_TIERS.find((m) => streak < m.d),
  }
}

// ---------- 月度 / 预算聚合 ----------
export function monthRecords(records: Rec[], m: string): Rec[] {
  return records.filter((r) => monthStr(r.ts) === m)
}
export function budgetStat(records: Rec[], m: string): { total: number; byCat: Record<string, number> } {
  const exp = records.filter((r) => r.type === 'expense' && monthStr(r.ts) === m)
  let total = 0
  const byCat: Record<string, number> = {}
  exp.forEach((r) => {
    total += r.amount
    byCat[r.cat] = (byCat[r.cat] || 0) + r.amount
  })
  return { total, byCat }
}

// ---------- 今日额度 ----------
export interface TodayQuota {
  hasBudget: boolean
  quota: number
  remain: number
  todayLeft: number
  color: 'mint' | 'red'
  msg: string
}
export function todayQuota(records: Rec[], budgetTotal: number): TodayQuota {
  const today = new Date()
  const ymCur = ym(today)
  const dsToday = dateStr(today.getTime())
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  if (!(budgetTotal > 0)) {
    return { hasBudget: false, quota: 0, remain: 0, todayLeft: 0, color: 'mint', msg: '' }
  }
  const bs = budgetStat(records, ymCur)
  const spentMonth = bs.total
  const dailyBudget = budgetTotal / daysInMonth
  const spentBeforeToday = records
    .filter((r) => r.type === 'expense' && monthStr(r.ts) === ymCur && dateStr(r.ts) < dsToday)
    .reduce((a, r) => a + r.amount, 0)
  const spentToday = records
    .filter((r) => r.type === 'expense' && dateStr(r.ts) === dsToday)
    .reduce((a, r) => a + r.amount, 0)
  const quota = Math.round((dailyBudget - spentBeforeToday) * 100) / 100
  const remain = budgetTotal - spentMonth
  const todayLeft = Math.round((quota - spentToday) * 100) / 100
  const dl = daysInMonth - today.getDate() + 1
  let msg: string
  if (todayLeft < 0) {
    msg = '今天已超出日额度 ' + money(-todayLeft) + '，明天从日均里匀回来就好，别自责 🌿'
  } else if (spentBeforeToday < dailyBudget * (daysInMonth - dl + 1)) {
    msg = '本月预算还剩 ' + money(remain) + '，前几天攒下的，今天可以多花点。日均 ' + money(dailyBudget) + '。'
  } else {
    msg = '本月预算还剩 ' + money(remain) + '，今天额度 ' + money(quota) + '，稳着点花。'
  }
  return { hasBudget: true, quota, remain, todayLeft: todayLeft >= 0 ? todayLeft : 0, color: todayLeft >= 0 ? 'mint' : 'red', msg }
}

// ---------- 本月回忆卡 ----------
export interface MemorySummary {
  has: boolean
  count: number
  days: number
  total: number
  topMood: string
  best: Rec | null
  inc: number
  exp: number
  net: number
}
export function memorySummary(records: Rec[], m: string): MemorySummary {
  const rs = monthRecords(records, m).filter((r) => r.type === 'expense')
  if (!rs.length) {
    return { has: false, count: 0, days: 0, total: 0, topMood: '', best: null, inc: 0, exp: 0, net: 0 }
  }
  const moods: Record<string, number> = {}
  rs.forEach((r) => {
    if (r.mood) moods[r.mood] = (moods[r.mood] || 0) + 1
  })
  const topMood = Object.keys(moods).sort((a, b) => moods[b] - moods[a])[0] || ''
  const total = rs.reduce((a, r) => a + r.amount, 0)
  const days: Record<string, number> = {}
  rs.forEach((r) => (days[dateStr(r.ts)] = 1))
  const daysN = Object.keys(days).length
  const best = rs.slice().sort((a, b) => b.amount - a.amount)[0] || null
  const all = monthRecords(records, m)
  let inc = 0
  let exp = 0
  all.forEach((r) => (r.type === 'income' ? (inc += r.amount) : (exp += r.amount)))
  return { has: true, count: rs.length, days: daysN, total, topMood, best, inc, exp, net: inc - exp }
}

// ---------- 桶占比 ----------
export function bucketStat(records: Rec[], m: string): Record<string, number> {
  const s: Record<string, number> = { 必要: 0, 想要: 0, 储蓄: 0 }
  monthRecords(records, m).forEach((r) => {
    const b = r.bucket || (r.type === 'income' ? '储蓄' : '必要')
    s[b] = (s[b] || 0) + r.amount
  })
  return s
}

// ---------- 近 30 天趋势（按日支出） ----------
export function trend30(records: Rec[]): { day: string; amt: number }[] {
  const out: { day: string; amt: number }[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = ymd(d)
    out.push({ day: key.slice(5), amt: 0 })
  }
  const idx = new Map(out.map((o, i) => [o.day, i]))
  records.forEach((r) => {
    if (r.type === 'expense') {
      const k = dateStr(r.ts).slice(5)
      if (idx.has(k)) out[idx.get(k)!].amt += r.amount
    }
  })
  return out
}

// ---------- 本月分类汇总（降序，取前 N） ----------
export function catTop(records: Rec[], m: string, n = 5): { cat: string; amt: number }[] {
  const map: Record<string, number> = {}
  monthRecords(records, m)
    .filter((r) => r.type === 'expense')
    .forEach((r) => (map[r.cat] = (map[r.cat] || 0) + r.amount))
  return Object.keys(map)
    .map((k) => ({ cat: k, amt: map[k] }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, n)
}

// 空 payload 工厂（表单默认值）
export function emptyPayload(type: TType = 'expense'): RecPayload {
  return { type, cat: type === 'expense' ? CATS_E[0] : CATS_I[0], amount: 0, subcat: '', bucket: '必要', note: '', ts: Date.now() }
}
