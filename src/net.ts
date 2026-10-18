import { joinRoom, selfId, type DataPayload, type Room } from 'trystero'
import { isSkinId, type SkinId } from './skins'
import { admitsPlayer, type NetPose } from './match'

export const APP_ID = 'com.unexpectedsoftware.odin-run-2048'
export { selfId }

const JOIN_MS = 12_000

export interface HelloMsg {
  skin: SkinId
  host: boolean
}

export interface LockMsg {
  id: number
  value: number
}

export interface TakeMsg {
  id: number
  valueBefore: number
}

export interface GrantMsg {
  id: number
  peerId: string
}

export interface FlyMsg {
  id: number
  vx: number
  vy: number
}

export interface NetHandlers {
  skin: () => SkinId
  isHost: () => boolean
  started: () => boolean
  onHello: (peerId: string, hello: HelloMsg) => void
  onSkin: (peerId: string, skin: SkinId) => void
  onLeave: (peerId: string) => void
  onStart: (seed: number) => void
  onPose: (peerId: string, pose: NetPose) => void
  onLock: (lock: LockMsg) => void
  onTake: (peerId: string, take: TakeMsg) => void
  onGrant: (grant: GrantMsg) => void
  onDeny: (deny: GrantMsg) => void
  onFly: (fly: FlyMsg) => void
  onRematch: (seed: number) => void
  onFull: () => void
  onStarted: () => void
  onError: (message: string) => void
}

export class Net {
  readonly id = selfId
  private readonly room: Room
  private readonly greeted = new Set<string>()
  private left = false

  constructor(code: string, private readonly handlers: NetHandlers) {
    this.room = joinRoom({ appId: APP_ID }, code, {
      handshakeTimeoutMs: JOIN_MS,
      onJoinError: () => this.fail("Couldn't open the room. Try again."),
    })

    const hello = this.room.makeAction('hello')
    const skin = this.room.makeAction('skin')
    const start = this.room.makeAction('start')
    const pose = this.room.makeAction('pose')
    const lock = this.room.makeAction('lock')
    const take = this.room.makeAction('take')
    const grant = this.room.makeAction('grant')
    const deny = this.room.makeAction('deny')
    const fly = this.room.makeAction('fly')
    const rematch = this.room.makeAction('rematch')
    const full = this.room.makeAction('full')
    const started = this.room.makeAction('started')

    hello.onMessage = (data, { peerId }) => {
      const msg = asHello(data)
      if (msg) handlers.onHello(peerId, msg)
    }
    skin.onMessage = (data, { peerId }) => {
      const msg = asSkin(data)
      if (msg) handlers.onSkin(peerId, msg.skin)
    }
    start.onMessage = (data) => {
      const seed = asSeed(data)
      if (seed !== null) handlers.onStart(seed)
    }
    pose.onMessage = (data, { peerId }) => {
      const msg = asPose(data)
      if (msg) handlers.onPose(peerId, msg)
    }
    lock.onMessage = (data) => {
      const msg = asLock(data)
      if (msg) handlers.onLock(msg)
    }
    take.onMessage = (data, { peerId }) => {
      const msg = asTake(data)
      if (msg) handlers.onTake(peerId, msg)
    }
    grant.onMessage = (data) => {
      const msg = asGrant(data)
      if (msg) handlers.onGrant(msg)
    }
    deny.onMessage = (data) => {
      const msg = asGrant(data)
      if (msg) handlers.onDeny(msg)
    }
    fly.onMessage = (data) => {
      const msg = asFly(data)
      if (msg) handlers.onFly(msg)
    }
    rematch.onMessage = (data) => {
      const seed = asSeed(data)
      if (seed !== null) handlers.onRematch(seed)
    }
    full.onMessage = () => handlers.onFull()
    started.onMessage = () => handlers.onStarted()

    const announce = (peerId: string) => {
      if (this.greeted.has(peerId)) return
      this.greeted.add(peerId)
      const count = Object.keys(this.room.getPeers()).length + 1
      if (handlers.isHost() && !admitsPlayer(count - 1)) {
        void full.send({ full: true }, { target: peerId }).catch(() => {})
        return
      }
      if (handlers.started()) {
        void started.send({ started: true }, { target: peerId }).catch(() => {})
        return
      }
      void hello.send({ skin: handlers.skin(), host: handlers.isHost() }, { target: peerId }).catch(() => {})
    }

    this.room.onPeerJoin = announce
    this.room.onPeerLeave = (peerId) => {
      this.greeted.delete(peerId)
      handlers.onLeave(peerId)
    }

    this.sendSkin = (next) => send(skin, { skin: next })
    this.sendStart = (seed) => send(start, { seed })
    this.sendPose = (next) => send(pose, next)
    this.sendLock = (msg) => send(lock, msg)
    this.sendTake = (msg) => send(take, msg)
    this.sendGrant = (msg) => send(grant, msg)
    this.sendDeny = (msg, peerId) => send(deny, msg, peerId)
    this.sendFly = (msg) => send(fly, msg)
    this.sendRematch = (seed) => send(rematch, { seed })

    queueMicrotask(() => {
      if (this.left) return
      for (const peerId of Object.keys(this.room.getPeers())) announce(peerId)
    })
  }

