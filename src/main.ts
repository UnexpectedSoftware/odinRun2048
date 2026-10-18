import { readControls } from './input'
import { View } from './render'
import { playEvent } from './sound'
import { createSim, restart, start, step, type Sim } from './sim'

const STORE = 'odin-run-2048'

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

const held = new Set<string>()
let touchStrafe = 0
let touchJump = false
let pointerId: number | null = null
let originX = 0
let originY = 0
let pointerMoved = false
let winTimer = 0

const saved = loadBest()
let sim: Sim = createSim(Date.now() % 1_000_000_000, saved.value, saved.distance)
const view = new View(app, labels)

window.addEventListener('resize', () => view.resize())

window.addEventListener('keydown', (event) => {
  if (isControl(event.code)) event.preventDefault()
  held.add(event.code)
  if (overlayEl.hidden) return
  if (event.code === 'Space' || event.code === 'Enter') begin()
})

window.addEventListener('keyup', (event) => {
  held.delete(event.code)
})

window.addEventListener('blur', () => held.clear())

playButton.addEventListener('click', () => begin())

app.addEventListener('pointerdown', (event) => {
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
  if (sim.status === 'ready') start(sim)
  else if (sim.status === 'dead') {
    const jumpHeld = held.has('Space') || held.has('ArrowUp') || held.has('KeyW')
    sim = restart(sim, (Date.now() ^ (Math.random() * 1e9)) >>> 0, jumpHeld)
    view.clear()
    bannerEl.hidden = true
  }
  overlayEl.hidden = true
  playButton.blur()
}

function isControl(code: string) {
  return code === 'Space' || code.startsWith('Arrow') || code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD'
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

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000)
  last = now
  if (sim.status === 'running') {
    const input = readControls({ has: (code) => held.has(code) }, touchStrafe, touchJump)
    touchJump = false
    step(sim, input, dt)
    for (const name of sim.events) playEvent(name)
    persist()
  }
  if (sim.status === 'dead' && overlayEl.hidden) showDead()
  if (winTimer > 0) {
    winTimer -= dt
    if (winTimer <= 0) bannerEl.hidden = true
  }
  paint()
  view.resize()
  view.sync(sim)
  requestAnimationFrame(frame)
}

function showDead() {
  titleEl.textContent = sim.cause === 'fall' ? 'You left the track' : 'The spikes got you'
  blurbEl.textContent =
    sim.player.value >= 2048
      ? `You reached ${sim.player.value}. Distance ${Math.floor(sim.distance)}.`
      : `You finished on ${sim.player.value}. Distance ${Math.floor(sim.distance)}.`
  controlsEl.textContent = 'Enter or Space to run again.'
  playButton.textContent = 'Run again'
  bestLine.textContent = `Best ${sim.bestValue >= 2 ? sim.bestValue : '—'} · ${Math.floor(sim.bestDistance)}`
  overlayEl.hidden = false
  bannerEl.hidden = true
}

function showReady() {
  bestLine.textContent =
    saved.value >= 2 ? `Best ${saved.value} · ${Math.floor(saved.distance)}` : ''
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

showReady()
requestAnimationFrame(frame)
