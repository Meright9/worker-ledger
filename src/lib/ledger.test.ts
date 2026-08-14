import { describe, it, expect } from 'vitest'
import {
  money,
  money2,
  num,
  catGuess,
  parseMulti,
  streakDays,
  medals,
  MEDAL_TIERS,
  todayQuota,
  memorySummary,
  budgetStat,
  bucketStat,
  trend30,
  catTop,
  monthRecords,
  ym,
} from './ledger'
import type { Rec } from '../api/db'

function dayTs(offset: number): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - offset)
  return d.getTime()
}
function rec(ts: number, over: Partial<Rec> = {}): Rec {
  return { id: Math.floor(ts % 1e9), type: 'expense', cat: '吃饭', amount: 10, ts, ...over }
}

describe('金额格式化', () => {
  it('money 千分位与正负', () => {
    expect(money(1234)).toBe('¥1,234')
    expect(money(-5)).toBe('-¥5')
    expect(money(0)).toBe('¥0')
  })
  it('money2 两位小数', () => {
    expect(money2(3.5)).toBe('¥3.50')
    expect(money2(1000.1)).toBe('¥1,000.10')
  })
  it('num 兜底', () => {
    expect(num('42')).toBe(42)
    expect(num('x', 7)).toBe(7)
    expect(num('', 0)).toBe(0)
  })
})

describe('分类猜测 catGuess', () => {
  it('关键词命中', () => {
    expect(catGuess('公司楼下午饭')).toBe('吃饭')
    expect(catGuess('地铁通勤')).toBe('交通')
    expect(catGuess('一杯奶茶')).toBe('咖啡')
    expect(catGuess('买件冬装')).toBe('购物')
    expect(catGuess('本月房租')).toBe('居住')
  })
  it('无命中回落其他', () => {
    expect(catGuess('xyz 随便')).toBe('其他')
  })
})

describe('一键多笔 parseMulti', () => {
  it('单笔带中文名', () => {
    const r = parseMulti('午饭 32')
    expect(r).toHaveLength(1)
    expect(r[0].cat).toBe('吃饭')
    expect(r[0].amount).toBe(32)
    expect(r[0].note).toBe('午饭')
    expect(r[0].type).toBe('expense')
  })
  it('数字后的中文不计入该笔（与 1.1.0 一致：遇数字即结账，尾随文字丢弃）', () => {
    const r = parseMulti('地铁 6 回家')
    expect(r).toHaveLength(1)
    expect(r[0].cat).toBe('交通')
    expect(r[0].note).toBe('地铁')
    expect(r[0].amount).toBe(6)
    expect(r[0].bucket).toBe('必要')
  })
  it('纯数字回落其他', () => {
    const r = parseMulti('42')
    expect(r).toHaveLength(1)
    expect(r[0].cat).toBe('其他')
    expect(r[0].note).toBe('')
    expect(r[0].amount).toBe(42)
  })
  it('多行解析', () => {
    const r = parseMulti('午饭 32\n地铁 6 回家\n奶茶 18')
    expect(r).toHaveLength(3)
    expect(r.map((x) => x.cat)).toEqual(['吃饭', '交通', '咖啡'])
  })
  it('无数字不产出', () => {
    expect(parseMulti('今天没花钱')).toHaveLength(0)
  })
})

describe('连续记账 streakDays', () => {
  it('连续 7 天', () => {
    const rs = Array.from({ length: 7 }, (_, i) => rec(dayTs(i)))
    expect(streakDays(rs)).toBe(7)
  })
  it('断一天从今天起算 1', () => {
    const rs = [rec(dayTs(0)), rec(dayTs(2))]
    expect(streakDays(rs)).toBe(1)
  })
  it('空记录 0', () => {
    expect(streakDays([])).toBe(0)
  })
})

