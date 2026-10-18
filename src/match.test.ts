import { describe, expect, it } from 'vitest'
import {
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  admitsPlayer,
  claimBall,
  createClaimBook,
  makeRoomCode,
  normalizeRoomCode,
  revertValue,
  rosterLabels,
  samplePoses,
  type NetPose,
} from './match'

function pose(over: Partial<NetPose> = {}): NetPose {
  return {
    x: 0,
    y: 0.4,
    z: 0,
    time: 0,
    vy: 0,
    value: 2,
    radius: 0.4,
    alive: true,
    skin: 'visor',
    seq: 1,
    ...over,
  }
}

describe('room codes', () => {
  it('builds a 5 character code from the unambiguous alphabet', () => {
    expect(ROOM_ALPHABET).not.toMatch(/[01IO]/)
    let n = 0
    const code = makeRoomCode(() => {
      n += 1
      return (n % ROOM_ALPHABET.length) / ROOM_ALPHABET.length
    })
    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    expect([...code].every((char) => ROOM_ALPHABET.includes(char))).toBe(true)
  })

  it('accepts a spoken code and rejects lookalike characters', () => {
    expect(normalizeRoomCode(' ab-cde ')).toBe('ABCDE')
    expect(normalizeRoomCode('ab-cd')).toBeNull()
    expect(normalizeRoomCode('hh234')).toBe('HH234')
    expect(normalizeRoomCode('o0000')).toBeNull()
    expect(normalizeRoomCode('hello')).toBeNull()
  })

  it('refuses a fifth player', () => {
    expect(admitsPlayer(3)).toBe(true)
    expect(admitsPlayer(4)).toBe(false)
  })
})

describe('roster', () => {
  it('labels the local player You and numbers the rest from the host', () => {
    expect(rosterLabels('me', 'me', [])).toEqual([{ id: 'me', label: 'You', host: true }])
    expect(rosterLabels('me', 'me', ['b', 'a'])).toEqual([
      { id: 'me', label: 'You', host: true },
      { id: 'a', label: 'Player 2', host: false },
      { id: 'b', label: 'Player 3', host: false },
    ])
    expect(rosterLabels('me', 'host', ['me'])).toEqual([
      { id: 'host', label: 'Player 1', host: true },
      { id: 'me', label: 'You', host: false },
    ])
  })
})

describe('claims', () => {
  it('denies a second claim and reverts only the matching merge', () => {
    const book = createClaimBook()
    expect(claimBall(book, { ballId: 3, peerId: 'a', valueBefore: 2 })).toBe('grant')
    expect(claimBall(book, { ballId: 3, peerId: 'b', valueBefore: 2 })).toBe('deny')
    expect(claimBall(book, { ballId: 3, peerId: 'a', valueBefore: 2 })).toBe('grant')
    expect(revertValue(4, 2)).toBe(2)
    expect(revertValue(8, 2)).toBeNull()
  })
})

describe('pose sampling', () => {
  it('interpolates between two snapshots', () => {
    const samples = [
      { t: 1, pose: pose({ x: 0, seq: 1 }) },
      { t: 1.2, pose: pose({ x: 2, value: 4, seq: 2 }) },
    ]
    const mid = samplePoses(samples, 1.2)
    expect(mid?.x).toBeCloseTo(1.2)
    expect(mid?.value).toBe(4)
    expect(samplePoses(samples, 1.1)?.value).toBe(2)
  })

  it('interpolates the race clock with the position', () => {
    const samples = [
      { t: 1, pose: pose({ time: 4, seq: 1 }) },
      { t: 1.2, pose: pose({ time: 6, seq: 2 }) },
    ]
    expect(samplePoses(samples, 1.2)?.time).toBeCloseTo(5.2)
  })

  it('uses the only sample before a second one arrives', () => {
    expect(samplePoses([{ t: 5, pose: pose({ z: -3 }) }], 5.1)?.z).toBe(-3)
  })
})
