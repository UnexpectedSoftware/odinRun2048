/** Original ball looks. Robot faces are chunky and mechanical, not copied characters. */

export const SKIN_IDS = ['visor', 'scout', 'fang', 'football', 'edgar', 'nori', 'sirius'] as const

export type SkinId = (typeof SKIN_IDS)[number]

/** Body color of each face. The shell uses the same color, so the sides match the art. */
const SHELL = {
  visor: '#1a2330',
  scout: '#e7f0ff',
  fang: '#102216',
  football: '#f7f7fb',
  edgar: '#f4e3ea',
  nori: '#12806e',
  sirius: '#1c1458',
} as const

export interface SkinSpec {
  id: SkinId
  name: string
  /** Shell color. Football multiplies the texture by this. Faces use the same color as their paint. */
  shell: string
  /** Football rolls. Robot faces stay upright toward the camera. */
  rolls: boolean
}

export const SKINS: readonly SkinSpec[] = [
  { id: 'visor', name: 'Visor', shell: SHELL.visor, rolls: false },
  { id: 'scout', name: 'Scout', shell: SHELL.scout, rolls: false },
  { id: 'fang', name: 'Fang', shell: SHELL.fang, rolls: false },
  { id: 'football', name: 'Football', shell: SHELL.football, rolls: true },
  { id: 'edgar', name: 'Edgar', shell: SHELL.edgar, rolls: false },
  { id: 'nori', name: 'Nori', shell: SHELL.nori, rolls: false },
  { id: 'sirius', name: 'Sirius', shell: SHELL.sirius, rolls: false },
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
  ctx.fillStyle = SHELL.football
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

type FaceId = Exclude<SkinId, 'football'>

const FACE_PAINT: Record<FaceId, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  visor: paintVisor,
  scout: paintScout,
  fang: paintFang,
  edgar: paintEdgar,
  nori: paintNori,
  sirius: paintSirius,
}

/** Direction of an equirectangular texel. +z is the side the follow camera sees. */
export function sphereDir(x: number, y: number, w: number, h: number): [number, number, number] {
  const theta = ((y + 0.5) / h) * Math.PI
  const phi = ((x + 0.5) / w) * Math.PI * 2
  const sinT = Math.sin(theta)
  return [-Math.cos(phi) * sinT, Math.cos(theta), Math.sin(phi) * sinT]
}

/**
 * Face painted onto the shell. The flat icon is projected onto the +z side,
 * and the rest of the ball is that skin's own color.
 */
export function paintCharacter(canvas: HTMLCanvasElement, id: FaceId) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const face = document.createElement('canvas')
  face.width = 512
  face.height = 512
  paintFace(face, id)
  const faceCtx = face.getContext('2d')
  if (!faceCtx) return
  const src = faceCtx.getImageData(0, 0, face.width, face.height).data
  const shell = rgb(skinById(id).shell)
  const w = canvas.width
  const h = canvas.height
  const image = ctx.createImageData(w, h)
  const data = image.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [dx, dy, dz] = sphereDir(x, y, w, h)
      const i = (y * w + x) * 4
      const u = dx * 0.5 + 0.5
      const v = -dy * 0.5 + 0.5
      const onFace = dz > 0 && u >= 0 && u < 1 && v >= 0 && v < 1
      if (onFace) {
        const sx = Math.min(face.width - 1, Math.max(0, Math.floor(u * face.width)))
        const sy = Math.min(face.height - 1, Math.max(0, Math.floor(v * face.height)))
        const si = (sy * face.width + sx) * 4
        const a = src[si + 3] / 255
        data[i] = src[si] * a + shell[0] * (1 - a)
        data[i + 1] = src[si + 1] * a + shell[1] * (1 - a)
        data[i + 2] = src[si + 2] * a + shell[2] * (1 - a)
      } else {
        data[i] = shell[0]
        data[i + 1] = shell[1]
        data[i + 2] = shell[2]
      }
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Face painted as the camera sees it: canvas +x is world +x, canvas top is world +y. */
export function paintFace(canvas: HTMLCanvasElement, id: FaceId) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = canvas.width
  ctx.clearRect(0, 0, s, s)
  FACE_PAINT[id](ctx, s)
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
    for (let x = 0; x < w; x++) {
      // Same direction Three.js SphereGeometry uses for this UV.
      const [dx, dy, dz] = sphereDir(x, y, w, h)
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
  ctx.fillStyle = SHELL.visor
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
  ctx.fillStyle = SHELL.scout
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
  ctx.fillStyle = SHELL.fang
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

/** Pale face, black sweep of hair, tired eyes, and a red-and-purple scarf. */
function paintEdgar(ctx: CanvasRenderingContext2D, s: number) {
  clipBall(ctx, s, SHELL.edgar)

  ctx.fillStyle = '#241828'
  ctx.beginPath()
  ctx.moveTo(s * 0.06, s * 0.46)
  ctx.quadraticCurveTo(s * 0.18, s * 0.08, s * 0.5, s * 0.16)
  ctx.quadraticCurveTo(s * 0.86, s * 0.24, s * 0.92, s * 0.42)
  ctx.quadraticCurveTo(s * 0.58, s * 0.3, s * 0.06, s * 0.46)
  ctx.fill()

  droopEye(ctx, s * 0.36, s * 0.48, s)
  droopEye(ctx, s * 0.64, s * 0.48, s)

  ctx.strokeStyle = '#6d4454'
  ctx.lineWidth = s * 0.028
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.66, s * 0.07, Math.PI + 0.55, Math.PI * 2 - 0.55)
  ctx.stroke()

  ctx.fillStyle = '#e0314a'
  round(ctx, s * 0.16, s * 0.74, s * 0.68, s * 0.1, s * 0.04)
  ctx.fill()
  ctx.fillStyle = '#f7f4f8'
  round(ctx, s * 0.16, s * 0.772, s * 0.68, s * 0.026, s * 0.013)
  ctx.fill()
  ctx.fillStyle = '#7b4dff'
  round(ctx, s * 0.16, s * 0.8, s * 0.2, s * 0.04, s * 0.02)
  ctx.fill()

  bolt(ctx, s * 0.16, s * 0.58, s * 0.04)
  bolt(ctx, s * 0.84, s * 0.58, s * 0.04)
  ctx.restore()
}