describe('勋章墙 medals', () => {
  it('7 天点亮 ≥2 档', () => {
    const m = medals(7)
    expect(m.on.length).toBeGreaterThanOrEqual(2)
    expect(m.on.map((x) => x.t)).toContain('破土')
    expect(m.on.map((x) => x.t)).toContain('一周')
    expect(m.next?.d).toBe(21)
    expect(m.next?.t).toBe('21天')
  })
  it('档位与 1.1.0 完全一致', () => {
    expect(MEDAL_TIERS.map((x) => x.d)).toEqual([3, 7, 21, 30, 100, 365])
    expect(MEDAL_TIERS.map((x) => x.e)).toEqual(['🌱', '🌿', '🌳', '⛰️', '🏔️', '🌅'])
    expect(MEDAL_TIERS.map((x) => x.t)).toEqual(['破土', '一周', '21天', '满月', '百天', '周年'])
  })
  it('满级无下一档', () => {
    expect(medals(400).next).toBeUndefined()
    expect(medals(400).on).toHaveLength(6)
  })
})

describe('今日额度 todayQuota', () => {
  it('无预算显示占位', () => {
    const q = todayQuota([], 0)
    expect(q.hasBudget).toBe(false)
    expect(q.todayLeft).toBe(0)
  })
  it('有预算产出额度与文案', () => {
    const q = todayQuota([rec(dayTs(0), { amount: 30, cat: '吃饭' })], 4000)
    expect(q.hasBudget).toBe(true)
    expect(typeof q.todayLeft).toBe('number')
    expect(q.todayLeft).toBeGreaterThanOrEqual(0)
    expect(q.msg.length).toBeGreaterThan(0)
  })
})

describe('月度聚合', () => {
  const m = ym(new Date())
  it('budgetStat 汇总本月支出', () => {
    const rs = [rec(dayTs(0), { amount: 100, cat: '吃饭' }), rec(dayTs(1), { amount: 50, cat: '咖啡' })]
    const s = budgetStat(rs, m)
    expect(s.total).toBe(150)
    expect(s.byCat['吃饭']).toBe(100)
  })
  it('bucketStat 分桶', () => {
    const rs = [
      rec(dayTs(0), { amount: 80, bucket: '必要' }),
      rec(dayTs(0), { amount: 20, bucket: '想要' }),
    ]
    const s = bucketStat(rs, m)
    expect(s['必要']).toBe(80)
    expect(s['想要']).toBe(20)
  })
  it('monthRecords 仅当月', () => {
    const rs = [rec(dayTs(0)), rec(dayTs(40))]
    expect(monthRecords(rs, m).length).toBe(1)
  })
})

describe('本月回忆 memorySummary', () => {
  it('无记录给空态', () => {
    expect(memorySummary([], ym(new Date())).has).toBe(false)
  })
  it('聚合笔数/金额/心情/结余', () => {
    const m = ym(new Date())
    const rs: Rec[] = [
      rec(dayTs(0), { amount: 32, cat: '咖啡', mood: '😌', note: '拿铁' }),
      rec(dayTs(0), { amount: 26, cat: '吃饭', mood: '😀', note: '便当' }),
      rec(dayTs(1), { type: 'income', amount: 1200, cat: '副业', note: '设计稿' }),
    ]
    const s = memorySummary(rs, m)
    expect(s.has).toBe(true)
    expect(s.count).toBe(2)
    expect(s.total).toBe(58)
    expect(s.topMood).toBe('😌')
    expect(s.inc).toBe(1200)
    expect(s.exp).toBe(58)
    expect(s.net).toBe(1142)
    expect(s.best?.cat).toBe('咖啡')
  })
})

describe('趋势与分类 TOP', () => {
  it('trend30 长度 30 且含今日支出', () => {
    const rs = [rec(dayTs(0), { amount: 55, cat: '购物' })]
    const t = trend30(rs)
    expect(t).toHaveLength(30)
    expect(t.reduce((a, b) => a + b.amt, 0)).toBe(55)
  })
  it('catTop 降序取前 N', () => {
    const m = ym(new Date())
    const rs: Rec[] = [
      rec(dayTs(0), { amount: 300, cat: '购物' }),
      rec(dayTs(0), { amount: 100, cat: '吃饭' }),
      rec(dayTs(0), { amount: 50, cat: '咖啡' }),
    ]
    const top = catTop(rs, m, 2)
    expect(top).toHaveLength(2)
    expect(top[0].cat).toBe('购物')
    expect(top[1].cat).toBe('吃饭')
  })
})
