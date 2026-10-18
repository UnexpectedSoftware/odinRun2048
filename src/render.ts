import * as THREE from 'three'
import { createAvatar, disposeAvatar, tintAvatar } from './avatar'
import { styleFor } from './palette'
import { isSkinId, paintFace, paintFootball, skinById, type SkinId } from './skins'
import type { Body, Floor, Remote, Sim } from './sim'

/**
 * Follow camera sits on +z and looks toward −z. Screen-right is world +x.
 * Height stays on the track so a jump moves the ball on screen.
 */
export const CAM_BACK = 7.4
export const CAM_UP = 3.35
export const CAM_LOOK_AHEAD = 9
const CAM_FOCUS_Y = 0.55

export function placeCamera(camera: THREE.PerspectiveCamera, p: { x: number; y: number; z: number }) {
  camera.position.set(p.x * 0.35, CAM_FOCUS_Y + CAM_UP, p.z + CAM_BACK)
  camera.lookAt(p.x * 0.15, CAM_FOCUS_Y, p.z - CAM_LOOK_AHEAD)
  camera.updateMatrixWorld(true)
}

const SPIKE_COLOR = 0xff3355
const BARRIER_COLOR = 0xff9f1c
const BLOCK_COLOR = 0x6a5bff
const RAIL_LEFT = 0x00e5ff
const RAIL_RIGHT = 0xff2bd6

/**
 * Decorative meshes share the body's center and half extents, so a collider
 * and the mesh that draws it are the same box. Cones on a spike stay inside
 * that box. The center stripe and the star field are not colliders.
 */
export class View {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly labels: HTMLElement
  private readonly bodies = new Map<number, THREE.Object3D>()
  private readonly floors = new Map<number, THREE.Group>()
  private readonly labelNodes = new Map<number, HTMLDivElement>()
  private readonly sphere = new THREE.SphereGeometry(1, 28, 18)
  private readonly box = new THREE.BoxGeometry(1, 1, 1)
  private readonly cone = new THREE.ConeGeometry(0.2, 1, 6)
  private readonly ballMaterials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly spikeMat: THREE.MeshStandardMaterial
  private readonly barrierMat: THREE.MeshStandardMaterial
  private readonly blockMat: THREE.MeshStandardMaterial
  private readonly deckA: THREE.MeshStandardMaterial
  private readonly deckB: THREE.MeshStandardMaterial
  private readonly railL: THREE.MeshStandardMaterial
  private readonly railR: THREE.MeshStandardMaterial
  private player!: THREE.Group
  private skin: SkinId = 'visor'
  private readonly textures = new Map<SkinId, THREE.CanvasTexture>()
  private readonly remotes = new Map<string, { skin: SkinId; group: THREE.Group }>()
  private readonly remoteLabels = new Map<string, HTMLDivElement>()
  private readonly proj = new THREE.Vector3()
  private roll = 0
  private lastDistance = 0
  private width = 1
  private height = 1

  constructor(host: HTMLElement, labels: HTMLElement) {
    this.labels = labels
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setClearColor(0x120818)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.prepend(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220)
    this.scene.background = new THREE.Color(0x120818)
    this.scene.fog = new THREE.Fog(0x120818, 16, 62)

    const hemi = new THREE.HemisphereLight(0xb7c6ff, 0x2a1030, 0.85)
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.35)
    sun.position.set(6, 14, 8)
    this.scene.add(hemi, sun)

    this.spikeMat = this.lit(SPIKE_COLOR, 0.45)
    this.barrierMat = this.lit(BARRIER_COLOR, 0.35)
    this.blockMat = this.lit(BLOCK_COLOR, 0.18)
    this.deckA = new THREE.MeshStandardMaterial({ color: 0x17182c, roughness: 0.92, metalness: 0.04 })
    this.deckB = new THREE.MeshStandardMaterial({ color: 0x1d2040, roughness: 0.92, metalness: 0.04 })
    this.railL = this.lit(RAIL_LEFT, 0.85)
    this.railR = this.lit(RAIL_RIGHT, 0.85)

