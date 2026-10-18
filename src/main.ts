import {
  claimBall,
  createClaimBook,
  makeRoomCode,
  normalizeRoomCode,
  revertValue,
  rosterLabels,
  samplePoses,
  type ClaimBook,
  type NetPose,
  type PoseSample,
} from './match'
import { Net } from './net'
import { readControls } from './input'
import { View } from './render'
import { isSkinId, paintIcon, SKINS, skinById, type SkinId } from './skins'
import { armMusic, keepMusic, musicEnabled, playEvent, toggleMusic } from './sound'
import {
  applyFly,
  applyLock,
  catchRaceClock,
  catchUp,
  createSim,
  presentFriend,
  removeBall,
  restart,
  setPlayerValue,
  start,
  step,
  type Sim,
} from './sim'

const STORE = 'odin-run-2048'
const SKIN_STORE = 'odin-run-2048-skin'
const DEFAULT_BLURB = 'Merge matching balls, jump the spikes, and reach 2048.'
const DEFAULT_CONTROLS =
  'Arrows or A/D steer. Space, W, or Up jumps. S or Down fast-falls. On a phone, drag to steer and tap to jump.'
const JOIN_MS = 12_000

type Chrome = 'title' | 'dead-solo' | 'lobby' | 'countdown' | 'dead-multi' | 'hidden'

const app = document.querySelector<HTMLElement>('#app')!
const labels = document.querySelector<HTMLElement>('#labels')!
const valueEl = document.querySelector<HTMLElement>('#value')!
const statsEl = document.querySelector<HTMLElement>('#stats')!
const hintEl = document.querySelector<HTMLElement>('#hint')!
const bannerEl = document.querySelector<HTMLElement>('#banner')!
const overlayEl = document.querySelector<HTMLElement>('#overlay')!
const titleEl = document.querySelector<HTMLElement>('#title')!
const blurbEl = document.querySelector<HTMLElement>('#blurb')!
const controlsEl = document.querySelector<HTMLElement>('#controls')!
const bestLine = document.querySelector<HTMLElement>('#best-line')!
const playButton = document.querySelector<HTMLButtonElement>('#play')!
const multiButton = document.querySelector<HTMLButtonElement>('#multiplayer')!
const menuEl = document.querySelector<HTMLElement>('#menu')!
const skinRow = document.querySelector<HTMLElement>('#skin-row')!
const skinsEl = document.querySelector<HTMLElement>('#skins')!
const countdownEl = document.querySelector<HTMLElement>('#countdown')!
const roomEl = document.querySelector<HTMLElement>('#room')!
const roomBlurb = document.querySelector<HTMLElement>('#room-blurb')!
const roomCodeEl = document.querySelector<HTMLElement>('#room-code')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy-code')!
const joinForm = document.querySelector<HTMLFormElement>('#join-form')!
const codeInput = document.querySelector<HTMLInputElement>('#code-input')!
const rosterEl = document.querySelector<HTMLElement>('#roster')!
const roomNote = document.querySelector<HTMLElement>('#room-note')!
const createButton = document.querySelector<HTMLButtonElement>('#create-room')!
const startButton = document.querySelector<HTMLButtonElement>('#start-game')!
const spectateButton = document.querySelector<HTMLButtonElement>('#spectate')!
const rematchButton = document.querySelector<HTMLButtonElement>('#rematch')!
const leaveButton = document.querySelector<HTMLButtonElement>('#leave-room')!
const musicButton = document.querySelector<HTMLButtonElement>('#music')!

const held = new Set<string>()
let touchStrafe = 0
let touchJump = false
let pointerId: number | null = null
let originX = 0
let originY = 0
let pointerMoved = false
let winTimer = 0
let skin = loadSkin()
let chrome: Chrome = 'title'
let titleMessage = ''
let hosting = false
let hostId: string | null = null
let roomCode = ''
let matchLive = false
let spectating = false
let countdown = 0
let pendingSeed = 1
let poseTime = 0
let seq = 0
let joinTimer = 0
let net: Net | null = null
let book: ClaimBook = createClaimBook()
const pendingTakes = new Map<number, { valueBefore: number; at: number }>()
const peerSkins = new Map<string, SkinId>()
const remoteSamples = new Map<string, PoseSample[]>()
const lastSeq = new Map<string, number>()
/** Fallen friends stay on the z where we first saw them down. */
const heldFriendZ = new Map<string, number>()
const inbox: Array<() => void> = []