/** Sea-green fish hood, round face, and an orange bobber. */
function paintNori(ctx: CanvasRenderingContext2D, s: number) {
  clipBall(ctx, s, SHELL.nori)

  ctx.fillStyle = '#0c5c50'
  ctx.beginPath()
  ctx.moveTo(s * 0.38, s * 0.3)
  ctx.lineTo(s * 0.5, s * 0.05)
  ctx.lineTo(s * 0.62, s * 0.3)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#19a08c'
  for (const [x, y] of [
    [0.24, 0.38],
    [0.76, 0.4],
    [0.18, 0.62],
    [0.82, 0.64],
  ] as const) {
    ctx.beginPath()
    ctx.arc(s * x, s * y, s * 0.028, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#ffe3bf'
  ctx.beginPath()
  ctx.ellipse(s / 2, s * 0.56, s * 0.24, s * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#3a2418'
  ctx.lineWidth = s * 0.032
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s * 0.3, s * 0.48)
  ctx.lineTo(s * 0.43, s * 0.44)
  ctx.moveTo(s * 0.7, s * 0.48)
  ctx.lineTo(s * 0.57, s * 0.44)
  ctx.stroke()

  eye(ctx, s * 0.38, s * 0.55, s * 0.065)
  eye(ctx, s * 0.62, s * 0.55, s * 0.065)

  ctx.fillStyle = '#ff8c22'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.68, s * 0.05, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff2d8'
  ctx.beginPath()
  ctx.arc(s * 0.485, s * 0.665, s * 0.016, 0, Math.PI * 2)
  ctx.fill()

  bolt(ctx, s * 0.16, s * 0.5, s * 0.038)
  bolt(ctx, s * 0.84, s * 0.5, s * 0.038)
  ctx.restore()
}

/** Navy body, gold star mask, red eyes, and a red collar. */
function paintSirius(ctx: CanvasRenderingContext2D, s: number) {
  clipBall(ctx, s, SHELL.sirius)

  ctx.fillStyle = '#d31f3a'
  ctx.beginPath()
  ctx.ellipse(s / 2, s * 0.9, s * 0.36, s * 0.2, 0, Math.PI, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f2c94c'
  star(ctx, s / 2, s * 0.44, s * 0.25)
  star(ctx, s * 0.22, s * 0.3, s * 0.045)
  star(ctx, s * 0.78, s * 0.32, s * 0.038)
  star(ctx, s * 0.76, s * 0.66, s * 0.032)

  ctx.fillStyle = '#ff2d3a'
  ctx.beginPath()
  ctx.ellipse(s * 0.43, s * 0.45, s * 0.034, s * 0.02, -0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(s * 0.57, s * 0.45, s * 0.034, s * 0.02, 0.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#f2c94c'
  ctx.lineWidth = s * 0.02
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.64, s * 0.07, 0.3, Math.PI - 0.3)
  ctx.stroke()

  bolt(ctx, s * 0.16, s * 0.58, s * 0.038)
  bolt(ctx, s * 0.84, s * 0.58, s * 0.038)
  ctx.restore()
}

function clipBall(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, s, s)
}

function droopEye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const w = s * 0.1
  const h = s * 0.055
  ctx.fillStyle = '#fff8fb'
  round(ctx, x - w, y, w * 2, h, h * 0.45)
  ctx.fill()
  ctx.fillStyle = '#2a2030'
  ctx.beginPath()
  ctx.arc(x + w * 0.15, y + h * 0.55, s * 0.022, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#241828'
  round(ctx, x - w, y - h * 0.35, w * 2, h * 0.55, h * 0.3)
  ctx.fill()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
    const rad = i % 2 === 0 ? r : r * 0.42
    const px = x + Math.cos(a) * rad
    const py = y + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
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
