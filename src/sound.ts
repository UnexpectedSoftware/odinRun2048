let ctx: AudioContext | null = null

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
