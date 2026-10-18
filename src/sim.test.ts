import { describe, expect, it } from 'vitest'
import {
  IDLE,
  LOCK_DISTANCE,
  SPEED0,
  catchRaceClock,
  createArena,
  createSim,
  cruiseSpeed,
  cruiseZ,
  extend,
  gapLengths,
  presentFriend,
  radiusFor,
  roadZ,
  spawnBall,
  spawnBlock,
  spawnHazard,
  start,
  step,
  type Input,
  type Remote,
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

describe('shared pace', () => {
  it('rolls the same distance at 20Hz and 120Hz', () => {
    expect(cruiseZ(0)).toBe(0)
    expect(cruiseSpeed(0)).toBeCloseTo(SPEED0)
    const dt = 1 / 1000
    for (const t of [0, 1, 10, 30, 50, 80]) {
      const numeric = (cruiseZ(t + dt) - cruiseZ(t)) / dt
      expect(numeric).toBeCloseTo(-cruiseSpeed(t), 1)
    }
    const slow = createArena()
    const fast = createArena()
    start(slow)
    start(fast)
    run(slow, IDLE, 4, 1 / 20)
    run(fast, IDLE, 4, 1 / 120)
    expect(slow.player.z).toBeCloseTo(cruiseZ(4), 4)
    expect(fast.player.z).toBeCloseTo(slow.player.z, 4)
  })

  it('puts a friend who is seconds ahead on their clock onto our z', () => {
    const localTime = 3
    const friendTime = 7
    const worldZ = cruiseZ(friendTime)
    expect(worldZ).toBeLessThan(cruiseZ(localTime) - 20)
    expect(roadZ(localTime, friendTime, worldZ)).toBeCloseTo(cruiseZ(localTime), 4)
    expect(roadZ(localTime, friendTime, worldZ + 2)).toBeCloseTo(cruiseZ(localTime) + 2, 4)
  })

  it('meets that friend, so the balls can shove', () => {
    const sim = createArena()
    start(sim)
    run(sim, IDLE, 0.75)
    const friendTime = sim.time + 4
    const worldZ = cruiseZ(friendTime)
    expect(Math.abs(worldZ - sim.player.z)).toBeGreaterThan(20)
    const z = roadZ(sim.time, friendTime, worldZ)
    expect(z).toBeCloseTo(sim.player.z, 4)
    sim.remotes = [friend({ x: 0.45, y: sim.player.y, z, radius: sim.player.radius })]
    const x = sim.player.x
    step(sim, IDLE, 1 / 60)
    expect(Math.abs(sim.player.x - x)).toBeGreaterThan(0.02)
  })

  it('keeps a fallen friend where they fell, and a spectator on the sent z', () => {
    const fallen = { time: 5, z: cruiseZ(5) - 1.5, alive: false }
    const first = presentFriend(5, true, fallen, undefined)
    expect(first.z).toBeCloseTo(cruiseZ(5) - 1.5, 4)
    const later = presentFriend(8, true, fallen, first.heldZ)
    expect(later.z).toBeCloseTo(first.z, 5)
    const live = presentFriend(2, true, { time: 6, z: cruiseZ(6), alive: true }, 4)
    expect(live.z).toBeCloseTo(cruiseZ(2), 4)
    expect(live.heldZ).toBeUndefined()
    expect(presentFriend(8, false, { time: 9, z: -40, alive: true }, undefined).z).toBe(-40)
  })

  it('catches a late guest up toward the host clock and does not rewind', () => {
    const sim = createArena()
    start(sim)
    run(sim, IDLE, 1)
    const behind = sim.time
    const z = sim.player.z
    catchRaceClock(sim, behind - 1, 1)
    expect(sim.time).toBeCloseTo(behind)
    expect(sim.player.z).toBeCloseTo(z)
    catchRaceClock(sim, behind + 1, 1)
    expect(sim.time).toBeGreaterThan(behind + 0.1)
    expect(sim.time).toBeLessThan(behind + 0.5)
    expect(sim.player.z).toBeLessThan(z)
  })
})

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

function friend(over: Partial<Remote> = {}): Remote {
  return {
    id: 'friend',
    x: 0,
    y: 0.4,
    z: 0,
    vy: 0,
    value: 2,
    radius: 0.4,
    alive: true,
    skin: 'visor',
    ...over,
  }
}

describe('friends', () => {
  it('shoves the player aside when a bigger friend overlaps', () => {
    const sim = createArena()
    start(sim)
    sim.remotes = [friend({ x: 0.55, y: sim.player.radius, radius: 1.1, value: 64 })]
    step(sim, IDLE, 1 / 60)
    expect(sim.player.x).toBeLessThan(-0.15)
  })

  it('locks a pending ball to the closer friend on the host', () => {
    const sim = createSim(1)
    sim.authority = 'host'
    start(sim)
    const pending = sim.bodies.find((body) => body.kind === 'ball' && body.pending)
    expect(pending).toBeTruthy()
    sim.player.z = pending!.z + 30
    sim.remotes = [friend({ x: pending!.x, z: pending!.z + 8, value: 16, radius: radiusFor(16) })]
    step(sim, IDLE, 1 / 60)
    const locked = sim.bodies.find((body) => body.id === pending!.id)
    expect(locked?.pending).toBe(false)
    expect([8, 16, 32]).toContain(locked?.value)
  })

  it('does not lock balls on a guest', () => {
    const sim = createSim(1)
    sim.authority = 'guest'
    start(sim)
    const pending = sim.bodies.find((body) => body.kind === 'ball' && body.pending)
    expect(pending).toBeTruthy()
    sim.player.z = pending!.z + LOCK_DISTANCE - 1
    sim.player.value = 32
    step(sim, IDLE, 1 / 60)
    expect(sim.bodies.find((body) => body.id === pending!.id)?.pending).toBe(true)
  })

  it('keeps a ball a trailing friend has not passed', () => {
    const sim = createArena()
    start(sim)
    sim.player.z = -50
    const kept = spawnBall(sim, 0, -10, 2)
    sim.remotes = [friend({ z: -5 })]
    step(sim, IDLE, 1 / 60)
    expect(sim.bodies.some((body) => body.id === kept.id)).toBe(true)

    const alone = createArena()
    start(alone)
    alone.player.z = -50
    const dropped = spawnBall(alone, 0, -10, 2)
    step(alone, IDLE, 1 / 60)
    expect(alone.bodies.some((body) => body.id === dropped.id)).toBe(false)
  })

  it('builds road ahead of a faster friend', () => {
    const sim = createSim(3)
    start(sim)
    const before = sim.generatedTo
    sim.remotes = [friend({ z: sim.player.z - 80 })]
    step(sim, IDLE, 1 / 60)
    expect(sim.generatedTo).toBeLessThan(before - 70)
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
