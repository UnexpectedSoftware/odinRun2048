/** Original ball looks. Robot faces are chunky and mechanical, not copied characters. */

export const SKIN_IDS = ['visor', 'scout', 'fang', 'football'] as const

export type SkinId = (typeof SKIN_IDS)[number]

export interface SkinSpec {
  id: SkinId
  name: string
  /** Shell color. Football multiplies the texture by this. */
  shell: string
  /** Football rolls. Robot faces stay upright toward the camera. */
  rolls: boolean
}

export const SKINS: readonly SkinSpec[] = [
  { id: 'visor', name: 'Visor', shell: '#f0b429', rolls: false },
  { id: 'scout', name: 'Scout', shell: '#3c7dff', rolls: false },
  { id: 'fang', name: 'Fang', shell: '#2fce67', rolls: false },
  { id: 'football', name: 'Football', shell: '#f7f7fb', rolls: true },
]

const SKIN_SET = new Set<string>(SKIN_IDS)

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKIN_SET.has(value)
}

export function skinById(id: SkinId): SkinSpec {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0]
}

/** Round menu icon. Robot faces use the same painting as the ball. */
export function paintIcon(canvas: HTMLCanvasElement, id: SkinId) {
  if (id === 'football') paintFootballIcon(canvas)
  else paintFace(canvas, id)
}

function paintFootballIcon(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = canvas.width
  ctx.clearRect(0, 0, s, s)
  ctx.fillStyle = '#f7f7fb'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#16161c'
  pentagon(ctx, s / 2, s / 2, s * 0.16, -Math.PI / 2)
  pentagon(ctx, s * 0.3, s * 0.32, s * 0.09, 0.4)
  pentagon(ctx, s * 0.72, s * 0.34, s * 0.09, 0.2)
  pentagon(ctx, s * 0.28, s * 0.7, s * 0.08, 0.6)
  pentagon(ctx, s * 0.7, s * 0.68, s * 0.08, 1)
}

function pentagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

/** Face painted as the camera sees it: canvas +x is world +x, canvas top is world +y. */
export function paintFace(canvas: HTMLCanvasElement, id: Exclude<SkinId, 'football'>) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = canvas.width
  ctx.clearRect(0, 0, s, s)
  if (id === 'visor') paintVisor(ctx, s)
  else if (id === 'scout') paintScout(ctx, s)
  else paintFang(ctx, s)
}

/** Equirectangular black patches on the 12 icosahedron vertices, so a sphere reads as a football. */
export function paintFootball(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const image = ctx.createImageData(w, h)
  const verts = icosahedronVerts()
  const data = image.data
  for (let y = 0; y < h; y++) {
    const theta = ((y + 0.5) / h) * Math.PI
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)
    for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w) * Math.PI * 2
      // Same direction Three.js SphereGeometry uses for this UV.
      const dx = -Math.cos(phi) * sinT
      const dy = cosT
      const dz = Math.sin(phi) * sinT
      let nearest = 4
      for (const vert of verts) {
        const dot = dx * vert[0] + dy * vert[1] + dz * vert[2]
        const ang = Math.acos(Math.min(1, Math.max(-1, dot)))
        if (ang < nearest) nearest = ang
      }
      const black = nearest < 0.34
      const i = (y * w + x) * 4
      data[i] = black ? 18 : 246
      data[i + 1] = black ? 18 : 246
      data[i + 2] = black ? 22 : 250
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

function paintVisor(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#1a2330'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.fill()

  round(ctx, s * 0.16, s * 0.22, s * 0.68, s * 0.5, s * 0.08)
  ctx.fillStyle = '#071820'
  ctx.fill()

  ctx.fillStyle = '#7af6ff'
  round(ctx, s * 0.24, s * 0.36, s * 0.18, s * 0.1, s * 0.04)
  ctx.fill()
  round(ctx, s * 0.58, s * 0.36, s * 0.18, s * 0.1, s * 0.04)
  ctx.fill()

  ctx.fillStyle = '#39e7ff'
  round(ctx, s * 0.4, s * 0.54, s * 0.2, s * 0.045, s * 0.02)
  ctx.fill()

  bolt(ctx, s * 0.12, s * 0.5, s * 0.055)
  bolt(ctx, s * 0.88, s * 0.5, s * 0.055)
}

function paintScout(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#e7f0ff'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.fill()

  eye(ctx, s * 0.36, s * 0.46, s * 0.13)
  eye(ctx, s * 0.64, s * 0.46, s * 0.13)

  ctx.strokeStyle = '#1c2433'
  ctx.lineWidth = s * 0.035
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.58, s * 0.12, 0.2, Math.PI - 0.2)
  ctx.stroke()

  bolt(ctx, s * 0.14, s * 0.62, s * 0.045)
  bolt(ctx, s * 0.86, s * 0.62, s * 0.045)
}

function paintFang(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#102216'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.fill()

  slantedEye(ctx, s * 0.36, s * 0.42, -0.45, s)
  slantedEye(ctx, s * 0.64, s * 0.42, 0.45, s)

  ctx.strokeStyle = '#b6ff9a'
  ctx.lineWidth = s * 0.03
  ctx.lineCap = 'round'
  for (const t of [0.58, 0.66, 0.74]) {
    ctx.beginPath()
    ctx.moveTo(s * 0.32, s * t)
    ctx.lineTo(s * 0.68, s * t)
    ctx.stroke()
  }

  bolt(ctx, s * 0.16, s * 0.7, s * 0.04)
  bolt(ctx, s * 0.84, s * 0.7, s * 0.04)
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#161a28'
  ctx.beginPath()
  ctx.arc(x + r * 0.15, y + r * 0.08, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
}

function slantedEye(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = '#f4fff0'
  round(ctx, -s * 0.11, -s * 0.045, s * 0.22, s * 0.09, s * 0.04)
  ctx.fill()
  ctx.fillStyle = '#06140c'
  ctx.beginPath()
  ctx.arc(s * 0.02, 0, s * 0.028, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function bolt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#d5dbe4'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6d7684'
  ctx.lineWidth = r * 0.35
  ctx.beginPath()
  ctx.moveTo(x - r * 0.55, y)
  ctx.lineTo(x + r * 0.55, y)
  ctx.moveTo(x, y - r * 0.55)
  ctx.lineTo(x, y + r * 0.55)
  ctx.stroke()
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function icosahedronVerts(): Array<[number, number, number]> {
  const t = (1 + Math.sqrt(5)) / 2
  const raw: Array<[number, number, number]> = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ]
  return raw.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z)
    return [x / len, y / len, z / len]
  })
}