const saved = loadBest()
let sim: Sim = createSim(Date.now() % 1_000_000_000, saved.value, saved.distance)
const view = new View(app, labels)
view.setSkin(skin)
buildSkinButtons()

window.addEventListener('resize', () => view.resize())

window.addEventListener('keydown', (event) => {
  armMusic()
  const target = event.target
  const onButton = target instanceof HTMLElement && Boolean(target.closest('button, input, a'))
  if (isControl(event.code) && !onButton) event.preventDefault()
  if (!onButton) held.add(event.code)
  if (event.code === 'Escape' && spectating) {
    spectating = false
    chrome = 'dead-multi'
    paintChrome()
    return
  }
  if (overlayEl.hidden || onButton) return
  if ((chrome === 'title' || chrome === 'dead-solo') && (event.code === 'Space' || event.code === 'Enter')) begin()
})

window.addEventListener('keyup', (event) => {
  held.delete(event.code)
})

window.addEventListener('blur', () => held.clear())

playButton.addEventListener('click', () => begin())
multiButton.addEventListener('click', () => openLobby())
createButton.addEventListener('click', () => createRoom())
startButton.addEventListener('click', () => hostStart())
spectateButton.addEventListener('click', () => {
  spectating = true
  chrome = 'hidden'
  paintChrome()
})
rematchButton.addEventListener('click', () => hostRematch())
leaveButton.addEventListener('click', () => backToTitle())
copyButton.addEventListener('click', () => void copyCode())
joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  joinRoom()
})
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
})
musicButton.addEventListener('click', () => {
  toggleMusic()
  paintMusic()
})

app.addEventListener('pointerdown', (event) => {
  armMusic()
  if (!overlayEl.hidden) return
  if (event.target !== view.renderer.domElement) return
  pointerId = event.pointerId
  originX = event.clientX
  originY = event.clientY
  pointerMoved = false
  view.renderer.domElement.setPointerCapture(event.pointerId)
})

app.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerId) return
  const dx = event.clientX - originX
  const dy = event.clientY - originY
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) pointerMoved = true
  touchStrafe = Math.max(-1, Math.min(1, dx / 90))
})

app.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointerId) return
  const dx = event.clientX - originX
  const dy = event.clientY - originY
  const tap = !pointerMoved && Math.hypot(dx, dy) < 14
  pointerId = null
  touchStrafe = 0
  if (tap) touchJump = true
})

function begin() {
  if (net) return
  if (sim.status === 'ready') start(sim)
  else if (sim.status === 'dead') {
    const jumpHeld = held.has('Space') || held.has('ArrowUp') || held.has('KeyW')
    sim = restart(sim, (Date.now() ^ (Math.random() * 1e9)) >>> 0, jumpHeld)
    view.clear()
    view.setSkin(skin)
    bannerEl.hidden = true
  }
  chrome = 'hidden'
  paintChrome()
  playButton.blur()
}

function openLobby() {
  chrome = 'lobby'
  roomNote.textContent = ''
  paintChrome()
}

function createRoom() {
  roomCode = makeRoomCode()
  hosting = true
  hostId = null
  connect(roomCode)
  if (!net) return
  hostId = net.id
  roomNote.textContent = ''
  paintChrome()
}

function joinRoom() {
  const code = normalizeRoomCode(codeInput.value)
  if (!code) {
    roomNote.textContent = 'Enter the 5 character code.'
    return
  }
  roomCode = code
  hosting = false
  hostId = null
  connect(code)
  if (!net) return
  roomNote.textContent = ''
  window.clearTimeout(joinTimer)
  joinTimer = window.setTimeout(() => {
    if (!hosting && hostId === null) failRoom("Couldn't open the room. Try again.")
  }, JOIN_MS)
  paintChrome()
}

