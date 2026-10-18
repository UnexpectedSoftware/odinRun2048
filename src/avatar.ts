import * as THREE from 'three'
import { skinById, type SkinId } from './skins'

/**
 * Follow camera sits on +z and looks toward −z, so the face the player sees
 * is the ball's +z side. CircleGeometry's normal is already +z.
 * frame.test.ts checks this placement.
 */
export const FACE_LOCAL_Z = 0.96

const sphere = new THREE.SphereGeometry(1, 28, 18)
const circle = new THREE.CircleGeometry(1, 28)
const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8)
const tipGeo = new THREE.SphereGeometry(0.065, 10, 8)

export function createAvatar(skin: SkinId, map?: THREE.Texture): THREE.Group {
  const spec = skinById(skin)
  const group = new THREE.Group()
  group.name = skin

  const shellMat = new THREE.MeshStandardMaterial({
    color: spec.shell,
    emissive: spec.rolls ? '#000000' : spec.shell,
    emissiveIntensity: spec.rolls ? 0 : 0.18,
    roughness: spec.rolls ? 0.55 : 0.38,
    metalness: spec.rolls ? 0.04 : 0.34,
    map: spec.rolls ? (map ?? null) : null,
  })
  const shell = new THREE.Mesh(sphere, shellMat)
  shell.name = 'shell'
  group.add(shell)

  if (!spec.rolls) {
    const faceMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.6,
      metalness: 0.04,
      map: map ?? null,
    })
    const face = new THREE.Mesh(circle, faceMat)
    face.name = 'face'
    face.position.set(0, 0.02, FACE_LOCAL_Z)
    face.scale.setScalar(0.92)
    group.add(face)
  }

  if (skin === 'scout') group.add(antenna())
  return group
}

export function tintAvatar(group: THREE.Group, skin: SkinId, hurt: boolean) {
  const shell = group.getObjectByName('shell') as THREE.Mesh | undefined
  if (!shell) return
  const mat = shell.material as THREE.MeshStandardMaterial
  const color = hurt ? '#ff8aa0' : skinById(skin).shell
  mat.color.set(color)
  if (!mat.map) mat.emissive.set(color)
}

export function disposeAvatar(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material.dispose()
  })
}

function antenna(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'antenna'
  const metal = new THREE.MeshStandardMaterial({ color: '#d5dbe6', metalness: 0.62, roughness: 0.32 })
  const glow = new THREE.MeshStandardMaterial({
    color: '#8ec5ff',
    emissive: '#3c7dff',
    emissiveIntensity: 0.85,
    roughness: 0.3,
  })
  const pole = new THREE.Mesh(poleGeo, metal)
  pole.position.y = 0.16
  const tip = new THREE.Mesh(tipGeo, glow)
  tip.position.y = 0.36
  group.add(pole, tip)
  group.position.set(0.18, 0.9, 0.28)
  return group
}
