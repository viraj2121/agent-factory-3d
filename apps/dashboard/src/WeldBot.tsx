import { useMemo, useRef, type MutableRefObject, type RefObject } from 'react'
import { BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3, type InstancedMesh, type PointLight } from 'three'
import RoleRobot from './RoleRobot'
import { weldPlacement, type WeldRig, type WeldRobot } from './rocket'
import type { AnyVariant } from './robotVariants'

/** What the rocket pad tells the welding robot every frame, and what the robot tells it back. */
export interface WeldCtrl {
  /** Height and radius of the seam ring the torch is on (or about to go to). */
  seamY: number
  seamR: number
  /** 0 (arm at rest) to 1 (torch tip exactly on the seam). */
  reach: number
  /** Where the robot ended up, in the pad's space; the pad reads it to draw the weld in the right place. */
  rig: WeldRig | null
  /** For checking in the browser: how far, in metres, the torch tip was from the seam point on the last frame the arm reached it. */
  tipError: number
}

/** Distance from the robot's shoulder to the middle of its hand, and the torch's length, in the model's units. */
const HAND = 0.3
const TORCH = 0.3

const DARK = new MeshStandardMaterial({ color: '#23272c', metalness: 0.6, roughness: 0.5 })
const STEEL = new MeshStandardMaterial({ color: '#cfd3d9', metalness: 0.85, roughness: 0.3 })
const COPPER = new MeshStandardMaterial({ color: '#c0721a', metalness: 0.8, roughness: 0.35 })
const HANDLE = new CylinderGeometry(0.03, 0.03, 0.12, 12).translate(0, 0.06, 0)
const COLLAR = new CylinderGeometry(0.042, 0.042, 0.03, 14).translate(0, 0.135, 0)
const NECK = new CylinderGeometry(0.016, 0.036, 0.1, 12).translate(0, 0.2, 0)
const NOZZLE = new CylinderGeometry(0.017, 0.017, 0.05, 10).translate(0, TORCH - 0.025, 0)
const SPARKS = 16
const UNIT = new BoxGeometry(1, 1, 1)
const DECK = new MeshStandardMaterial({ color: '#2b3036', metalness: 0.7, roughness: 0.55 })
const STEEL_PLATE = new MeshStandardMaterial({ color: '#4a5058', metalness: 0.8, roughness: 0.4 })
const CARRIAGE = new MeshStandardMaterial({ color: '#d6a21a', metalness: 0.55, roughness: 0.45 })
const RAIL = new MeshStandardMaterial({ color: '#e8b21c', metalness: 0.5, roughness: 0.45 })
const STRIP = new MeshBasicMaterial({ color: '#ffb347', toneMapped: false })
const SPARK_COLORS = ['#ffb347', '#ffe14d', '#ffffff']

interface Measure {
  robot: WeldRobot
  arm: Object3D
  head: Object3D | null
  /** The arm bone's rest rotation relative to the model, and its length axis in the bone's own space. */
  armRest: Quaternion
  armAxis: Vector3
  headRest: Quaternion
  headAxis: Vector3
  /** The torch's long part, stretched so its tip is exactly on the seam. */
  stretch: Group
}

const fract = (v: number) => v - Math.floor(v)
const rand = (i: number, k: number) => fract(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453)

/**
 * The welding robot, its lift platform and the sparks. Each frame, after its animation has run, the robot's arm bone
 * is aimed straight at the seam point and its torch is stretched to exactly the distance, so the tip sits on the
 * seam to the millimetre; the head looks at the weld. The robot and its lift are placed by `weldPlacement` so the
 * seam is always within reach. Demo motion.
 */