function connect(code: string) {
  void dropNet()
  peerSkins.clear()
  remoteSamples.clear()
  lastSeq.clear()
  heldFriendZ.clear()
  try {
    net = new Net(code, {
      skin: () => skin,
      isHost: () => hosting,
      started: () => matchLive,
      onHello: (peerId, hello) => inbox.push(() => onHello(peerId, hello.skin, hello.host)),
      onSkin: (peerId, next) => inbox.push(() => rememberSkin(peerId, next)),
      onLeave: (peerId) => inbox.push(() => onLeave(peerId)),
      onStart: (seed) => inbox.push(() => { if (!hosting) beginCountdown(seed) }),
      onPose: (peerId, pose) => inbox.push(() => onPose(peerId, pose)),
      onLock: (lock) => inbox.push(() => { if (!hosting) applyLock(sim, lock.id, lock.value) }),
      onTake: (peerId, take) => inbox.push(() => onTake(peerId, take.id, take.valueBefore)),
      onGrant: (grant) => inbox.push(() => onGrant(grant.id)),
      onDeny: (deny) => inbox.push(() => onDeny(deny.id)),
      onFly: (fly) => inbox.push(() => applyFly(sim, fly.id, fly.vx, fly.vy)),
      onRematch: (seed) => inbox.push(() => { if (!hosting) beginCountdown(seed) }),
      onFull: () => inbox.push(() => failRoom('That room is full.')),
      onStarted: () => inbox.push(() => failRoom('That match has started.')),
      onError: (message) => inbox.push(() => failRoom(message)),
    })
  } catch {
    net = null
    hosting = false
    hostId = null
    roomCode = ''
    roomNote.textContent = "Couldn't open the room. Try again."
    paintChrome()
  }
}

function hostStart() {
  if (!net || !hosting || peerSkins.size < 1 || matchLive) return
  const seed = freshSeed()
  net.sendStart(seed)
  beginCountdown(seed)
}

function hostRematch() {
  if (!net || !hosting) return
  const seed = freshSeed()
  net.sendRematch(seed)
  beginCountdown(seed)
}

function beginCountdown(seed: number) {
  pendingSeed = seed
  countdown = 3
  matchLive = true
  spectating = false
  chrome = 'countdown'
  countdownEl.textContent = '3'
  paintChrome()
}

function launchMatch() {
  sim = createSim(pendingSeed, saved.value, saved.distance)
  sim.authority = hosting ? 'host' : 'guest'
  start(sim)
  view.clear()
  view.setSkin(skin)
  book = createClaimBook()
  pendingTakes.clear()
  remoteSamples.clear()
  lastSeq.clear()
  heldFriendZ.clear()
  bannerEl.hidden = true
  spectating = false
  chrome = 'hidden'
  paintChrome()
}

function backToTitle(message = '') {
  titleMessage = message
  void dropNet()
  hosting = false
  hostId = null
  roomCode = ''
  matchLive = false
  spectating = false
  countdown = 0
  peerSkins.clear()
  remoteSamples.clear()
  lastSeq.clear()
  heldFriendZ.clear()
  pendingTakes.clear()
  sim = createSim((Date.now() ^ (Math.random() * 1e9)) >>> 0, saved.value, saved.distance)
  view.clear()
  view.setSkin(skin)
  bannerEl.hidden = true
  chrome = 'title'
  paintChrome()
}

function failRoom(message: string) {
  void dropNet()
  hosting = false
  hostId = null
  roomCode = ''
  matchLive = false
  spectating = false
  countdown = 0
  peerSkins.clear()
  remoteSamples.clear()
  heldFriendZ.clear()
  chrome = 'lobby'
  roomNote.textContent = message
  paintChrome()
}

async function dropNet() {
  window.clearTimeout(joinTimer)
  const current = net
  net = null
  if (current) await current.leave()
}

async function copyCode() {
  if (!roomCode) return
  try {
    await navigator.clipboard.writeText(roomCode)
    copyButton.textContent = 'Copied'
  } catch {
    roomNote.textContent = 'Select the code and copy it.'
  }
}

function onHello(peerId: string, next: SkinId, isHostPeer: boolean) {
  if (!net) return
  if (isHostPeer) {
    if (hosting && peerId !== net.id) return
    hostId = peerId
    window.clearTimeout(joinTimer)
  }
  rememberSkin(peerId, next)
  if (chrome === 'lobby') roomNote.textContent = ''
  paintChrome()
}

function rememberSkin(peerId: string, next: SkinId) {
  peerSkins.set(peerId, next)
  const samples = remoteSamples.get(peerId)
  if (samples) {
    for (const sample of samples) sample.pose.skin = next
  }
  if (chrome === 'lobby' || chrome === 'dead-multi') paintRoster()
}

function onLeave(peerId: string) {
  peerSkins.delete(peerId)
  remoteSamples.delete(peerId)
  lastSeq.delete(peerId)
  heldFriendZ.delete(peerId)
  if (!hosting && peerId === hostId) {
    backToTitle('The host left.')
    return
  }
  if (chrome === 'lobby' || chrome === 'dead-multi') paintChrome()
}

