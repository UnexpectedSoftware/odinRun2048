/**
 * Player-versus-player shove.
 *
 * Each client moves only its own ball. Mass is the volume, radius³, so a
 * larger ball keeps its line and a smaller one takes the hit.
 * The two shares of a pure separation add up to the overlap, and the extra
 * lateral kick makes a heavy neighbor shove you off the racing line.
 */

export interface BallPose {
  x: number
  y: number
  z: number
  radius: number
}

export interface Shove {
  x: number
  y: number
  z: number
}

const ZERO: Shove = { x: 0, y: 0, z: 0 }
const STEP_CAP = 0.28

export function ballMass(radius: number): number {
  return radius * radius * radius
}

export function shove(self: BallPose, other: BallPose): Shove {
  const dx = self.x - other.x
  const dy = self.y - other.y
  const dz = self.z - other.z
  const dist = Math.hypot(dx, dy, dz)
  const reach = self.radius + other.radius
  if (dist >= reach || dist < 1e-8) return ZERO

  const pen = reach - dist
  const nx = dx / dist
  const ny = dy / dist
  const nz = dz / dist
  const share = ballMass(other.radius) / (ballMass(self.radius) + ballMass(other.radius))

  let ox = nx * pen * share
  let oy = ny * pen * share
  let oz = nz * pen * share

  const lateral = Math.hypot(dx, dz)
  if (lateral > 1e-4) {
    const ratio = Math.min(1.6, ballMass(other.radius) / ballMass(self.radius))
    const kick = pen * (Math.abs(dx) / lateral) * ratio * 1.25
    ox += (dx / lateral) * kick
    oz += (dz / lateral) * kick * 0.35
  }

  const mostlyVertical = Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz)
  if (!mostlyVertical) oy = 0

  const mag = Math.hypot(ox, oy, oz)
  if (mag > STEP_CAP) {
    const scale = STEP_CAP / mag
    ox *= scale
    oy *= scale
    oz *= scale
  }
  return { x: ox, y: oy, z: oz }
}
