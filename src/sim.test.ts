import { describe, expect, it } from 'vitest'
import {
  IDLE,
  LOCK_DISTANCE,
  createArena,
  createSim,
  extend,
  gapLengths,
  radiusFor,
  spawnBall,
  spawnBlock,
  spawnHazard,
  start,
  step,
  type Input,
  type Sim,
} from './sim'

const JUMP: Input = { strafe: 0, jump: true, fastFall: false }
const LEFT: Input = { strafe: -1, jump: false, fastFall: false }
const RIGHT: Input = { strafe: 1, jump: false, fastFall: false }
const FALL: Input = { strafe: 0, jump: false, fastFall: true }

function run(sim: Sim, input: Input, seconds: number, dt = 1 / 60) {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) step(sim, input, dt)
}

describe('radius', () => {
  it('grows with the tier and still fits a narrow bridge', () => {
    expect(radiusFor(2)).toBeCloseTo(0.4)
    expect(radiusFor(2048)).toBeGreaterThan(radiusFor(2))
    expect(radiusFor(2048)).toBeLessThan(1.6)
  })
})

describe('movement', () => {
  it('strafes right on +x and left on −x while rolling toward −z', () => {
    const right = createArena()
    const left = createArena()
    start(right)
    start(left)
    run(right, RIGHT, 0.4)
    run(left, LEFT, 0.4)
    expect(right.player.x).toBeGreaterThan(2)
    expect(left.player.x).toBeLessThan(-2)
    expect(right.player.z).toBeLessThan(-2)
    expect(left.player.z).toBeLessThan(-2)
  })

  it('jumps up and lands back on the floor', () => {
    const sim = createArena()
    start(sim)
    run(sim, JUMP, 0.2)
    expect(sim.player.y).toBeGreaterThan(sim.player.radius + 0.5)
    expect(sim.player.grounded).toBe(false)
    run(sim, IDLE, 1)
    expect(sim.player.grounded).toBe(true)
    expect(sim.player.y).toBeCloseTo(sim.player.radius, 1)
    expect(sim.status).toBe('running')
  })

  it('fast-fall cuts the jump short', () => {
    const coast = createArena()
    const fast = createArena()
    start(coast)
    start(fast)
    step(coast, JUMP, 1 / 60)
    step(fast, JUMP, 1 / 60)
    run(coast, IDLE, 0.18)
    run(fast, IDLE, 0.18)
    run(coast, IDLE, 0.2)
    run(fast, FALL, 0.2)
    expect(fast.player.y).toBeLessThan(coast.player.y - 0.15)
  })

  it('does not move forward any faster because of a jump', () => {
    const jumping = createArena()
    const running = createArena()
    start(jumping)
    start(running)
    run(jumping, JUMP, 0.4)
    run(running, IDLE, 0.4)
    expect(jumping.player.y).toBeGreaterThan(running.player.y + 0.3)
    expect(Math.abs(jumping.player.z - running.player.z)).toBeLessThan(0.05)
  })
})

