// ISO time → HH:MM at `tz` minutes east of UTC (the module's own clock may not know the zone).
export function hhmm(iso: string, tz: number): string {
  const d = new Date(Date.parse(iso) + tz * 60_000)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// Never throws: a bad done/total read back from disk (negative, NaN, total 0) draws an empty or full bar.
export function bar(done: number, total: number, width: number): string {
  const ratio = total > 0 ? done / total : 0
  const filled = Number.isFinite(ratio) ? Math.min(width, Math.max(0, Math.round(ratio * width))) : 0
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const elapsed = (ms?: number) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export const tokens = (n?: number) => (typeof n !== 'number' || !Number.isFinite(n) ? '' : n >= 1000 ? `${Math.round(n / 1000)}k tokens` : `${n} tokens`)
