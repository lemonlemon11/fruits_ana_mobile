export const GRADE_META = {
  A: { label: 'A果', color: '#2E9E6B' },
  B: { label: 'B果', color: '#E0A83C' },
  AB: { label: 'AB果', color: '#8a6f2f' },
  C: { label: 'C果', color: '#D97757' },
  D: { label: 'D果', color: '#2f6f8f' },
  E: { label: 'E果', color: '#7a5aa6' },
  F: { label: 'F果', color: '#b34f82' },
  OTHER: { label: '其他', color: '#6e7780' },
}

export function gradeLabel(grade) {
  return GRADE_META[grade]?.label ?? grade
}

export function gradeColor(grade) {
  return GRADE_META[grade]?.color ?? '#6e7780'
}

export function money(value, digits = 0) {
  const num = Number(value ?? 0)
  return `¥${num.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function compactMoney(value) {
  const num = Number(value ?? 0)
  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(num)
  if (abs >= 100000000) return `${sign}¥${(abs / 100000000).toFixed(1)}亿`
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(1)}万`
  return money(num)
}

export function signedPercent(value, digits = 1) {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num) || num === 0) return null
  return `${num > 0 ? '+' : ''}${(num * 100).toFixed(digits)}%`
}

export function number(value) {
  return Number(value ?? 0).toLocaleString('zh-CN')
}

export function price(value) {
  return `¥${Number(value ?? 0).toFixed(2)}`
}

export function percent(value) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`
}

export function avgPrice(amount, quantity) {
  if (!quantity) return null
  return Number(amount) / Number(quantity)
}
