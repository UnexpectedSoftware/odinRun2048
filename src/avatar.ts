import * as THREE from 'three'
import { skinById, type SkinId } from './skins'

/**
 * Follow camera sits on +z and looks toward −z, so skin art is painted
 * onto that side of the shell. frame.test.ts checks the texel direction.
 */
const sphere = new THREE.SphereGeometry(1, 28, 18)
const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8)
const tipGeo = new THREE.SphereGeometry(0.065, 10, 8)

export function createAvatar(skin: SkinId, map?: THREE.Texture): THREE.Group {
  const spec = skinById(skin)
  const group = new THREE.Group()
  group.name = skin

  const shellMat = new THREE.MeshStandardMaterial({
    // A face texture already holds its colors. White leaves them alone.
    // Football's near-white shell multiplies the black patches.
    color: map && !spec.rolls ? '#ffffff' : spec.shell,
    emissive: '#000000',
    roughness: spec.rolls ? 0.55 : 0.62,
    metalness: 0.04,
    map: map ?? null,
  })
  const shell = new THREE.Mesh(sphere, shellMat)
  shell.name = 'shell'
  group.add(shell)

  if (skin === 'scout') group.add(antenna())
  return group
}

export function tintAvatar(group: THREE.Group, skin: SkinId, hurt: boolean) {
  const shell = group.getObjectByName('shell') as THREE.Mesh | undefined
  if (!shell) return
  const mat = shell.material as THREE.MeshStandardMaterial
  const spec = skinById(skin)
  if (mat.map) {
    mat.color.set(hurt ? '#ff8aa0' : spec.rolls ? spec.shell : '#ffffff')
    return
  }
  const color = hurt ? '#ff8aa0' : spec.shell
  mat.color.set(color)
  mat.emissive.set(color)
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