function onPose(peerId: string, pose: NetPose) {
  const prev = lastSeq.get(peerId) ?? -1
  if (pose.seq <= prev) return
  lastSeq.set(peerId, pose.seq)
  const samples = remoteSamples.get(peerId) ?? []
  samples.push({ t: performance.now() / 1000, pose })
  while (samples.length > 8) samples.shift()
  remoteSamples.set(peerId, samples)
}

function onTake(peerId: string, id: number, valueBefore: number) {
  if (!net || !hosting) return
  const body = sim.bodies.find((item) => item.id === id && item.alive)
  if (!body) {
    net.sendDeny({ id, peerId }, peerId)
    return
  }
  const result = claimBall(book, { ballId: id, peerId, valueBefore })
  if (result === 'deny') {
    net.sendDeny({ id, peerId }, peerId)
    return
  }
  removeBall(sim, id)
  net.sendGrant({ id, peerId })
}

function onGrant(id: number) {
  removeBall(sim, id)
  releaseTake(id)
}

function onDeny(id: number) {
  const pending = pendingTakes.get(id)
  releaseTake(id)
  if (!pending) return
  const restored = revertValue(sim.player.value, pending.valueBefore)
  if (restored !== null) setPlayerValue(sim, restored)
}

function releaseTake(id: number) {
  pendingTakes.delete(id)
  sim.held.delete(id)
}

function flushNet() {
  if (!net || !matchLive) return
  if (hosting) {
    for (const lock of sim.locks) net.sendLock(lock)
  }
  for (const knock of sim.knocks) net.sendFly(knock)
  for (const merge of sim.merges) {
    pendingTakes.set(merge.id, { valueBefore: merge.valueBefore, at: sim.time })
    if (hosting) {
      const result = claimBall(book, { ballId: merge.id, peerId: net.id, valueBefore: merge.valueBefore })
      if (result === 'grant') {
        releaseTake(merge.id)
        net.sendGrant({ id: merge.id, peerId: net.id })
      } else onDeny(merge.id)
    } else {
      net.sendTake({ id: merge.id, valueBefore: merge.valueBefore })
    }
  }
  for (const [id, pending] of pendingTakes) {
    if (sim.time - pending.at <= 0.8) continue
    releaseTake(id)
    const restored = revertValue(sim.player.value, pending.valueBefore)
    if (restored !== null) setPlayerValue(sim, restored)
    const body = sim.bodies.find((item) => item.id === id)
    if (body) {
      body.alive = true
      sim.removed.delete(id)
    }
  }
}

function applyRemotePoses(now: number) {
  if (!matchLive) {
    sim.remotes = []
    heldFriendZ.clear()
    return
  }
  const racing = sim.status === 'running'
  const remotes = []
  for (const [id, samples] of remoteSamples) {
    const pose = samplePoses(samples, now)
    if (!pose) continue
    const placed = presentFriend(sim.time, racing, pose, heldFriendZ.get(id))
    if (placed.heldZ === undefined) heldFriendZ.delete(id)
    else heldFriendZ.set(id, placed.heldZ)
    remotes.push({
      id,
      x: pose.x,
      y: pose.y,
      z: placed.z,
      vy: pose.vy,
      value: pose.value,
      radius: pose.radius,
      alive: pose.alive,
      skin: pose.skin,
    })
  }
  sim.remotes = remotes
}

function pullTowardHost(dt: number) {
  if (hosting || !hostId || sim.status !== 'running') return
  const latest = remoteSamples.get(hostId)?.at(-1)
  if (!latest?.pose.alive) return
  catchRaceClock(sim, latest.pose.time, dt)
}

function focusPoint() {
  if (!spectating || sim.status === 'running') return sim.player
  let best: { x: number; y: number; z: number } | null = null
  let bestDist = Infinity
  for (const remote of sim.remotes) {
    if (!remote.alive) continue
    const dist = Math.abs(remote.z - sim.player.z)
    if (dist < bestDist) {
      best = remote
      bestDist = dist
    }
  }
  return best ?? sim.player
}

function livingFriend(): boolean {
  for (const samples of remoteSamples.values()) {
    const latest = samples[samples.length - 1]
    if (latest?.pose.alive) return true
  }
  return false
}

function chooseSkin(id: SkinId) {
  skin = id
  localStorage.setItem(SKIN_STORE, id)
  view.setSkin(id)
  skinsEl.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.skin === id ? 'true' : 'false')
  })
  if (net && !matchLive) net.sendSkin(id)
}

