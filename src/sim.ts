/**
 * Odin Run 2048 simulation.
 *
 * World frame: +x is right, +y is up, forward is −z.
 * The follow camera sits on +z and looks toward −z, so screen-right is +x
 * and a positive strafe moves the ball to the right of the screen.
 */

export const GRAVITY = 24
export const JUMP_V = 8.4
export const STRAFE_SPEED = 9.5
export const SPEED0 = 11
export const SPEED_GAIN = 0.014
export const SPEED_MAX = 20
export const TRACK_HALF = 4.6
export const NARROW_HALF = 1.6
export const SEG = 24
export const AHEAD = 120
export const BEHIND = 28
export const LOCK_DISTANCE = 42

const COYOTE = 0.1
const JUMP_BUFFER = 0.12
const FAST_FALL = 3.1
const INVULN = 0.75
const SPIKE_HY = 0.28
const BARRIER_HY = 0.46
const BLOCK_HY = 1.15
const BLOCK_H = 0.75

export type Status = 'ready' | 'running' | 'dead'
export type Cause = 'spike' | 'fall'
export type Kind = 'ball' | 'spike' | 'barrier' | 'block'
export type EventName = 'jump' | 'merge' | 'hurt' | 'die' | 'win'

export interface Input {
  strafe: number
  jump: boolean
  fastFall: boolean
}

export const IDLE: Input = { strafe: 0, jump: false, fastFall: false }

export interface Body {
  id: number
  kind: Kind
  x: number
  y: number
  z: number
  /** Half extents. For a ball these match `radius`. y is the center. */
  hx: number
  hy: number
  hz: number
  radius: number
  value: number
  alive: boolean
  flying: boolean
  pending: boolean
  vx: number
  vy: number
}

export interface Floor {
  id: number
  /** Far edge (smaller z) and near edge (larger z). z0 < z1. */
  z0: number
  z1: number
  halfWidth: number
}

export interface Player {
  x: number
  y: number
  z: number
  vy: number
  value: number
  grounded: boolean
  radius: number
}

export interface Sim {
  player: Player
  bodies: Body[]
  floors: Floor[]
  status: Status
  cause: Cause | null
  distance: number
  speed: number
  bestValue: number
  bestDistance: number
  time: number
  invuln: number
  pop: number
  coyote: number
  jumpBuffer: number
  jumpHeld: boolean
  announcedWin: boolean
  showWin: boolean
  procedural: boolean
  generatedTo: number
  segmentIndex: number
  nextId: number
  events: EventName[]
  rng: () => number
}