  readonly sendSkin: (skin: SkinId) => void
  readonly sendStart: (seed: number) => void
  readonly sendPose: (pose: NetPose) => void
  readonly sendLock: (lock: LockMsg) => void
  readonly sendTake: (take: TakeMsg) => void
  readonly sendGrant: (grant: GrantMsg) => void
  readonly sendDeny: (deny: GrantMsg, peerId: string) => void
  readonly sendFly: (fly: FlyMsg) => void
  readonly sendRematch: (seed: number) => void

  peerIds(): string[] {
    return Object.keys(this.room.getPeers())
  }

  async leave() {
    if (this.left) return
    this.left = true
    this.room.onPeerJoin = null
    this.room.onPeerLeave = null
    await this.room.leave()
  }

  private fail(message: string) {
    if (this.left) return
    this.handlers.onError(message)
  }
}

function send(
  action: { send: (data: DataPayload, options?: { target?: string }) => Promise<void> },
  data: object,
  target?: string,
) {
  void action.send(data as DataPayload, target ? { target } : undefined).catch(() => {})
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asHello(data: unknown): HelloMsg | null {
  if (!isRecord(data) || !isSkinId(data.skin) || typeof data.host !== 'boolean') return null
  return { skin: data.skin, host: data.host }
}

function asSkin(data: unknown): { skin: SkinId } | null {
  if (!isRecord(data) || !isSkinId(data.skin)) return null
  return { skin: data.skin }
}

function asSeed(data: unknown): number | null {
  if (!isRecord(data)) return null
  return num(data.seed)
}

function asLock(data: unknown): LockMsg | null {
  if (!isRecord(data)) return null
  const id = num(data.id)
  const value = num(data.value)
  if (id === null || value === null) return null
  return { id, value }
}

function asTake(data: unknown): TakeMsg | null {
  if (!isRecord(data)) return null
  const id = num(data.id)
  const valueBefore = num(data.valueBefore)
  if (id === null || valueBefore === null) return null
  return { id, valueBefore }
}

function asGrant(data: unknown): GrantMsg | null {
  if (!isRecord(data) || typeof data.peerId !== 'string') return null
  const id = num(data.id)
  if (id === null) return null
  return { id, peerId: data.peerId }
}

function asFly(data: unknown): FlyMsg | null {
  if (!isRecord(data)) return null
  const id = num(data.id)
  const vx = num(data.vx)
  const vy = num(data.vy)
  if (id === null || vx === null || vy === null) return null
  return { id, vx, vy }
}

function asPose(data: unknown): NetPose | null {
  if (!isRecord(data) || !isSkinId(data.skin) || typeof data.alive !== 'boolean') return null
  const x = num(data.x)
  const y = num(data.y)
  const z = num(data.z)
  const vy = num(data.vy)
  const value = num(data.value)
  const radius = num(data.radius)
  const seq = num(data.seq)
  if (x === null || y === null || z === null || vy === null || value === null || radius === null || seq === null) {
    return null
  }
  return { x, y, z, vy, value, radius, alive: data.alive, skin: data.skin, seq }
}
