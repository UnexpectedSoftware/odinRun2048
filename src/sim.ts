/**
 * Odin Run 2048 simulation.
 *
 * World frame: +x is right, +y is up, forward is −z.
 * The follow camera sits on +z and looks toward −z, so screen-right is +x
 * and a positive strafe moves the ball to the right of the screen.
 */

import { shove } from './crowd'

/**
 * Forward motion is a shared function of race time, so two browsers on one
 * road stay on the same z. Integrating each display's frame clock does not:
 * a late start or a dropped frame leaves one ball behind, and because speed
 * grows with distance that gap keeps opening until the balls never meet.
 * In a room the cruise is the whole depth: bumps and blocks move a ball
 * sideways, never ahead of the other racers.
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
export type Authority = 'solo' | 'host' | 'guest'

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

/** A friend on the same road. Poses are filled in by the match, not by step. */
export interface Remote {
  id: string
  x: number
  y: number
  z: number
  vy: number
  value: number
  radius: number
  alive: boolean
  skin: string
}

export interface BallTake {
  id: number
  valueBefore: number
}

export interface BallLock {
  id: number
  value: number
}

export interface BallKnock {
  id: number
  vx: number
  vy: number
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
  remotes: Remote[]
  authority: Authority
  merges: BallTake[]
  locks: BallLock[]
  knocks: BallKnock[]
  /** Ball ids the host already gave away, including ones this client has not spawned yet. */
  removed: Set<number>
  /** Optimistic merges kept in the world until the host agrees. */
  held: Set<number>
  /** Locks that arrived before this client generated the ball. */
  pendingLocks: Map<number, number>
  /** Network id of this client. Ties in a sideways bump use it so both browsers agree. */
  playerId: string
}

export function radiusFor(value: number): number {
  const tier = Math.log2(value)
  if (!Number.isFinite(tier)) return 0.4
  return 0.4 + (tier - 1) * 0.055
}

/** Seconds of race time until the cruise hits SPEED_MAX. */
function cruiseCapTime(): number {
  return Math.log(SPEED_MAX / SPEED0) / SPEED_GAIN
}

/** World z after `time` seconds of free running, starting from z = 0. */
export function cruiseZ(time: number): number {
  if (time <= 0) return 0
  const cap = cruiseCapTime()
  if (time >= cap) {
    const zCap = (SPEED0 - SPEED_MAX) / SPEED_GAIN
    return zCap - SPEED_MAX * (time - cap)
  }
  return (SPEED0 / SPEED_GAIN) * (1 - Math.exp(SPEED_GAIN * time))
}

/** Forward speed (positive) at a race time. dz/dt = -cruiseSpeed(time). */
export function cruiseSpeed(time: number): number {
  if (time <= 0) return SPEED0
  if (time >= cruiseCapTime()) return SPEED_MAX
  return SPEED0 * Math.exp(SPEED_GAIN * time)
}

/**
 * Map a friend's world z onto our clock.
 * Live racers do not use the offset: they sit on `cruiseZ` of one shared
 * clock. A fallen friend keeps it, so the body stays where it left the road.
 */
export function roadZ(localTime: number, friendTime: number, friendWorldZ: number): number {
  return cruiseZ(localTime) + (friendWorldZ - cruiseZ(friendTime))
}

export interface FriendPlace {
  time: number
  z: number
  alive: boolean
}

/**
 * One depth for every living ball on this client.
 * Racers use the local clock. A spectator uses the lead friend's clock, so a
 * room that is a few seconds apart still draws one line of balls.
 */
export function liveLineZ(localTime: number, friendTimes: readonly number[], racing: boolean): number {
  if (racing) return cruiseZ(localTime)
  let lead = localTime
  for (const time of friendTimes) if (time > lead) lead = time
  return cruiseZ(lead)
}

/**
 * Draw and shove a friend on our road while we are racing.
 * A live friend is pulled onto our cruise depth, even when their packet is
 * ahead or behind. A fallen friend keeps the z of the first time we saw them
 * down. Outside a race, the sent z is returned and the match lines living
 * friends up with `liveLineZ`.
 */
export function presentFriend(
  localTime: number,
  racing: boolean,
  friend: FriendPlace,
  heldZ: number | undefined,
): { z: number; heldZ: number | undefined } {
  if (!racing) return { z: friend.z, heldZ: undefined }
  if (!friend.alive) {
    const z = heldZ ?? roadZ(localTime, friend.time, friend.z)
    return { z, heldZ: z }
  }
  return { z: cruiseZ(localTime), heldZ: undefined }
}

/**
 * Move a guest's race clock toward the host's, forward only.
 * The host packet is already late, so rewinding would rubber-band the ball.
 */