    this.setSkin('visor')
    this.scene.add(this.stars())
    this.resize()
  }

  setSkin(id: SkinId) {
    if (this.player && this.skin === id) return
    if (this.player) {
      this.scene.remove(this.player)
      disposeAvatar(this.player)
    }
    this.skin = id
    this.player = createAvatar(id, this.textureFor(id))
    this.scene.add(this.player)
  }

  resize() {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    if (width < 2 || height < 2) return
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  clear() {
    for (const obj of this.bodies.values()) this.scene.remove(obj)
    this.bodies.clear()
    for (const obj of this.floors.values()) this.scene.remove(obj)
    this.floors.clear()
    for (const node of this.labelNodes.values()) node.remove()
    this.labelNodes.clear()
    for (const entry of this.remotes.values()) {
      this.scene.remove(entry.group)
      disposeAvatar(entry.group)
    }
    this.remotes.clear()
    for (const node of this.remoteLabels.values()) node.remove()
    this.remoteLabels.clear()
    this.roll = 0
    this.lastDistance = 0
  }

  sync(sim: Sim, focus: { x: number; y: number; z: number } = sim.player) {
    const p = sim.player
    this.syncFloors(sim.floors)
    this.syncBodies(sim.bodies)
    this.syncRemotes(sim.remotes)
    const traveled = sim.distance - this.lastDistance
    if (traveled > 0) this.roll += traveled / Math.max(0.25, p.radius)
    this.lastDistance = sim.distance
    const punch = 1 + sim.pop * 0.28
    this.player.scale.setScalar(p.radius * punch)
    this.player.position.set(p.x, p.y, p.z)
    this.rollShell(this.player, this.skin, this.roll)
    tintAvatar(this.player, this.skin, sim.invuln > 0)
    const style = styleFor(p.value)
    placeCamera(this.camera, focus)
    this.placeLabel(
      this.labelFor('player'),
      p.value < 2 ? '?' : String(p.value),
      style,
      p.x,
      p.y + p.radius * 1.15,
      p.z,
      22 + p.radius * 28,
    )
    this.renderer.render(this.scene, this.camera)
  }

  private syncFloors(floors: Floor[]) {
    const seen = new Set<number>()
    for (const floor of floors) {
      seen.add(floor.id)
      let group = this.floors.get(floor.id)
      if (!group) {
        group = this.makeFloor(floor)
        this.floors.set(floor.id, group)
        this.scene.add(group)
      }
    }
    for (const [id, group] of this.floors) {
      if (seen.has(id)) continue
      this.scene.remove(group)
      this.floors.delete(id)
    }
  }

  private makeFloor(floor: Floor): THREE.Group {
    const group = new THREE.Group()
    const depth = floor.z1 - floor.z0
    const deck = new THREE.Mesh(this.box, floor.id % 2 === 0 ? this.deckA : this.deckB)
    deck.scale.set(floor.halfWidth * 2, 0.4, depth)
    deck.position.y = -0.2
    const left = new THREE.Mesh(this.box, this.railL)
    left.scale.set(0.16, 0.28, depth)
    left.position.set(-floor.halfWidth, 0.14, 0)
    const right = new THREE.Mesh(this.box, this.railR)
    right.scale.set(0.16, 0.28, depth)
    right.position.set(floor.halfWidth, 0.14, 0)
    const stripe = new THREE.Mesh(this.box, this.deckB)
    stripe.scale.set(0.08, 0.02, depth)
    stripe.position.y = 0.012
    group.add(deck, left, right, stripe)
    group.position.set(0, 0, (floor.z0 + floor.z1) / 2)
    return group
  }

  private syncBodies(bodies: Body[]) {
    const seen = new Set<number>()
    for (const body of bodies) {
      if (!body.alive) continue
      seen.add(body.id)
      let obj = this.bodies.get(body.id)
      if (!obj) {
        obj = this.makeBody(body)
        this.bodies.set(body.id, obj)
        this.scene.add(obj)
      }
      obj.position.set(body.x, body.y, body.z)
      if (body.kind === 'ball') {
        obj.scale.setScalar(Math.max(0.2, body.radius))
        const mesh = obj as THREE.Mesh
        const style = styleFor(body.value)
        mesh.material = this.ballMaterial(style.fill)
        const label = this.labelFor(body.id)
        this.placeLabel(
          label,
          body.pending || body.value < 2 ? '?' : String(body.value),
          style,
          body.x,
          body.y,
          body.z,
          16 + body.radius * 18,
        )
      }
    }
    for (const [id, obj] of this.bodies) {
      if (seen.has(id)) continue
      this.scene.remove(obj)
      this.bodies.delete(id)
      const label = this.labelNodes.get(id)
      if (label) {
        label.remove()
        this.labelNodes.delete(id)
      }
    }
  }

  private makeBody(body: Body): THREE.Object3D {
    if (body.kind === 'ball') {
      return new THREE.Mesh(this.sphere, this.ballMaterial(styleFor(body.value).fill))
    }
    if (body.kind === 'block') {
      const mesh = new THREE.Mesh(this.box, this.blockMat)
      mesh.scale.set(body.hx * 2, body.hy * 2, body.hz * 2)
      return mesh
    }
    const group = new THREE.Group()
    const pad = new THREE.Mesh(this.box, body.kind === 'spike' ? this.spikeMat : this.barrierMat)
    pad.scale.set(body.hx * 2, body.hy * 2, body.hz * 2)
    group.add(pad)
    if (body.kind === 'spike') {
      const count = Math.max(3, Math.floor((body.hx * 2) / 0.48))
      const span = body.hx * 2 * 0.86
      for (let i = 0; i < count; i++) {
        const cone = new THREE.Mesh(this.cone, this.spikeMat)
        const x = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1)
        cone.scale.set(1, body.hy * 1.7, 1)
        cone.position.set(x, 0, 0)
        group.add(cone)
      }
    }
    return group
  }

  private labelFor(id: number | 'player'): HTMLDivElement {
    const key = id === 'player' ? -1 : id
    let node = this.labelNodes.get(key)
    if (!node) {
      node = document.createElement('div')
      node.className = 'ball-label'
      node.dataset.role = id === 'player' ? 'player' : 'ball'
      this.labels.append(node)
      this.labelNodes.set(key, node)
    }
    return node
  }

  private placeLabel(
    node: HTMLDivElement,
    text: string,
    style: { fill: string; text: string },
    x: number,
    y: number,
    z: number,
    fontSize: number,
  ) {
    this.proj.set(x, y, z).project(this.camera)
    if (this.proj.z > 1) {
      node.hidden = true
      return
    }
    const dist = Math.hypot(x - this.camera.position.x, y - this.camera.position.y, z - this.camera.position.z)
    if (dist > 48) {
      node.hidden = true
      return
    }
    node.hidden = false
    node.textContent = text
    node.style.color = style.text
    node.style.background = style.fill
    const sized = Math.max(12, Math.min(fontSize, (fontSize * 8) / dist))
    node.style.fontSize = `${sized}px`
    const sx = (this.proj.x * 0.5 + 0.5) * this.width
    const sy = (-this.proj.y * 0.5 + 0.5) * this.height
    node.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`
  }

  private syncRemotes(remotes: Remote[]) {
    const seen = new Set<string>()
    for (const remote of remotes) {
      if (!remote.alive || !isSkinId(remote.skin)) continue
      seen.add(remote.id)
      let entry = this.remotes.get(remote.id)
      if (!entry || entry.skin !== remote.skin) {
        if (entry) {
          this.scene.remove(entry.group)
          disposeAvatar(entry.group)
        }
        entry = { skin: remote.skin, group: createAvatar(remote.skin, this.textureFor(remote.skin)) }
        this.remotes.set(remote.id, entry)
        this.scene.add(entry.group)
      }
      entry.group.position.set(remote.x, remote.y, remote.z)
      entry.group.scale.setScalar(Math.max(0.2, remote.radius))
      const shell = entry.group.getObjectByName('shell') as THREE.Mesh | undefined
      if (shell && skinById(remote.skin).rolls) shell.rotation.x = -remote.z / Math.max(0.25, remote.radius)
      const style = styleFor(remote.value)
      this.placeLabel(
        this.remoteLabel(remote.id),
        String(remote.value),
        style,
        remote.x,
        remote.y + remote.radius * 1.15,
        remote.z,
        22 + remote.radius * 28,
      )
    }
    for (const [id, entry] of this.remotes) {
      if (seen.has(id)) continue
      this.scene.remove(entry.group)
      disposeAvatar(entry.group)
      this.remotes.delete(id)
      const label = this.remoteLabels.get(id)
      if (label) {
        label.remove()
        this.remoteLabels.delete(id)
      }
    }
  }

  private remoteLabel(id: string): HTMLDivElement {
    let node = this.remoteLabels.get(id)
    if (!node) {
      node = document.createElement('div')
      node.className = 'ball-label'
      node.dataset.role = 'remote'
      this.labels.append(node)
      this.remoteLabels.set(id, node)
    }
    return node
  }

  private rollShell(group: THREE.Group, skin: SkinId, roll: number) {
    const shell = group.getObjectByName('shell') as THREE.Mesh | undefined
    if (!shell) return
    shell.rotation.x = skinById(skin).rolls ? roll : 0
  }

  private textureFor(id: SkinId): THREE.CanvasTexture {
    let texture = this.textures.get(id)
    if (texture) return texture
    const canvas = document.createElement('canvas')
    if (id === 'football') {
      canvas.width = 512
      canvas.height = 256
      paintFootball(canvas)
    } else {
      canvas.width = 256
      canvas.height = 256
      paintFace(canvas, id)
    }
    texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    this.textures.set(id, texture)
    return texture
  }

  private ballMaterial(fill: string) {
    let material = this.ballMaterials.get(fill)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: fill,
        emissive: fill,
        emissiveIntensity: 0.22,
        roughness: 0.42,
        metalness: 0.06,
      })
      this.ballMaterials.set(fill, material)
    }
    return material
  }

  private lit(color: number, emissiveIntensity: number) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      roughness: 0.48,
      metalness: 0.08,
    })
  }

  private stars() {
    const count = 280
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 160
      positions[i * 3 + 1] = 8 + Math.random() * 36
      positions[i * 3 + 2] = -130 + Math.random() * 180
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xfff6ea, size: 0.12, transparent: true, opacity: 0.85 }),
    )
  }
}