function buildSkinButtons() {
  for (const spec of SKINS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.skin = spec.id
    button.title = spec.name
    button.setAttribute('aria-label', spec.name)
    button.setAttribute('aria-pressed', spec.id === skin ? 'true' : 'false')
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    paintIcon(canvas, spec.id)
    button.append(canvas)
    button.addEventListener('click', () => chooseSkin(spec.id))
    skinsEl.append(button)
  }
}

function paintChrome() {
  overlayEl.hidden = chrome === 'hidden'
  const inRoom = net !== null
  const greeted = inRoom && (hosting || hostId !== null)
  const showSkins = chrome === 'title' || chrome === 'dead-solo' || chrome === 'lobby'
  skinRow.hidden = !showSkins
  countdownEl.hidden = chrome !== 'countdown'
  menuEl.hidden = chrome !== 'title' && chrome !== 'dead-solo'
  roomEl.hidden = chrome !== 'lobby' && chrome !== 'dead-multi'
  controlsEl.hidden = chrome === 'lobby' || chrome === 'countdown'
  bestLine.hidden = chrome === 'countdown' || chrome === 'lobby'

  if (chrome === 'title') {
    titleEl.textContent = 'Odin Run 2048'
    blurbEl.hidden = false
    blurbEl.textContent = titleMessage || DEFAULT_BLURB
    controlsEl.textContent = DEFAULT_CONTROLS
    playButton.textContent = 'Play'
    multiButton.hidden = false
  } else if (chrome === 'dead-solo') {
    titleEl.textContent = sim.cause === 'fall' ? 'You left the track' : 'The spikes got you'
    blurbEl.hidden = false
    blurbEl.textContent = deathBlurb()
    controlsEl.textContent = 'Enter or Space to run again.'
    playButton.textContent = 'Run again'
    multiButton.hidden = true
    bestLine.textContent = `Best ${sim.bestValue >= 2 ? sim.bestValue : '—'} · ${Math.floor(sim.bestDistance)}`
  } else if (chrome === 'countdown') {
    titleEl.textContent = 'Get ready'
    blurbEl.hidden = false
    blurbEl.textContent = 'The run starts together.'
  } else if (chrome === 'lobby' || chrome === 'dead-multi') {
    titleEl.textContent = chrome === 'dead-multi' ? (sim.cause === 'fall' ? 'You left the track' : 'The spikes got you') : 'Multiplayer'
    blurbEl.hidden = chrome === 'lobby'
    if (chrome === 'dead-multi') blurbEl.textContent = deathBlurb()
    roomBlurb.hidden = chrome === 'dead-multi'
    roomCodeEl.hidden = !roomCode
    roomCodeEl.textContent = roomCode
    copyButton.hidden = !greeted
    joinForm.hidden = inRoom || chrome === 'dead-multi'
    createButton.hidden = inRoom || chrome === 'dead-multi'
    startButton.hidden = !hosting || chrome === 'dead-multi'
    startButton.disabled = peerSkins.size < 1
    spectateButton.hidden = chrome !== 'dead-multi' || !livingFriend()
    rematchButton.hidden = chrome !== 'dead-multi' || !hosting
    leaveButton.hidden = false
    leaveButton.textContent = inRoom || chrome === 'dead-multi' ? 'Leave' : 'Back'
    if (chrome === 'lobby') {
      roomBlurb.textContent = !inRoom
        ? 'Create a room and share the code, or join a friend.'
        : !greeted
          ? 'Looking for the room…'
          : hosting
            ? 'Share the code. Start when a friend has joined.'
            : 'Waiting for the host to start.'
    }
    if (chrome === 'dead-multi') {
      controlsEl.textContent = 'Spectate follows a friend. Esc comes back to this card.'
      roomNote.textContent = hosting ? 'Run again restarts everyone.' : 'Waiting for the host.'
    }
    paintRoster()
  }
}

function paintRoster() {
  rosterEl.replaceChildren()
  if (!net || !hostId) return
  for (const row of rosterLabels(net.id, hostId, [...peerSkins.keys()])) {
    const line = document.createElement('p')
    const who = document.createElement('span')
    const worn = document.createElement('span')
    who.textContent = row.host ? `${row.label} · host` : row.label
    const wornId = row.id === net.id ? skin : peerSkins.get(row.id)
    worn.textContent = wornId && isSkinId(wornId) ? skinById(wornId).name : ''
    line.append(who, worn)
    rosterEl.append(line)
  }
}