export function catchRaceClock(sim: Sim, hostTime: number, dt: number) {
  if (sim.status !== 'running') return
  const error = hostTime - sim.time
  if (error <= 0.02) return
  const rate = error > 0.75 ? 0.45 : 0.2
  const correction = Math.min(rate * dt, error)
  const slip = sim.authority === 'solo' ? sim.player.z - cruiseZ(sim.time) : 0
  sim.time += correction
  sim.player.z = cruiseZ(sim.time) + slip
  sim.distance = Math.max(sim.distance, Math.max(0, -sim.player.z))
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
    remotes: [],
    authority: 'solo',
    merges: [],
    locks: [],
    knocks: [],
    removed: new Set(),
    held: new Set(),
    pendingLocks: new Map(),
    playerId: '',
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
  sim.merges.length = 0
  sim.locks.length = 0
  sim.knocks.length = 0
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
  if (sim.status === 'running') shoveRemotes(sim)
}

function stepOnce(sim: Sim, input: Input, dt: number, jumpEdge: boolean) {
  const p = sim.player
  // Multiplayer depth is the cruise itself. A block or a bump must not leave
  // a slip that puts this ball ahead of the others.
  const slip = sim.authority === 'solo' ? p.z - cruiseZ(sim.time) : 0
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

  sim.speed = cruiseSpeed(sim.time)
  p.z = cruiseZ(sim.time) + slip
  sim.distance = Math.max(0, -p.z)

  const wasSupported = p.grounded
  snapFloor(sim)
  resolveSolids(sim)
  if (sim.authority !== 'solo') p.z = cruiseZ(sim.time)
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
  if (sim.procedural) extend(sim, leadZ(sim) - AHEAD)

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
  const lockForward = sim.authority !== 'solo'
  for (let pass = 0; pass < 4; pass++) {
    let hit = false
    for (const body of sim.bodies) {
      if (body.kind !== 'block' || !body.alive) continue
      if (pushOut(p, body, lockForward)) hit = true
    }
    if (!hit) return
  }
}

