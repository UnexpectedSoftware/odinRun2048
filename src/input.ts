import type { Input } from './sim'

export interface KeyState {
  has(code: string): boolean
}

/**
 * Arrows and WASD both drive the ball.
 * Left/A and Right/D strafe. Up/W and Space jump. Down/S fast-falls.
 * Strafe is +1 to the player's right, which is world +x with the follow camera.
 */
export function readControls(keys: KeyState, touchStrafe: number, touchJump: boolean): Input {
  let strafe = touchStrafe
  if (keys.has('ArrowLeft') || keys.has('KeyA')) strafe -= 1
  if (keys.has('ArrowRight') || keys.has('KeyD')) strafe += 1
  if (strafe > 1) strafe = 1
  if (strafe < -1) strafe = -1
  const jump = touchJump || keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW')
  const fastFall = keys.has('ArrowDown') || keys.has('KeyS')
  return { strafe, jump, fastFall }
}
