import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createAvatar } from './avatar'
import { sphereDir } from './skins'
import { readControls } from './input'
import { placeCamera } from './render'
import { IDLE, createArena, start, step, type Input } from './sim'

function keys(...codes: string[]) {
  const held = new Set(codes)
  return { has: (code: string) => held.has(code) }
}

function run(input: Input, seconds: number) {
  const sim = createArena()
  start(sim)
  const dt = 1 / 60
  for (let i = 0; i < Math.round(seconds / dt); i++) step(sim, input, dt)
  return sim
}

describe('keyboard frame', () => {
  it('maps arrows and WASD onto strafe, jump, and fast-fall', () => {
    expect(readControls(keys('ArrowRight'), 0, false).strafe).toBe(1)
    expect(readControls(keys('KeyD'), 0, false).strafe).toBe(1)
    expect(readControls(keys('ArrowLeft'), 0, false).strafe).toBe(-1)
    expect(readControls(keys('KeyA'), 0, false).strafe).toBe(-1)
    expect(readControls(keys('KeyD', 'ArrowLeft'), 0, false).strafe).toBe(0)
    expect(readControls(keys('Space'), 0, false).jump).toBe(true)
    expect(readControls(keys('KeyW'), 0, false).jump).toBe(true)
    expect(readControls(keys('ArrowUp'), 0, false).jump).toBe(true)
    expect(readControls(keys('KeyS'), 0, false).fastFall).toBe(true)
    expect(readControls(keys('ArrowDown'), 0, false).fastFall).toBe(true)
    expect(readControls(keys(), 0, false)).toEqual(IDLE)
  })

  it('keeps the follow camera looking down −z so +x is screen-right', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
    const up = new THREE.Vector3(0, 1, 0)
    for (const x of [0, 4]) {
      placeCamera(camera, { x, y: 0.4, z: 0 })
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      expect(forward.z).toBeLessThan(-0.75)
      expect(Math.abs(forward.x)).toBeLessThan(0.2)
      const flat = forward.clone()
      flat.y = 0
      flat.normalize()
      const right = new THREE.Vector3().crossVectors(flat, up)
      expect(right.x).toBeGreaterThan(0.95)
      expect(Math.abs(right.z)).toBeLessThan(0.15)
    }
  })

  it('paints a robot face on the shell, on the +z side the camera sees', () => {
    const map = new THREE.Texture()
    const avatar = createAvatar('visor', map)
    const shell = avatar.getObjectByName('shell') as THREE.Mesh
    const mat = shell.material as THREE.MeshStandardMaterial
    expect(mat.map).toBe(map)
    expect(avatar.getObjectByName('face')).toBeUndefined()
    expect(createAvatar('football').getObjectByName('face')).toBeUndefined()
    expect(createAvatar('scout', map).getObjectByName('antenna')).toBeTruthy()
    const [dx, dy, dz] = sphereDir(127, 127, 512, 256)
    expect(dz).toBeGreaterThan(0.98)
    expect(Math.abs(dx)).toBeLessThan(0.05)
    expect(Math.abs(dy)).toBeLessThan(0.05)
  })

  it('moves the ball along that same right axis, and W jumps instead of walking', () => {
    const right = run({ strafe: 1, jump: false, fastFall: false }, 0.35)
    const left = run({ strafe: -1, jump: false, fastFall: false }, 0.35)
    const jump = run({ strafe: 0, jump: true, fastFall: false }, 0.35)
    const idle = run(IDLE, 0.35)
    expect(right.player.x).toBeGreaterThan(1)
    expect(left.player.x).toBeLessThan(-1)
    expect(jump.player.y).toBeGreaterThan(idle.player.y + 0.3)
    expect(Math.abs(jump.player.z - idle.player.z)).toBeLessThan(0.05)
  })
})
