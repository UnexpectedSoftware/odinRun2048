import type { SkinId } from './skins'

/** No 0/O or 1/I, so a code can be read aloud. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5
export const MAX_PLAYERS = 4

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.min(ROOM_ALPHABET.length - 1, Math.floor(rng() * ROOM_ALPHABET.length))
    code += ROOM_ALPHABET[index]
  }
  return code
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length !== ROOM_CODE_LENGTH) return null
  for (const char of code) {
    if (!ROOM_ALPHABET.includes(char)) return null
  }
  return code
}

export function admitsPlayer(count: number): boolean {
  return count < MAX_PLAYERS
}

export interface RosterRow {
  id: string
  label: string
  host: boolean
}

/** Host first, then everyone else by id, so both browsers show the same numbers. */
export function rosterLabels(selfId: string, hostId: string, peerIds: readonly string[]): RosterRow[] {
  const rest = new Set<string>([...peerIds, selfId])
  rest.delete(hostId)
  const ids = [hostId, ...[...rest].sort()]
  return ids.map((id, index) => ({
    id,
    label: id === selfId ? 'You' : `Player ${index + 1}`,
    host: id === hostId,
  }))
}

export interface Claim {
  ballId: number
  peerId: string
  valueBefore: number
}

export interface ClaimBook {
  grants: Map<number, string>
}

export function createClaimBook(): ClaimBook {
  return { grants: new Map() }
}

export type ClaimResult = 'grant' | 'deny'

/** First peer to claim a road ball gets it. A repeat from the winner stays a grant. */
export function claimBall(book: ClaimBook, claim: Claim): ClaimResult {
  const winner = book.grants.get(claim.ballId)
  if (winner !== undefined) return winner === claim.peerId ? 'grant' : 'deny'
  book.grants.set(claim.ballId, claim.peerId)
  return 'grant'
}

/** Undo one optimistic merge. A later merge (8 after a denied 4) is left alone. */
export function revertValue(current: number, valueBefore: number): number | null {
  if (valueBefore >= 2 && current === valueBefore * 2) return valueBefore
  return null
}

export interface NetPose {
  x: number
  y: number
  z: number
  /** Sender's race clock. World z is only meaningful together with this. */
  time: number
  vy: number
  value: number
  radius: number
  alive: boolean
  skin: SkinId
  seq: number
}

export interface PoseSample {
  t: number
  pose: NetPose
}

export function lerpPose(a: NetPose, b: NetPose, u: number): NetPose {
  const t = Math.min(1, Math.max(0, u))
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    time: a.time + (b.time - a.time) * t,
    vy: a.vy + (b.vy - a.vy) * t,
    value: t < 0.5 ? a.value : b.value,
    radius: a.radius + (b.radius - a.radius) * t,
    alive: a.alive && b.alive,
    skin: t < 0.5 ? a.skin : b.skin,
    seq: b.seq,
  }
}

/** Sample a little in the past so a late packet can still be interpolated. */
export function samplePoses(samples: readonly PoseSample[], now: number, delay = 0.08): NetPose | null {
  if (samples.length === 0) return null
  const t = now - delay
  if (samples.length === 1 || t <= samples[0].t) return samples[0].pose
  let index = 0
  while (index < samples.length - 1 && samples[index + 1].t <= t) index++
  const left = samples[index]
  const right = samples[Math.min(index + 1, samples.length - 1)]
  if (left === right) return left.pose
  const span = right.t - left.t
  const u = span > 1e-6 ? (t - left.t) / span : 1
  return lerpPose(left.pose, right.pose, u)
}
