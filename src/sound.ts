/**
 * Effects are short tones. The loop is "Write Protect On C64" by SlimeyFox,
 * free to use under the Pixabay Content License.
 * https://pixabay.com/music/electronic-write-protect-on-c64-541685/
 */

const MUSIC_STORE = 'odin-run-2048-music'
const MUSIC_VOLUME = 0.4

let ctx: AudioContext | null = null
let music: HTMLAudioElement | null = null
let wanted: boolean | null = null
let armed = false
let retryAt = 0

function audio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number) {
  const context = audio()
  if (!context) return
  const osc = context.createOscillator()
  const amp = context.createGain()
  osc.type = type
  osc.frequency.value = freq
  amp.gain.setValueAtTime(gain, context.currentTime)
  amp.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
  osc.connect(amp)
  amp.connect(context.destination)
  osc.start()
  osc.stop(context.currentTime + duration)
}

function musicOn(): boolean {
  if (wanted !== null) return wanted
  try {
    wanted = localStorage.getItem(MUSIC_STORE) !== 'off'
  } catch {
    wanted = true
  }
  return wanted
}

export function musicEnabled(): boolean {
  return musicOn()
}

function musicUrl(): string {
  return new URL('music/write-protect-on-c64.mp3', document.baseURI).href
}

function startMusic() {
  if (!musicOn()) return
  if (!music) {
    music = new Audio(musicUrl())
    music.loop = true
    music.preload = 'auto'
    music.volume = MUSIC_VOLUME
  }
  if (music.paused) void music.play().catch(() => {})
}

/** A click or a key is what lets the browser start the loop. */
export function armMusic() {
  armed = true
  startMusic()
}

export function toggleMusic(): boolean {
  const on = !musicOn()
  wanted = on
  try {
    localStorage.setItem(MUSIC_STORE, on ? 'on' : 'off')
  } catch {
    /* private mode */
  }
  armed = true
  if (on) startMusic()
  else music?.pause()
  return on
}

/** Retry after a rejected autoplay, and resume when the tab comes back. */
export function keepMusic(now: number) {
  if (!armed || !musicOn() || !music || !music.paused) return
  if (now < retryAt) return
  retryAt = now + 1
  void music.play().catch(() => {})
}

export function playEvent(name: string) {
  if (name === 'jump') tone(520, 0.09, 'square', 0.04)
  else if (name === 'merge') {
    tone(440, 0.1, 'triangle', 0.06)
    tone(660, 0.14, 'triangle', 0.05)
  } else if (name === 'hurt') tone(110, 0.18, 'sawtooth', 0.05)
  else if (name === 'die') tone(70, 0.32, 'sawtooth', 0.06)
  else if (name === 'win') {
    tone(523, 0.12, 'triangle', 0.06)
    tone(659, 0.14, 'triangle', 0.06)
    tone(784, 0.2, 'triangle', 0.06)
  }
}