export function radiusFor(value: number): number {
  const tier = Math.log2(value)
  if (!Number.isFinite(tier)) return 0.4
  return 0.4 + (tier - 1) * 0.055
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function base(seed: number, procedural: boolean, bestValue = 0, bestDistance = 0): Sim {
  const radius = radiusFor(2)
  return {
    player: { x: 0, y: radius, z: 0, vy: 0, value: 2, grounded: true, radius },
    bodies: [],
    floors: [],
    status: 'ready',
    cause: null,
    distance: 0,
    speed: SPEED0,
    bestValue,
    bestDistance,
    time: 0,
    invuln: 0,
    pop: 0,
    coyote: COYOTE,
    jumpBuffer: 0,
    jumpHeld: false,
    announcedWin: false,
    showWin: false,
    procedural,
    generatedTo: 0,
    segmentIndex: 0,
    nextId: 1,
    events: [],
    rng: mulberry32(seed),
  }
}

/** Long flat floor and no new segments. Collision tests use this. */
export function createArena(): Sim {
  const sim = base(1, false)
  addFloor(sim, -80, 40, TRACK_HALF)
  return sim
}

/** A full run: opening platform, a short taught stretch, then a procedural track. */
export function createSim(seed = 1, bestValue = 0, bestDistance = 0): Sim {
  const sim = base(seed, true, bestValue, bestDistance)
  addFloor(sim, -4, 16, TRACK_HALF)
  sim.generatedTo = -4
  extend(sim, -AHEAD)
  return sim
}

export function start(sim: Sim) {
  if (sim.status === 'ready') sim.status = 'running'
}

export function restart(sim: Sim, seed: number, jumpHeld: boolean): Sim {
  const next = createSim(seed, sim.bestValue, sim.bestDistance)
  next.jumpHeld = jumpHeld
  next.status = 'running'
  return next
}

export function step(sim: Sim, input: Input, dt: number) {
  if (sim.status !== 'running') return
  sim.events.length = 0
  const edge = input.jump && !sim.jumpHeld
  sim.jumpHeld = input.jump
  let left = Math.min(Math.max(dt, 0), 0.05)
  let first = edge
  while (left > 0 && sim.status === 'running') {
    const slice = Math.min(1 / 120, left)
    stepOnce(sim, input, slice, first)
    first = false
    left -= slice
  }
}

function stepOnce(sim: Sim, input: Input, dt: number, jumpEdge: boolean) {
  const p = sim.player
  sim.time += dt
  if (sim.invuln > 0) sim.invuln -= dt
  if (sim.pop > 0) sim.pop = Math.max(0, sim.pop - dt * 2.5)
  if (sim.jumpBuffer > 0) sim.jumpBuffer -= dt

  lockApproaching(sim)

  const canJump = p.grounded || sim.coyote > 0
  if ((jumpEdge || sim.jumpBuffer > 0) && canJump) {
    p.vy = JUMP_V
    p.grounded = false
    sim.coyote = 0
    sim.jumpBuffer = 0
    sim.events.push('jump')
  } else if (jumpEdge) {
    sim.jumpBuffer = JUMP_BUFFER
  }

  p.x += input.strafe * STRAFE_SPEED * dt

  const gravity = GRAVITY * (input.fastFall && !p.grounded ? FAST_FALL : 1)
  p.vy -= gravity * dt
  p.y += p.vy * dt

  sim.speed = Math.min(SPEED_MAX, SPEED0 + Math.max(0, -p.z) * SPEED_GAIN)
  p.z -= sim.speed * dt
  sim.distance = Math.max(0, -p.z)

  const wasSupported = p.grounded
  snapFloor(sim)
  resolveSolids(sim)
  if (p.grounded) sim.coyote = COYOTE
  else if (wasSupported) sim.coyote = COYOTE
  else sim.coyote = Math.max(0, sim.coyote - dt)

  if (p.y < -2.2) {
    die(sim, 'fall')
    return
  }

  hitHazards(sim)
  if (sim.status !== 'running') return
  mergeBalls(sim)
  resolveSolids(sim)
  integrateFlying(sim, dt)
  cleanup(sim)
  if (sim.procedural) extend(sim, p.z - AHEAD)

  if (sim.distance > sim.bestDistance) sim.bestDistance = sim.distance
}

function die(sim: Sim, cause: Cause) {
  if (sim.status === 'dead') return
  noteValue(sim)
  if (sim.distance > sim.bestDistance) sim.bestDistance = sim.distance
  sim.status = 'dead'
  sim.cause = cause
  sim.events.push('die')
}

function noteValue(sim: Sim) {
  if (sim.player.value > sim.bestValue) sim.bestValue = sim.player.value
}

function applyValue(sim: Sim, value: number) {
  const p = sim.player
  p.value = value
  p.radius = radiusFor(value)
  if (p.y < p.radius) p.y = p.radius
  noteValue(sim)
  if (value >= 2048 && !sim.announcedWin) {
    sim.announcedWin = true
    sim.showWin = true
    sim.events.push('win')
  }
}

function snapFloor(sim: Sim) {
  const p = sim.player
  const supported = floorAt(sim, p.x, p.z) !== null
  if (supported && p.vy <= 0 && p.y <= p.radius + 0.12) {
    p.y = p.radius
    p.vy = 0
    p.grounded = true
    return
  }
  p.grounded = false
}

function floorAt(sim: Sim, x: number, z: number): Floor | null {
  for (const floor of sim.floors) {
    if (z >= floor.z0 && z <= floor.z1 && Math.abs(x) <= floor.halfWidth) return floor
  }
  return null
}

function resolveSolids(sim: Sim) {
  const p = sim.player
  for (let pass = 0; pass < 4; pass++) {
    let hit = false
    for (const body of sim.bodies) {
      if (body.kind !== 'block' || !body.alive) continue
      if (pushOut(p, body)) hit = true
    }
    if (!hit) return
  }
}

/** Smallest-axis separation of the player sphere treated as an expanded box. */
function pushOut(p: Player, b: Body): boolean {
  const dx = p.x - b.x
  const dy = p.y - b.y
  const dz = p.z - b.z
  const px = b.hx + p.radius - Math.abs(dx)
  const py = b.hy + p.radius - Math.abs(dy)
  const pz = b.hz + p.radius - Math.abs(dz)
  if (px <= 0 || py <= 0 || pz <= 0) return false
  if (px < py && px < pz) {
    p.x += Math.sign(dx || 1) * px
  } else if (py < pz) {
    p.y += Math.sign(dy || 1) * py
    if (dy >= 0) {
      if (p.vy < 0) p.vy = 0
      p.grounded = true
    } else if (p.vy > 0) {
      p.vy = 0
    }
  } else {
    p.z += Math.sign(dz || 1) * pz
  }
  return true
}

function sphereHitsBox(p: Player, b: Body): boolean {
  const cx = clamp(p.x, b.x - b.hx, b.x + b.hx)
  const cy = clamp(p.y, b.y - b.hy, b.y + b.hy)
  const cz = clamp(p.z, b.z - b.hz, b.z + b.hz)
  const dx = p.x - cx
  const dy = p.y - cy
  const dz = p.z - cz
  return dx * dx + dy * dy + dz * dz < p.radius * p.radius
}

function hitHazards(sim: Sim) {
  if (sim.invuln > 0) return
  for (const body of sim.bodies) {
    if (!body.alive || (body.kind !== 'spike' && body.kind !== 'barrier')) continue
    if (!sphereHitsBox(sim.player, body)) continue
    if (sim.player.value <= 2) {
      die(sim, 'spike')
      return
    }
    applyValue(sim, sim.player.value / 2)
    sim.invuln = INVULN
    sim.pop = 1
    sim.events.push('hurt')
    return
  }
}

function mergeBalls(sim: Sim) {
  const p = sim.player
  for (const body of sim.bodies) {
    if (body.kind !== 'ball' || !body.alive || body.flying) continue
    if (body.pending) lockBall(sim, body)
    const dx = p.x - body.x
    const dy = p.y - body.y
    const dz = p.z - body.z
    const reach = p.radius + body.radius
    if (dx * dx + dy * dy + dz * dz > reach * reach) continue
    if (body.value === p.value) {
      body.alive = false
      applyValue(sim, p.value * 2)
      sim.pop = 1
      sim.events.push('merge')
    } else {
      body.flying = true
      body.vx = (Math.sign(body.x - p.x) || 1) * 7
      body.vy = 7
    }
  }
}

function integrateFlying(sim: Sim, dt: number) {
  for (const body of sim.bodies) {
    if (!body.flying || !body.alive) continue
    body.vy -= GRAVITY * dt
    body.x += body.vx * dt
    body.y += body.vy * dt
    if (body.y < -3) body.alive = false
  }
}

function cleanup(sim: Sim) {
  const limit = sim.player.z + BEHIND
  sim.bodies = sim.bodies.filter((body) => body.alive && body.z <= limit)
  sim.floors = sim.floors.filter((floor) => floor.z0 <= limit)
}

function lockApproaching(sim: Sim) {
  for (const body of sim.bodies) {
    if (body.kind !== 'ball' || !body.pending || !body.alive) continue
    const ahead = sim.player.z - body.z
    if (ahead > 0 && ahead <= LOCK_DISTANCE) lockBall(sim, body)
  }
}

function lockBall(sim: Sim, body: Body) {
  const current = sim.player.value
  const pick = Math.abs((body.id * 17) ^ current) % 10
  let value = current
  if (pick >= 8) value = Math.min(4096, current * 2)
  else if (pick >= 6) value = Math.max(2, current / 2)
  body.value = value
  body.radius = radiusFor(value)
  body.y = body.radius
  body.hx = body.radius
  body.hy = body.radius
  body.hz = body.radius
  body.pending = false
}

export function extend(sim: Sim, zAhead: number) {
  if (!sim.procedural) return
  let guard = 0
  while (sim.generatedTo > zAhead && guard++ < 500) addSegment(sim)
}

function addSegment(sim: Sim) {
  const index = sim.segmentIndex++
  const z1 = sim.generatedTo
  const z0 = z1 - SEG
  sim.generatedTo = z0
  const mid = (z0 + z1) / 2

  if (index === 0) {
    addFloor(sim, z0, z1, TRACK_HALF)
    spawnBall(sim, 0, mid, 2)
    return
  }
  if (index === 1) {
    addFloor(sim, z0, z1, TRACK_HALF)
    spawnBall(sim, 0, mid, 4)
    return
  }
  if (index === 2) {
    addFloor(sim, z0, z1, TRACK_HALF)
    spawnHazard(sim, 'spike', z0 + 8, -TRACK_HALF + 0.25, TRACK_HALF - 0.25)
    return
  }
  if (index === 3) {
    addFloor(sim, z0, z1, TRACK_HALF)
    spawnBlock(sim, -2.4, mid)
    spawnBall(sim, 2.2, mid, 8)
    return
  }

  addProcedural(sim, z0, z1, -z0)
}

function addProcedural(sim: Sim, z0: number, z1: number, dist: number) {
  const roll = sim.rng()
  const mid = (z0 + z1) / 2

  if (roll < 0.18 && dist > 140) {
    const gap = 3.5 + sim.rng() * 1.2
    const lead = 8
    const trail = SEG - lead - gap
    addFloor(sim, z1 - lead, z1, TRACK_HALF)
    addFloor(sim, z0, z0 + trail, TRACK_HALF)
    tryBall(sim, 0, z0 + trail * 0.5)
    return
  }

  if (roll < 0.36 && dist > 200) {
    addFloor(sim, z0, z1, NARROW_HALF)
    if (sim.rng() < 0.6) {
      spawnHazard(sim, 'spike', mid, -NARROW_HALF + 0.15, NARROW_HALF - 0.15)
    }
    return
  }

  addFloor(sim, z0, z1, TRACK_HALF)

  if (roll < 0.68) {
    const full = sim.rng() < 0.45
    const kind: 'spike' | 'barrier' = sim.rng() < 0.7 ? 'spike' : 'barrier'
    if (full) {
      spawnHazard(sim, kind, mid, -TRACK_HALF + 0.25, TRACK_HALF - 0.25)
      tryBall(sim, 0, mid + 6)
    } else if (sim.rng() < 0.5) {
      spawnHazard(sim, kind, mid, -TRACK_HALF + 0.25, 0.6)
      tryBall(sim, 2.4, mid)
    } else {
      spawnHazard(sim, kind, mid, -0.6, TRACK_HALF - 0.25)
      tryBall(sim, -2.4, mid)
    }
    return
  }

  if (roll < 0.86) {
    const x = sim.rng() < 0.5 ? -2.4 : 2.4
    spawnBlock(sim, x, mid)
    tryBall(sim, -x, mid)
    return
  }

  const lanes = [-2.4, 0, 2.4]
  const count = 1 + Math.floor(sim.rng() * 3)
  for (let i = 0; i < count; i++) tryBall(sim, lanes[i], mid + (i - 1) * 3.2)
}

function tryBall(sim: Sim, x: number, z: number) {
  const radius = radiusFor(2)
  if (!clearSpot(sim, x, z, radius)) return
  const body = spawnBall(sim, x, z, 2)
  body.pending = true
  body.value = 0
}

function clearSpot(sim: Sim, x: number, z: number, radius: number): boolean {
  for (const body of sim.bodies) {
    if (!body.alive || body.kind === 'ball') continue
    const dx = Math.abs(x - body.x)
    const dz = Math.abs(z - body.z)
    if (dx < radius + body.hx + 0.45 && dz < radius + body.hz + 0.45) return false
  }
  return true
}

function addFloor(sim: Sim, z0: number, z1: number, halfWidth: number) {
  sim.floors.push({ id: sim.nextId++, z0, z1, halfWidth })
}

export function spawnBall(sim: Sim, x: number, z: number, value: number): Body {
  const radius = radiusFor(value)
  const body: Body = {
    id: sim.nextId++,
    kind: 'ball',
    x,
    y: radius,
    z,
    hx: radius,
    hy: radius,
    hz: radius,
    radius,
    value,
    alive: true,
    flying: false,
    pending: false,
    vx: 0,
    vy: 0,
  }
  sim.bodies.push(body)
  return body
}

export function spawnHazard(
  sim: Sim,
  kind: 'spike' | 'barrier',
  z: number,
  x0: number,
  x1: number,
): Body {
  const hy = kind === 'spike' ? SPIKE_HY : BARRIER_HY
  const body: Body = {
    id: sim.nextId++,
    kind,
    x: (x0 + x1) / 2,
    y: hy,
    z,
    hx: (x1 - x0) / 2,
    hy,
    hz: 0.6,
    radius: 0,
    value: 0,
    alive: true,
    flying: false,
    pending: false,
    vx: 0,
    vy: 0,
  }
  sim.bodies.push(body)
  return body
}

export function spawnBlock(sim: Sim, x: number, z: number): Body {
  const body: Body = {
    id: sim.nextId++,
    kind: 'block',
    x,
    y: BLOCK_HY,
    z,
    hx: BLOCK_H,
    hy: BLOCK_HY,
    hz: BLOCK_H,
    radius: 0,
    value: 0,
    alive: true,
    flying: false,
    pending: false,
    vx: 0,
    vy: 0,
  }
  sim.bodies.push(body)
  return body
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/** Unsupported runs along x = 0, in world units. Used by the track tests. */
export function gapLengths(sim: Sim, zMax: number, zMin: number, sample = 0.25): number[] {
  const runs: number[] = []
  let run = 0
  for (let z = zMax; z > zMin; z -= sample) {
    const on = sim.floors.some((floor) => z >= floor.z0 && z <= floor.z1 && floor.halfWidth >= 1)
    if (on) {
      if (run > 0) runs.push(run)
      run = 0
    } else {
      run += sample
    }
  }
  if (run > 0) runs.push(run)
  return runs
}