function deathBlurb() {
  return sim.player.value >= 2048
    ? `You reached ${sim.player.value}. Distance ${Math.floor(sim.distance)}.`
    : `You finished on ${sim.player.value}. Distance ${Math.floor(sim.distance)}.`
}

function isControl(code: string) {
  return code === 'Space' || code.startsWith('Arrow') || code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' || code === 'Escape'
}

function paintMusic() {
  const on = musicEnabled()
  musicButton.textContent = on ? 'Music on' : 'Music off'
  musicButton.setAttribute('aria-pressed', on ? 'true' : 'false')
}

function paint() {
  const bestValue = sim.bestValue >= 2 ? String(sim.bestValue) : '—'
  valueEl.textContent = String(sim.player.value)
  valueEl.style.color = sim.invuln > 0 ? '#ff8aa0' : '#edc22e'
  statsEl.innerHTML = `Distance ${Math.floor(sim.distance)}<br>Best ${bestValue} · ${Math.floor(sim.bestDistance)}`
  hintEl.hidden = sim.status !== 'running' || sim.distance > 90
  if (sim.showWin) {
    bannerEl.hidden = false
    sim.showWin = false
    winTimer = 2.6
  }
}

function loadSkin(): SkinId {
  try {
    const raw = localStorage.getItem(SKIN_STORE)
    return raw && isSkinId(raw) ? raw : 'visor'
  } catch {
    return 'visor'
  }
}

function loadBest(): { value: number; distance: number } {
  try {
    const raw = localStorage.getItem(STORE)
    if (!raw) return { value: 0, distance: 0 }
    const parsed = JSON.parse(raw) as { value?: number; distance?: number }
    return {
      value: Number(parsed.value) || 0,
      distance: Number(parsed.distance) || 0,
    }
  } catch {
    return { value: 0, distance: 0 }
  }
}

function persist() {
  const value = Math.max(saved.value, sim.bestValue)
  const distance = Math.max(saved.distance, sim.bestDistance)
  if (value === saved.value && distance === saved.distance) return
  saved.value = value
  saved.distance = distance
  localStorage.setItem(STORE, JSON.stringify(saved))
}

function freshSeed() {
  return (Date.now() ^ (Math.random() * 1e9)) >>> 0
}

function showReady() {
  bestLine.textContent = saved.value >= 2 ? `Best ${saved.value} · ${Math.floor(saved.distance)}` : ''
  paintChrome()
}

let last = performance.now()
function frame(nowMs: number) {
  const dt = Math.min(0.033, (nowMs - last) / 1000)
  last = nowMs
  const now = nowMs / 1000

  while (inbox.length > 0) inbox.shift()?.()

  if (countdown > 0) {
    const shown = Math.max(1, Math.ceil(countdown))
    countdown -= dt
    const next = Math.max(1, Math.ceil(Math.max(countdown, 0)))
    if (next !== shown && countdown > 0) countdownEl.textContent = String(next)
    if (countdown <= 0) {
      countdown = 0
      launchMatch()
    }
  }

  pullTowardHost(dt)
  applyRemotePoses(now)

  if (sim.status === 'running' && chrome === 'hidden') {
    const input = readControls({ has: (code) => held.has(code) }, touchStrafe, touchJump)
    touchJump = false
    step(sim, input, dt)
    flushNet()
    for (const name of sim.events) playEvent(name)
    persist()
  } else if (spectating) {
    catchUp(sim)
  }

  if (sim.status === 'dead' && chrome === 'hidden' && !spectating) {
    chrome = net ? 'dead-multi' : 'dead-solo'
    paintChrome()
  }

  if (winTimer > 0) {
    winTimer -= dt
    if (winTimer <= 0) bannerEl.hidden = true
  }

  poseTime += dt
  if (net && matchLive && chrome !== 'countdown' && poseTime >= 1 / 20) {
    poseTime = 0
    seq += 1
    net.sendPose({
      x: sim.player.x,
      y: sim.player.y,
      z: sim.player.z,
      time: sim.time,
      vy: sim.player.vy,
      value: sim.player.value,
      radius: sim.player.radius,
      alive: sim.status === 'running',
      skin,
      seq,
    })
  }

  keepMusic(now)
  paint()
  view.resize()
  view.sync(sim, focusPoint())
  requestAnimationFrame(frame)
}

showReady()
paintMusic()
requestAnimationFrame(frame)