/** Smallest-axis separation of the player sphere treated as an expanded box. */
function pushOut(p: Player, b: Body, lockForward: boolean): boolean {
  const dx = p.x - b.x
  const dy = p.y - b.y
  const dz = p.z - b.z
  const px = b.hx + p.radius - Math.abs(dx)
  const py = b.hy + p.radius - Math.abs(dy)
  const pz = b.hz + p.radius - Math.abs(dz)
  if (px <= 0 || py <= 0 || pz <= 0) return false
  const alongX = () => {
    p.x += Math.sign(dx || 1) * px
  }
  const alongY = () => {
    p.y += Math.sign(dy || 1) * py
    if (dy >= 0) {
      if (p.vy < 0) p.vy = 0
      p.grounded = true
    } else if (p.vy > 0) {
      p.vy = 0
    }
  }
  if (lockForward) {
    // Shared depth. Land on a block, otherwise slide off it sideways.
    if (dy > 0 && py <= px) alongY()
    else alongX()
    return true
  }
  if (px < py && px < pz) alongX()
  else if (py < pz) alongY()
  else p.z += Math.sign(dz || 1) * pz
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
    if (body.pending) {
      if (sim.authority === 'guest') continue
      lockBall(sim, body, sim.player.value)
    }
    const dx = p.x - body.x
    const dy = p.y - body.y
    const dz = p.z - body.z
    const reach = p.radius + body.radius
    if (dx * dx + dy * dy + dz * dz > reach * reach) continue
    if (body.value === p.value) {
      const valueBefore = p.value
      body.alive = false
      sim.removed.add(body.id)
      if (sim.authority === 'guest') sim.held.add(body.id)
      applyValue(sim, p.value * 2)
      sim.merges.push({ id: body.id, valueBefore })
      sim.pop = 1
      sim.events.push('merge')
    } else {
      body.flying = true
      body.vx = (Math.sign(body.x - p.x) || 1) * 7
      body.vy = 7
      sim.knocks.push({ id: body.id, vx: body.vx, vy: body.vy })
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
  const limit = trailZ(sim) + BEHIND
  sim.bodies = sim.bodies.filter((body) => (body.alive || sim.held.has(body.id)) && body.z <= limit)
  sim.floors = sim.floors.filter((floor) => floor.z0 <= limit)
}

/** Keep generating while a friend is ahead, and keep balls a friend behind still needs. */
export function catchUp(sim: Sim) {
  if (sim.procedural) extend(sim, leadZ(sim) - AHEAD)
}

function leadZ(sim: Sim): number {
  let z = sim.player.z
  for (const remote of sim.remotes) if (remote.alive) z = Math.min(z, remote.z)
  return z
}

function trailZ(sim: Sim): number {
  let z = sim.player.z
  for (const remote of sim.remotes) if (remote.alive) z = Math.max(z, remote.z)
  return z
}

function shoveRemotes(sim: Sim) {
  const player = sim.player
  const lockForward = sim.authority !== 'solo'
  if (lockForward) player.z = cruiseZ(sim.time)
  if (sim.remotes.length === 0) return

  const selfPose = {
    x: player.x,
    y: player.y,
    z: player.z,
    radius: player.radius,
  }
  let ox = 0
  let oy = 0
  const moved: Array<{ remote: Remote; x: number; y: number }> = []
  for (const remote of sim.remotes) {
    if (!remote.alive) continue
    const posed = {
      x: remote.x,
      y: remote.y,
      z: lockForward ? player.z : remote.z,
      radius: remote.radius,
    }
    const bias = remote.id > sim.playerId ? 1 : -1
    const onSelf = shove(selfPose, posed, bias)
    const onThem = shove(posed, selfPose, -bias)
    ox += onSelf.x
    oy += onSelf.y
    moved.push({ remote, x: onThem.x, y: onThem.y })
  }
  player.x += ox
  player.y += oy
  for (const move of moved) {
    move.remote.x += move.x
    move.remote.y += move.y
  }
  if (lockForward) {
    const z = cruiseZ(sim.time)
    player.z = z
    for (const remote of sim.remotes) if (remote.alive) remote.z = z
  }
}

function lockApproaching(sim: Sim) {
  if (sim.authority === 'guest') return
  for (const body of sim.bodies) {
    if (body.kind !== 'ball' || !body.pending || !body.alive) continue
    const current = nearestValue(sim, body)
    if (current === null) continue
    lockBall(sim, body, current)
  }
}

/** Same 60 / 20 / 20 split as a solo lock, from an explicit tier. */
export function valueNear(current: number, pick: number): number {
  if (pick >= 8) return Math.min(4096, current * 2)
  if (pick >= 6) return Math.max(2, current / 2)
  return current
}

function nearestValue(sim: Sim, body: Body): number | null {
  let bestValue = 0
  let bestDist = Infinity
  let found = false
  const consider = (x: number, z: number, value: number) => {
    const ahead = z - body.z
    if (ahead <= 0 || ahead > LOCK_DISTANCE) return
    const dist = Math.hypot(x - body.x, ahead)
    if (dist < bestDist) {
      bestDist = dist
      bestValue = value
      found = true
    }
  }
  consider(sim.player.x, sim.player.z, sim.player.value)
  if (sim.authority === 'host') {
    for (const remote of sim.remotes) {
      if (!remote.alive) continue
      consider(remote.x, remote.z, remote.value)
    }
  }
  return found ? bestValue : null
}

function lockBall(sim: Sim, body: Body, current: number) {
  const pick = Math.abs((body.id * 17) ^ current) % 10
  assignBallValue(body, valueNear(current, pick))
  sim.locks.push({ id: body.id, value: body.value })
}

function assignBallValue(body: Body, value: number) {
  body.value = value
  body.radius = radiusFor(value)
  body.y = body.radius
  body.hx = body.radius
  body.hy = body.radius
  body.hz = body.radius
  body.pending = false
}

export function applyLock(sim: Sim, id: number, value: number) {
  const body = sim.bodies.find((item) => item.id === id && item.kind === 'ball')
  if (!body || !body.alive || body.flying) {
    if (!sim.removed.has(id)) sim.pendingLocks.set(id, value)
    return
  }
  assignBallValue(body, value)
  sim.pendingLocks.delete(id)
}

export function removeBall(sim: Sim, id: number) {
  sim.removed.add(id)
  sim.pendingLocks.delete(id)
  const body = sim.bodies.find((item) => item.id === id)
  if (body) body.alive = false
}

export function applyFly(sim: Sim, id: number, vx: number, vy: number) {
  const body = sim.bodies.find((item) => item.id === id && item.kind === 'ball')
  if (!body || !body.alive || body.flying) return
  body.flying = true
  body.vx = vx
  body.vy = vy
}

export function setPlayerValue(sim: Sim, value: number) {
  applyValue(sim, value)
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
  const reserved = sim.pendingLocks.has(sim.nextId) || sim.removed.has(sim.nextId)
  const body = spawnBall(sim, x, z, 2)
  if (reserved) return
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
  noteSpawn(sim, body)
  sim.bodies.push(body)
  return body
}

function noteSpawn(sim: Sim, body: Body) {
  const locked = sim.pendingLocks.get(body.id)
  if (locked !== undefined) {
    assignBallValue(body, locked)
    sim.pendingLocks.delete(body.id)
  }
  if (sim.removed.has(body.id)) body.alive = false
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