export default function WeldBot({
  ctrl,
  pad,
  tower,
  variant,
  seed,
  simple,
}: {
  ctrl: MutableRefObject<WeldCtrl>
  /** The pad's group, whose space everything here is in. */
  pad: RefObject<Group | null>
  tower: [number, number]
  variant: AnyVariant
  seed: number
  simple: boolean
}) {
  const place = useRef<Group>(null)
  const fx = useRef<Group>(null)
  const frame = useRef<Group>(null)
  const parts = useRef<Record<string, Object3D | null>>({})
  const sparks = useRef<InstancedMesh>(null)
  const arc = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  const measure = useRef<Measure | null>(null)
  const tools = useMemo(
    () => ({
      a: new Vector3(),
      b: new Vector3(),
      d: new Vector3(),
      q1: new Quaternion(),
      q2: new Quaternion(),
      q3: new Quaternion(),
      m: new Matrix4(),
      dummy: new Object3D(),
    }),
    [],
  )
  const sparkMaterial = useMemo(() => new MeshBasicMaterial({ color: SPARK_COLORS[0], toneMapped: false }), [])

  /** Measures the robot once its model exists, and fits the torch to its hand. */
  const onReady = (model: Object3D, size: number) => {
    const arm = model.getObjectByName('arm_r')
    const head = model.getObjectByName('head') ?? null
    if (!arm) return
    model.updateMatrixWorld(true)
    const inverse = tools.m.copy(model.matrixWorld).invert()
    const shoulder = arm.getWorldPosition(new Vector3()).applyMatrix4(inverse)
    const modelInverse = model.getWorldQuaternion(new Quaternion()).invert()
    const armRest = modelInverse.clone().multiply(arm.getWorldQuaternion(new Quaternion()))
    const headRest = head ? modelInverse.clone().multiply(head.getWorldQuaternion(new Quaternion())) : new Quaternion()
    // the length of the arm bone points down at rest; the head's front points forward (+z)
    const armAxis = new Vector3(0, -1, 0).applyQuaternion(armRest.clone().invert())
    const headAxis = new Vector3(0, 0, 1).applyQuaternion(headRest.clone().invert())

    arm.getObjectByName('weld-torch')?.removeFromParent()
    const holder = new Group()
    holder.name = 'weld-torch'
    holder.position.copy(armAxis).multiplyScalar(HAND)
    holder.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), armAxis)
    const stretch = new Group()
    holder.add(stretch)
    for (const [geometry, material] of [[HANDLE, DARK], [COLLAR, STEEL], [NECK, STEEL], [NOZZLE, COPPER]] as const) stretch.add(new Mesh(geometry, material))
    arm.add(holder)

    measure.current = {
      robot: { shoulderX: shoulder.x, shoulderY: shoulder.y, shoulderZ: shoulder.z, scale: size, reach: HAND + TORCH },
      arm,
      head,
      armRest,
      armAxis,
      headRest,
      headAxis,
      stretch,
    }
  }

  // when the arm is at rest the arc and sparks are off
  const arcOff = () => {
    if (arc.current) arc.current.visible = false
    if (sparks.current) sparks.current.visible = false
    if (light.current) light.current.intensity = 0
  }

  /** Sizes and places the pieces of the platform. Its own space: origin on the tower, +z toward the rocket, y 0 at the robot's feet. */
  const layOutPlatform = (root: [number, number, number], yaw: number) => {
    const g = frame.current
    if (!g) return
    const p = parts.current
    g.position.set(tower[0], root[1], tower[1])
    g.rotation.y = yaw
    const reach = Math.hypot(root[0] - tower[0], root[2] - tower[1])
    const back = 0.34
    const front = reach + 0.32
    const length = front - back
    const middle = (front + back) / 2
    const box = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = p[name]
      if (!m) return
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
    }
    box('deck', 0, -0.035, middle, 1, 0.07, length)
    box('strip', 0, 0.003, front - 0.03, 1, 0.012, 0.06)
    for (const side of [-1, 1]) {
      const n = side < 0 ? 'L' : 'R'
      box('toe' + n, side * 0.5, 0.05, middle, 0.025, 0.1, length)
      box('top' + n, side * 0.5, 0.95, (back + front - 0.3) / 2, 0.04, 0.04, length - 0.3)
      box('mid' + n, side * 0.5, 0.5, (back + front - 0.3) / 2, 0.035, 0.035, length - 0.3)
      box('postA' + n, side * 0.5, 0.475, back + 0.05, 0.045, 0.95, 0.045)
      box('postB' + n, side * 0.5, 0.475, front - 0.32, 0.045, 0.95, 0.045)
      box('beam' + n, side * 0.3, -0.16, (0.1 + front) / 2, 0.09, 0.14, front - 0.1)
    }
    box('carriage', 0, -0.2, 0, 0.74, 0.55, 0.74)
    // a diagonal strut from low on the carriage to the front of the deck, kept above the floor of the pad
    const from: [number, number] = [Math.max(-0.75, 0.22 - root[1] + 0.04), 0.12]
    const to: [number, number] = [-0.12, front - 0.25]
    const dy = to[0] - from[0]
    const dz = to[1] - from[1]
    const strut = p.strut
    if (strut) {
      strut.position.set(0, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
      strut.rotation.x = -Math.atan2(dy, dz)
      strut.scale.set(0.06, 0.06, Math.hypot(dy, dz))
    }
  }

  const afterPose = (model: Object3D, t: number) => {
    const m = measure.current
    const c = ctrl.current
    const padObject = pad.current
    const where = place.current
    if (!m || !padObject || !where) return

    // 1. stand the robot where the seam is in reach, facing the rocket
    const rig = weldPlacement(c.seamY, c.seamR, m.robot, tower)
    c.rig = rig
    where.position.set(rig.root[0], rig.root[1], rig.root[2])
    where.rotation.y = rig.yaw
    where.updateMatrixWorld(true)

    // 2. the work platform: a carriage on the tower, two beams and a strut out to a deck with rails, all following the robot
    layOutPlatform(rig.root, rig.yaw)

    // 3. aim the arm at the seam and stretch the torch to reach exactly
    const stretch = m.stretch
    if (c.reach < 0.001) {
      stretch.scale.y = 1
      arcOff()
      return
    }
    const seamWorld = padObject.localToWorld(tools.a.set(rig.seam[0], rig.seam[1], rig.seam[2]))
    const rootQ = model.getWorldQuaternion(tools.q1)
    const shoulder = m.arm.getWorldPosition(tools.b)
    const toSeam = tools.d.copy(seamWorld).sub(shoulder)
    const distance = toSeam.length()
    toSeam.divideScalar(distance)
    const restWorld = rootQ.clone().multiply(m.armRest)
    const restAxis = m.armAxis.clone().applyQuaternion(restWorld)
    const target = tools.q2.setFromUnitVectors(restAxis, toSeam).multiply(restWorld)
    const parent = (m.arm.parent ?? model).getWorldQuaternion(tools.q3).invert()
    m.arm.quaternion.slerp(parent.multiply(target), c.reach)
    m.arm.updateMatrixWorld(true)
    const worldScale = model.getWorldScale(tools.b).x
    stretch.scale.y = Math.min(1.8, Math.max(0.5, (distance / worldScale - HAND) / TORCH))
    stretch.updateMatrixWorld(true)
    if (c.reach > 0.999) c.tipError = stretch.localToWorld(tools.b.set(0, TORCH, 0)).distanceTo(seamWorld)

    // 4. the head watches the weld, within a comfortable turn
    if (m.head) {
      const headWorld = m.head.getWorldPosition(tools.b)
      const look = tools.d.copy(seamWorld).sub(headWorld).normalize()
      const headRestWorld = rootQ.clone().multiply(m.headRest)
      const front = m.headAxis.clone().applyQuaternion(headRestWorld)
      const angle = front.angleTo(look)
      const limited = angle > 0.9 ? front.clone().lerp(look, 0.9 / angle).normalize() : look
      const headTarget = tools.q2.setFromUnitVectors(front, limited).multiply(headRestWorld)
      const headParent = (m.head.parent ?? model).getWorldQuaternion(tools.q3).invert()
      m.head.quaternion.slerp(headParent.multiply(headTarget), 0.8 * c.reach)
    }

    // 5. the arc and sparks, exactly at the seam, only while the tip is on it
    const contact = c.reach > 0.97
    if (fx.current) fx.current.position.set(rig.seam[0], rig.seam[1], rig.seam[2])
    if (arc.current) {
      arc.current.visible = contact
      arc.current.scale.setScalar(0.7 + 0.6 * rand(1, Math.floor(t * 40)))
    }
    if (light.current) light.current.intensity = contact ? 1.5 + 2.5 * rand(2, Math.floor(t * 30)) : 0
    const mesh = sparks.current
    if (mesh) {
      mesh.visible = contact
      if (contact) {
        const out = tools.a.set(rig.seam[0], 0, rig.seam[2]).normalize()
        for (let i = 0; i < SPARKS; i++) {
          const phase = fract(t * 2.2 + i / SPARKS)
          const burst = Math.floor(t * 2.2 + i / SPARKS)
          const age = phase * 0.45
          const sideways = (rand(i, burst) - 0.5) * 1.4
          const up = 0.8 + rand(i, burst + 7) * 1.4
          const away = 0.5 + rand(i, burst + 3) * 1.2
          tools.dummy.position.set(out.x * away * age + -out.z * sideways * age, up * age - 4.9 * age * age, out.z * away * age + out.x * sideways * age)
          tools.dummy.scale.setScalar(Math.max(0.0001, 0.022 * (1 - phase)))
          tools.dummy.updateMatrix()
          mesh.setMatrixAt(i, tools.dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  return (
    <>
      <group ref={place}>
        <RoleRobot position={[0, 0, 0]} variant={variant} clip="idle" seed={seed} interactive={false} onReady={onReady} afterPose={afterPose} />
      </group>
      <group ref={frame}>
        {[
          ['deck', DECK],
          ['toeL', STEEL_PLATE],
          ['toeR', STEEL_PLATE],
          ['beamL', STEEL_PLATE],
          ['beamR', STEEL_PLATE],
          ['strut', STEEL_PLATE],
          ['carriage', CARRIAGE],
          ['topL', RAIL],
          ['topR', RAIL],
          ['midL', RAIL],
          ['midR', RAIL],
          ['postAL', RAIL],
          ['postAR', RAIL],
          ['postBL', RAIL],
          ['postBR', RAIL],
          ['strip', STRIP],
        ].map(([name, material]) => (
          <mesh key={name as string} ref={(m) => { parts.current[name as string] = m }} geometry={UNIT} material={material as MeshStandardMaterial} castShadow />
        ))}
      </group>
      <group ref={fx}>
        <mesh ref={arc} visible={false}>
          <sphereGeometry args={[0.035, 12, 8]} />
          <meshBasicMaterial color="#d6e6ff" toneMapped={false} />
        </mesh>
        {!simple && <pointLight ref={light} color="#bcd8ff" intensity={0} distance={2.6} decay={2} />}
        <instancedMesh ref={sparks} args={[undefined, sparkMaterial, SPARKS]} frustumCulled={false} visible={false}>
          <sphereGeometry args={[1, 6, 4]} />
        </instancedMesh>
      </group>
    </>
  )
}
