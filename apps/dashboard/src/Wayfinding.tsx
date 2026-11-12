import { DoubleSide } from 'three'
import StaticMerge from './StaticMerge'
import type { Department } from './hallLayout'
import { HUB, HUB_LAYOUT } from './hubLayout'

/** Each department's colour on the floor, and the number of sides of its emblem (a triangle, square, circle, diamond, hexagon). */
export const WAY: Record<Department, { color: string; sides: number; turn: number }> = {
  planning: { color: '#a78bfa', sides: 3, turn: Math.PI / 2 },
  development: { color: '#ffb347', sides: 4, turn: Math.PI / 4 },
  review: { color: '#22d3ee', sides: 48, turn: 0 },
}

const FLOOR = 0.045
const FROM = HUB.deckRadius + 0.6
const TO = 6.3
const EMBLEM_AT = 7.45

/** Glowing guide strips from the core to each bay, and an emblem on the floor in front of it, in the department's colour. */
export default function Wayfinding() {
  return (
    <StaticMerge>
      {HUB_LAYOUT.bays.map((bay) => {
        const { color, sides, turn } = WAY[bay.id]
        return (
          <group key={bay.id} rotation={[0, bay.angle, 0]}>
            {[-0.5, 0.5].map((x) => (
              <mesh key={x} position={[x, FLOOR, (FROM + TO) / 2]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.08, TO - FROM]} />
                <meshBasicMaterial color={color} toneMapped={false} side={DoubleSide} opacity={0.85} transparent />
              </mesh>
            ))}
            <mesh position={[0, FLOOR, EMBLEM_AT]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.52, 0.62, sides, 1, turn]} />
              <meshBasicMaterial color={color} toneMapped={false} side={DoubleSide} />
            </mesh>
            <mesh position={[0, FLOOR, EMBLEM_AT]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.2, 0.28, sides, 1, turn]} />
              <meshBasicMaterial color={color} toneMapped={false} side={DoubleSide} />
            </mesh>
          </group>
        )
      })}
    </StaticMerge>
  )
}
