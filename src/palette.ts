/** Fill and label colors for each merge tier. Original ramp in the 2048 family. */
export interface TierStyle {
  fill: string
  text: string
}

const TIERS: Record<number, TierStyle> = {
  2: { fill: '#eee4da', text: '#776e65' },
  4: { fill: '#ede0c8', text: '#776e65' },
  8: { fill: '#f2b179', text: '#f9f6f2' },
  16: { fill: '#f59563', text: '#f9f6f2' },
  32: { fill: '#f67c5f', text: '#f9f6f2' },
  64: { fill: '#f65e3b', text: '#f9f6f2' },
  128: { fill: '#edcf72', text: '#f9f6f2' },
  256: { fill: '#edcc61', text: '#f9f6f2' },
  512: { fill: '#edc850', text: '#f9f6f2' },
  1024: { fill: '#edc53f', text: '#f9f6f2' },
  2048: { fill: '#edc22e', text: '#f9f6f2' },
  4096: { fill: '#3c3a32', text: '#f9f6f2' },
}

export const SKY = '#120818'

export function styleFor(value: number): TierStyle {
  if (value < 2) return { fill: '#d5d5e2', text: '#5c5c70' }
  return TIERS[value] ?? TIERS[4096]
}
