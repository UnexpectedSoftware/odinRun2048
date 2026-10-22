/**
 * Player-versus-player shove.
 *
 * Depth (z) is shared by every racer, so a bump never pushes someone ahead
 * or behind. Separation is sideways, or straight up when one ball lands on
 * another. Mass is the volume, radius³, and radius grows with the tier, so
 * a higher number keeps its line and the smaller ball takes the hit.
 * The two shares of a separation add up to the overlap. An extra lateral
 * kick lets a heavy neighbor shove you off the racing line. `bias` picks a
 * side only when the centers are stacked on the same x (±1).
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
const MASS_RATIO_CAP = 1.6
const KICK_GAIN = 0.45
const KICK_CAP = 0.08

export function ballMass(radius: number): number {
  return radius * radius * radius
}

export function shove(self: BallPose, other: BallPose, bias = 1): Shove {
  const dx = self.x - other.x
  const dy = self.y - other.y
  const reach = self.radius + other.radius
  // Farther apart down the lane than the two radii: not the same depth slice.
  // Callers racing together snap z first, so a stale packet still collides.
  if (reach <= 0 || Math.abs(self.z - other.z) >= reach) return ZERO
  const dist = Math.hypot(dx, dy)
  if (dist >= reach) return ZERO

  const selfMass = ballMass(self.radius)
  const otherMass = ballMass(other.radius)
  const share = otherMass / (selfMass + otherMass)
  const side = Math.abs(dx) > 1e-6 ? Math.sign(dx) : (bias >= 0 ? 1 : -1)
  const mostlyVertical = Math.abs(dy) > Math.abs(dx)

  if (mostlyVertical) {
    const span = Math.sqrt(Math.max(0, reach * reach - dx * dx))
    const pen = span - Math.abs(dy)
    if (pen <= 0) return ZERO
    const up = Math.abs(dy) > 1e-6 ? Math.sign(dy) : 1
    return { x: 0, y: up * pen * share, z: 0 }
  }

  const span = Math.sqrt(Math.max(0, reach * reach - dy * dy))
  const pen = span - Math.abs(dx)
  if (pen <= 0) return ZERO
  const ratio = Math.min(MASS_RATIO_CAP, otherMass / Math.max(selfMass, 1e-8))
  const kick = Math.min(KICK_CAP, pen * ratio * KICK_GAIN)
  return { x: side * (pen * share + kick), y: 0, z: 0 }
}
