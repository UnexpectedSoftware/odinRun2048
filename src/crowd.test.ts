import { describe, expect, it } from 'vitest'
import { shove, type BallPose } from './crowd'

function ball(x: number, y: number, z: number, radius: number): BallPose {
  return { x, y, z, radius }
}

describe('shove', () => {
  it('splits an equal side overlap and adds a push', () => {
    const left = ball(0, 0.4, 0, 0.4)
    const right = ball(0.7, 0.4, 0, 0.4)
    const fromRight = shove(left, right)
    const fromLeft = shove(right, left)
    expect(fromRight.x).toBeLessThan(0)
    expect(fromLeft.x).toBeGreaterThan(0)
    expect(Math.abs(fromRight.x)).toBeCloseTo(Math.abs(fromLeft.x))
    expect(Math.abs(fromRight.x) + Math.abs(fromLeft.x)).toBeGreaterThanOrEqual(0.1)
    expect(fromRight.y).toBe(0)
  })

  it('lets the bigger ball move the smaller one farther', () => {
    const small = ball(0, 0.4, 0, 0.4)
    const big = ball(1.15, 0.4, 0, 0.8)
    const smallMove = shove(small, big)
    const bigMove = shove(big, small)
    expect(Math.abs(smallMove.x)).toBeGreaterThan(Math.abs(bigMove.x) * 2)
  })

  it('does nothing when the balls are apart', () => {
    expect(shove(ball(0, 0.4, 0, 0.4), ball(2, 0.4, 0, 0.4))).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('keeps a side bump on the road', () => {
    const move = shove(ball(0, 0.4, 0, 0.4), ball(0.6, 0.55, 0, 0.4))
    expect(move.y).toBe(0)
    expect(move.x).toBeLessThan(0)
  })

  it('separates a ball that lands on another', () => {
    const lower = shove(ball(0, 0.4, 0, 0.4), ball(0, 1.0, 0, 0.4))
    const upper = shove(ball(0, 1.0, 0, 0.4), ball(0, 0.4, 0, 0.4))
    expect(lower.y).toBeLessThan(0)
    expect(upper.y).toBeGreaterThan(0)
  })
})