describe('merge and hazards', () => {
  it('doubles when it touches a ball of the same number', () => {
    const sim = createArena()
    spawnBall(sim, 0, -3, 2)
    start(sim)
    run(sim, IDLE, 0.6)
    expect(sim.player.value).toBe(4)
    expect(sim.player.radius).toBeCloseTo(radiusFor(4))
    expect(sim.status).toBe('running')
  })

  it('knocks aside a ball of a different number', () => {
    const sim = createArena()
    const other = spawnBall(sim, 0, -3, 8)
    start(sim)
    run(sim, IDLE, 0.6)
    expect(sim.player.value).toBe(2)
    expect(other.flying || !other.alive).toBe(true)
  })

  it('drops a tier on a spike and ends the run at 2', () => {
    const hurt = createArena()
    hurt.player.value = 4
    hurt.player.radius = radiusFor(4)
    hurt.player.y = hurt.player.radius
    spawnHazard(hurt, 'spike', -3, -4, 4)
    start(hurt)
    run(hurt, IDLE, 0.8)
    expect(hurt.player.value).toBe(2)
    expect(hurt.status).toBe('running')

    const dead = createArena()
    spawnHazard(dead, 'spike', -3, -4, 4)
    start(dead)
    run(dead, IDLE, 0.8)
    expect(dead.status).toBe('dead')
    expect(dead.cause).toBe('spike')
  })

  it('clears a spike with a jump', () => {
    const sim = createArena()
    spawnHazard(sim, 'spike', -4, -4, 4)
    start(sim)
    run(sim, JUMP, 1.2)
    expect(sim.player.z).toBeLessThan(-6)
    expect(sim.player.value).toBe(2)
    expect(sim.status).toBe('running')
  })

  it('falls when the floor ends', () => {
    const sim = createArena()
    sim.floors[0].z0 = -2
    start(sim)
    run(sim, IDLE, 2.5)
    expect(sim.status).toBe('dead')
    expect(sim.cause).toBe('fall')
  })

  it('keeps a centered block from ending the run, and strafing gets past it', () => {
    const open = createArena()
    const blocked = createArena()
    spawnBlock(blocked, 0, -6)
    start(open)
    start(blocked)
    run(open, IDLE, 0.8)
    run(blocked, IDLE, 0.8)
    const stopped = blocked.player.z > open.player.z + 0.5
    const shoved = Math.abs(blocked.player.x) > 0.4
    expect(stopped || shoved).toBe(true)
    expect(blocked.status).toBe('running')
    expect(blocked.player.value).toBe(2)
    const dt = 1 / 60
    for (let i = 0; i < 180 && blocked.status === 'running'; i++) {
      const clear = Math.abs(blocked.player.x) > 0.75 + blocked.player.radius + 0.15
      const nearEdge = Math.abs(blocked.player.x) > 3.4
      step(blocked, clear || nearEdge ? IDLE : RIGHT, dt)
    }
    expect(blocked.player.z).toBeLessThan(-8)
    expect(blocked.status).toBe('running')
  })

  it('celebrates 2048 and keeps the run going', () => {
    const sim = createArena()
    sim.player.value = 1024
    sim.player.radius = radiusFor(1024)
    sim.player.y = sim.player.radius
    spawnBall(sim, 0, -3, 1024)
    start(sim)
    run(sim, IDLE, 0.8)
    expect(sim.player.value).toBe(2048)
    expect(sim.announcedWin).toBe(true)
    expect(sim.showWin).toBe(true)
    expect(sim.status).toBe('running')
  })

  it('survives the opener when the spike is jumped', () => {
    const sim = createSim(1)
    start(sim)
    const dt = 1 / 60
    for (let i = 0; i < 60 * 12 && sim.status === 'running' && sim.distance < 95; i++) {
      const ahead = sim.bodies.some((body) => {
        if (body.kind !== 'spike' && body.kind !== 'barrier') return false
        const gap = sim.player.z - body.z
        return gap > 3.2 && gap < 5.4
      })
      step(sim, { strafe: 0, jump: ahead, fastFall: false }, dt)
    }
    expect(sim.cause).toBeNull()
    expect(sim.status).toBe('running')
    expect(sim.player.value).toBeGreaterThanOrEqual(8)
  })

  it('locks an approaching ball to the value the player has now', () => {
    const sim = createSim(1)
    start(sim)
    const pending = sim.bodies.find((body) => body.kind === 'ball' && body.pending)
    expect(pending).toBeTruthy()
    sim.player.value = 32
    sim.player.radius = radiusFor(32)
    sim.player.y = sim.player.radius
    sim.player.z = pending!.z + LOCK_DISTANCE - 1
    step(sim, IDLE, 1 / 60)
    const locked = sim.bodies.find((body) => body.id === pending!.id)
    expect(locked?.pending).toBe(false)
    expect([16, 32, 64]).toContain(locked?.value)
  })
})

describe('track', () => {
  it('teaches merge then a spike, and keeps gaps jumpable', () => {
    for (const seed of [1, 2, 7, 99]) {
      const sim = createSim(seed)
      extend(sim, -700)
      expect(sim.bodies.some((body) => body.kind === 'ball' && body.value === 2)).toBe(true)
      expect(sim.bodies.some((body) => body.kind === 'spike' || body.kind === 'barrier')).toBe(true)
      const gaps = gapLengths(sim, 12, sim.generatedTo + 1)
      expect(Math.max(0, ...gaps)).toBeLessThanOrEqual(5.2)

      for (const ball of sim.bodies) {
        if (ball.kind !== 'ball') continue
        for (const hazard of sim.bodies) {
          if (hazard.kind !== 'spike' && hazard.kind !== 'barrier' && hazard.kind !== 'block') continue
          const dx = Math.abs(ball.x - hazard.x)
          const dz = Math.abs(ball.z - hazard.z)
          const separated = dx > ball.radius + hazard.hx + 0.2 || dz > ball.radius + hazard.hz + 0.2
          expect(separated, `ball ${ball.id} overlaps ${hazard.kind} ${hazard.id}`).toBe(true)
        }
      }
    }
  })

  it('sits hazards on the floor', () => {
    const sim = createArena()
    const spike = spawnHazard(sim, 'spike', -5, -2, 2)
    const barrier = spawnHazard(sim, 'barrier', -8, -2, 2)
    const block = spawnBlock(sim, 0, -10)
    const ball = spawnBall(sim, 1, -12, 16)
    expect(spike.y - spike.hy).toBeCloseTo(0)
    expect(barrier.y - barrier.hy).toBeCloseTo(0)
    expect(block.y - block.hy).toBeCloseTo(0)
    expect(ball.y).toBeCloseTo(ball.radius)
  })
})
