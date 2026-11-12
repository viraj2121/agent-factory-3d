import type { Vec3 } from './hallLayout'
import type { GestureClip } from './robotVariants'
import { CATEGORIES, fadeToward, mixFor, type Category, type FocusId } from './soundFocus'
import { DEFAULT_VOLUME, distanceGain, gestureNotes, humSettings, masterGain, nearGain, nextTypingDelay, panFor, tubeNotes, typingGain, type Note } from './sound'

/** What the camera sees and hears right now, handed over once per frame by `SoundDirector`. */
export interface Listening {
  camera: Vec3
  /** The camera's right-hand direction. */
  right: Vec3
  /** How busy the project is, 0 to 1. */
  activity: number
  distanceToCore: number
  /** The nearest bay with robots at work, if any. */
  nearBay: { workers: number; distance: number; position: Vec3 } | null
}

type Listener = () => void

/**
 * The hall's sound, all made in code (no sound files): a low hum from the core, key taps near a busy bay,
 * a whoosh and a blip for each capsule in the tubes, a chime when one reaches the cradle, and a small tune
 * when you click a robot. It is off until you press the sound button, because browsers only allow audio
 * after a click. Everything is a no-op while off.
 */
class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private noise: AudioBuffer | null = null
  private hum: { gain: GainNode; oscillators: OscillatorNode[]; filter: BiquadFilterNode } | null = null
  /** The loops of the workshop round the launch pad: weld arc, motors, drone. Always running, silent until asked. */
  private shop: { arc: GainNode; buzz: GainNode; motor: GainNode; motorOsc: OscillatorNode; drone: GainNode; pan: StereoPannerNode | null } | null = null
  private listeners = new Set<Listener>()
  private seen: Listening = { camera: [0, 5, 20], right: [1, 0, 0], activity: 0, distanceToCore: 40, nearBay: null }
  private typingIn = 0.3
  private samples = new Uint8Array(512)

  on = false
  /** What has the user's attention: only its sounds play, and the rest fade out. A robot you click always plays its tune. */
  focus: FocusId = 'overview'
  private levels: Record<Category, number> = mixFor('overview')
  private wanted: Record<Category, number> = mixFor('overview')
  /** The volume slider's position, 0 to 1. Remembered between visits. */
  volume = (() => {
    try {
      const saved = window.localStorage.getItem('hub-volume')
      const value = Number(saved)
      return saved !== null && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME
    } catch {
      return DEFAULT_VOLUME
    }
  })()

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  /** Turns sound on. Must be called from a click or key press. */
  async enable() {
    if (this.on) return
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    if (!this.ctx) this.build(new Context())
    await this.ctx!.resume()
    this.master!.gain.cancelScheduledValues(this.ctx!.currentTime)
    this.master!.gain.setTargetAtTime(masterGain(this.volume), this.ctx!.currentTime, 0.15)
    this.on = true
    // a short two-note chime, so you know sound is really on
    this.play([{ frequency: 659, start: 0, duration: 0.22, gain: 0.1, wave: 'sine' }, { frequency: 988, start: 0.12, duration: 0.4, gain: 0.1, wave: 'sine' }], 1, 0)
    this.emit()
  }

  disable() {
    if (!this.on || !this.ctx || !this.master) return
    this.on = false
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08)
    const ctx = this.ctx
    window.setTimeout(() => {
      if (!this.on) void ctx.suspend()
    }, 400)
    this.emit()
  }

  /** Moves the volume slider: 0 to 1. */
  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_VOLUME))
    try {
      window.localStorage.setItem('hub-volume', String(this.volume))
    } catch {
      // the volume still applies for this visit
    }
    if (this.on && this.ctx && this.master) this.master.gain.setTargetAtTime(masterGain(this.volume), this.ctx.currentTime, 0.05)
    this.emit()
  }

  toggle() {
    if (this.on) this.disable()
    else void this.enable()
  }

  /** Quietly stops while the tab is hidden, and carries on when it is back. */
  pauseWhenHidden = () => {
    if (!this.ctx || !this.on) return
    if (document.hidden) void this.ctx.suspend()
    else void this.ctx.resume()
  }

  /** The browser's state for the audio: `running` when sound can really be heard, `suspended` when it is blocked. For checking. */
  state(): string {
    return this.ctx?.state ?? 'none'
  }

  /** How loud the output is right now, 0 to 1. For checking in the browser that sound really plays. */
  level(): number {
    if (!this.analyser) return 0
    this.analyser.getByteTimeDomainData(this.samples)
    let sum = 0
    for (const v of this.samples) sum += ((v - 128) / 128) ** 2
    return Math.sqrt(sum / this.samples.length)
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    this.samples = new Uint8Array(analyser.fftSize)
    // a compressor keeps the loud moments from clipping, and a make-up gain brings everything up to a level small speakers can use
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -20
    compressor.knee.value = 12
    compressor.ratio.value = 5
    compressor.attack.value = 0.005
    compressor.release.value = 0.2
    const makeup = ctx.createGain()
    makeup.gain.value = 1.1
    master.connect(compressor).connect(makeup).connect(analyser)
    analyser.connect(ctx.destination)
    this.master = master
    this.analyser = analyser

    // one second of white noise, reused for taps and whooshes
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noise = noise

    // the core's hum: a low note and its fifth, rounded off, slowly breathing
    const humGain = ctx.createGain()
    humGain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 520
    filter.Q.value = 2
    const oscillators = [110, 165, 55].map((f, i) => {
      const o = ctx.createOscillator()
      o.type = i === 2 ? 'sine' : 'sawtooth'
      o.frequency.value = f
      const level = ctx.createGain()
      level.gain.value = i === 1 ? 0.5 : 1
      o.connect(level).connect(filter)
      o.start()
      return o
    })
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.14
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 45
    lfo.connect(lfoDepth).connect(filter.frequency)
    lfo.start()
    filter.connect(humGain).connect(master)
    this.hum = { gain: humGain, oscillators, filter }

    // the workshop: a weld arc (hiss and a low buzz), the crane and turntable motor, and the inspection drone's rotors
    const bus = ctx.createGain()
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pan) bus.connect(pan).connect(master)
    else bus.connect(master)
    const quiet = () => {
      const g = ctx.createGain()
      g.gain.value = 0
      return g
    }
    // a real arc is a dense crackle of tiny pops over a frying sizzle: build both as short looping recordings of random clicks
    const clicks = (rate: number, level: number, seed: number) => {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let s = seed
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
      }
      const count = Math.floor(rate * 2)
      for (let k = 0; k < count; k++) {
        const at = Math.floor(rnd() * (data.length - 200))
        const length = Math.floor(ctx.sampleRate * (0.0003 + rnd() * 0.0012))
        const amp = rnd() * rnd() * level * (rnd() < 0.5 ? -1 : 1)
        for (let i = 0; i < length; i++) data[at + i] += amp * (1 - i / length) * (rnd() * 2 - 1)
      }
      return buffer
    }
    const arc = quiet()
    const crackle = ctx.createBufferSource()
    crackle.buffer = clicks(210, 1.6, 12345)
    crackle.loop = true
    const crackleBand = ctx.createBiquadFilter()
    crackleBand.type = 'bandpass'
    crackleBand.frequency.value = 3300
    crackleBand.Q.value = 0.6
    crackle.connect(crackleBand).connect(arc).connect(bus)
    crackle.start()
    const fizz = ctx.createBufferSource()
    fizz.buffer = clicks(2600, 0.5, 777)
    fizz.loop = true
    const fizzHigh = ctx.createBiquadFilter()
    fizzHigh.type = 'highpass'
    fizzHigh.frequency.value = 4200
    const fizzLevel = ctx.createGain()
    fizzLevel.gain.value = 0.5
    fizz.connect(fizzHigh).connect(fizzLevel).connect(arc)
    fizz.start()
    const buzzOsc = ctx.createOscillator()
    buzzOsc.type = 'sawtooth'
    buzzOsc.frequency.value = 120
    const buzzLow = ctx.createBiquadFilter()
    buzzLow.type = 'lowpass'
    buzzLow.frequency.value = 1600
    const buzz = quiet()
    buzzOsc.connect(buzzLow).connect(buzz).connect(bus)
    buzzOsc.start()
    const motorOsc = ctx.createOscillator()
    motorOsc.type = 'sawtooth'
    motorOsc.frequency.value = 110
    const motorLow = ctx.createBiquadFilter()
    motorLow.type = 'lowpass'
    motorLow.frequency.value = 1100
    const motor = quiet()
    motorOsc.connect(motorLow).connect(motor).connect(bus)
    motorOsc.start()
    const rotors = ctx.createOscillator()
    rotors.type = 'square'
    rotors.frequency.value = 170
    const flutter = ctx.createGain()
    flutter.gain.value = 0.5
    const flutterLfo = ctx.createOscillator()
    flutterLfo.frequency.value = 27
    const flutterDepth = ctx.createGain()
    flutterDepth.gain.value = 0.5
    flutterLfo.connect(flutterDepth).connect(flutter.gain)
    flutterLfo.start()
    const drone = quiet()
    rotors.connect(flutter).connect(drone).connect(bus)
    rotors.start()
    this.shop = { arc, buzz, motor, motorOsc, drone, pan }
  }

  /** Says what the camera is focused on; the sounds of everything else fade out. */
  setFocus(focus: FocusId) {
    if (focus === this.focus) return
    this.focus = focus
    this.wanted = mixFor(focus)
    this.emit()
  }

  /** Called once per frame by `SoundDirector`. */
  frame(dt: number, view: Listening) {
    this.seen = view
    for (const c of CATEGORIES) this.levels[c] = fadeToward(this.levels[c], this.wanted[c], dt)
    if (!this.on || !this.ctx || !this.hum) return
    const now = this.ctx.currentTime
    const h = humSettings(view.activity, view.distanceToCore)
    this.hum.gain.gain.setTargetAtTime(h.gain * this.levels.hum, now, 0.25)
    this.hum.oscillators.forEach((o, i) => o.frequency.setTargetAtTime(h.frequency * 2 * [1, 1.5, 0.5][i], now, 0.4))

    // key taps from the nearest busy bay
    const bay = view.nearBay
    const loud = (bay ? typingGain(bay.workers, bay.distance) : 0) * this.levels.typing
    this.typingIn -= dt
    if (this.typingIn <= 0) {
      this.typingIn = nextTypingDelay(Math.random) / Math.sqrt(Math.max(1, bay?.workers ?? 1))
      if (bay && loud > 0) this.tap(loud, panFor(view.camera, view.right, bay.position))
    }
    this.applyShop()
  }

  private route(pan: number): GainNode | null {
    if (!this.ctx || !this.master) return null
    const out = this.ctx.createGain()
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = pan
      out.connect(p).connect(this.master)
    } else out.connect(this.master)
    return out
  }

  private tap(loud: number, pan: number) {
    const ctx = this.ctx
    const out = this.route(pan + (Math.random() - 0.5) * 0.3)
    if (!ctx || !out || !this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800 + Math.random() * 2200
    band.Q.value = 2.5
    const now = ctx.currentTime
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(loud, now + 0.003)
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
    src.connect(band).connect(out)
    src.start(now, Math.random() * 0.8, 0.06)
  }

  private whoosh(loud: number, pan: number) {
    const ctx = this.ctx
    const out = this.route(pan)
    if (!ctx || !out || !this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 3
    const now = ctx.currentTime
    band.frequency.setValueAtTime(350, now)
    band.frequency.exponentialRampToValueAtTime(2200, now + 0.55)
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(0.28 * loud, now + 0.12)
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
    src.connect(band).connect(out)
    src.start(now, Math.random() * 0.2, 0.8)
  }

  private play(notes: Note[], loud: number, pan: number) {
    const ctx = this.ctx
    const out = this.route(pan)
    if (!ctx || !out) return
    const now = ctx.currentTime
    out.gain.value = 1
    for (const note of notes) {
      const o = ctx.createOscillator()
      o.type = note.wave
      const g = ctx.createGain()
      const begin = now + note.start
      const end = begin + note.duration
      o.frequency.setValueAtTime(note.frequency, begin)
      if (note.slideTo) o.frequency.exponentialRampToValueAtTime(note.slideTo, end)
      g.gain.setValueAtTime(0.0001, begin)
      g.gain.linearRampToValueAtTime(note.gain * loud, begin + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, end)
      o.connect(g).connect(out)
      o.start(begin)
      o.stop(end + 0.05)
    }
  }

  private at(position: Vec3, category?: Category): { loud: number; pan: number } {
    const [cx, cy, cz] = this.seen.camera
    // a sound that belongs to something the camera is not focused on is turned down (to nothing, once faded)
    const gate = category ? this.levels[category] : 1
    return {
      loud: distanceGain(Math.hypot(position[0] - cx, position[1] - cy, position[2] - cz)) * gate,
      pan: panFor(this.seen.camera, this.seen.right, position),
    }
  }

  /** A capsule leaves (whoosh), arrives (blip) or reaches the cradle (chime), at `position`. */
  tube(kind: 'depart' | 'arrive' | 'finish', position: Vec3) {
    if (!this.on) return
    const { loud, pan } = this.at(position, kind === 'finish' ? 'cradle' : 'tubes')
    if (loud < 0.02) return
    if (kind === 'depart') this.whoosh(loud, pan)
    else this.play(tubeNotes(kind), loud, pan)
  }

  private shopRequests: { level: { arc: number; motor: number; motorHz: number; drone: number }; position: Vec3; category: Category }[] = []

  /**
   * The machine loops of one element (the launch pad's weld arc, crane, turntable and drone; the library arm; the belt):
   * how strongly each should sound right now (0 to 1), and where the element is. Call every frame. Several elements
   * share the same few loops, so they only ask; the one the camera is focused on (and nearest to) gets them.
   */
  workshop(level: { arc: number; motor: number; motorHz: number; drone: number }, position: Vec3, category: Category = 'pad') {
    if (!this.on) return
    this.shopRequests.push({ level, position, category })
  }

  private applyShop() {
    const shop = this.shop
    const requests = this.shopRequests
    this.shopRequests = []
    if (!this.ctx || !shop) return
    const now = this.ctx.currentTime
    const [cx, cy, cz] = this.seen.camera
    let level = { arc: 0, motor: 0, motorHz: 100, drone: 0 }
    let position: Vec3 = [0, 0, 0]
    let near = 0
    for (const r of requests) {
      const n = nearGain(Math.hypot(r.position[0] - cx, r.position[1] - cy, r.position[2] - cz)) * this.levels[r.category]
      if (n >= near) {
        near = n
        level = r.level
        position = r.position
      }
    }
    shop.pan?.pan.setTargetAtTime(panFor(this.seen.camera, this.seen.right, position), now, 0.1)
    // the arc flares and dips from moment to moment, as the torch moves along the seam
    shop.arc.gain.setTargetAtTime(0.5 * level.arc * near * (0.45 + 0.55 * Math.random() ** 0.7), now, 0.02)
    shop.buzz.gain.setTargetAtTime(0.1 * level.arc * near * (0.8 + 0.2 * Math.random()), now, 0.04)
    shop.motor.gain.setTargetAtTime(0.12 * level.motor * near, now, 0.1)
    shop.motorOsc.frequency.setTargetAtTime(level.motorHz, now, 0.15)
    shop.drone.gain.setTargetAtTime(0.08 * level.drone * near, now, 0.2)
  }

  /** The sharp zap of the arc striking, at `position`. */
  arcStrike(position: Vec3) {
    const ctx = this.ctx
    if (!this.on || !ctx || !this.noise || this.levels.pad < 0.05) return
    const { loud, pan } = this.at(position, 'pad')
    const level = nearGain(Math.hypot(position[0] - this.seen.camera[0], position[1] - this.seen.camera[1], position[2] - this.seen.camera[2])) * Math.max(loud, 0.2)
    if (level < 0.02) return
    const out = this.route(pan)
    if (!out) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.2
    const now = ctx.currentTime
    band.frequency.setValueAtTime(6500, now)
    band.frequency.exponentialRampToValueAtTime(1400, now + 0.11)
    out.gain.setValueAtTime(0.0001, now)
    out.gain.linearRampToValueAtTime(0.45 * level, now + 0.004)
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    src.connect(band).connect(out)
    src.start(now, Math.random() * 0.5, 0.2)
    this.play([{ frequency: 1700, start: 0, duration: 0.09, gain: 0.07, wave: 'sawtooth', slideTo: 240 }], level, pan)
  }

  /** A box being filed on the library's shelves: a soft wooden thock and a click. */
  filed(position: Vec3) {
    if (!this.on) return
    const { loud, pan } = this.at(position, 'library')
    if (loud < 0.02) return
    this.play(
      [
        { frequency: 220, start: 0, duration: 0.13, gain: 0.16, wave: 'sine', slideTo: 120 },
        { frequency: 1500, start: 0, duration: 0.035, gain: 0.05, wave: 'square' },
      ],
      loud,
      pan,
    )
  }

  /** A countdown beep at `position`; higher at the last one. */
  beep(position: Vec3, high: boolean) {
    if (!this.on) return
    const { loud, pan } = this.at(position, 'pad')
    if (loud < 0.02) return
    this.play([{ frequency: high ? 1320 : 880, start: 0, duration: 0.14, gain: 0.07, wave: 'square' }], loud, pan)
  }

  /** A section landing on the rocket: a heavy thud and a metal ring. */
  clunk(position: Vec3) {
    if (!this.on) return
    const { loud, pan } = this.at(position, 'pad')
    if (loud < 0.02) return
    this.play(
      [
        { frequency: 95, start: 0, duration: 0.24, gain: 0.2, wave: 'sine', slideTo: 48 },
        { frequency: 340, start: 0, duration: 0.09, gain: 0.05, wave: 'square' },
        { frequency: 523, start: 0.01, duration: 0.3, gain: 0.025, wave: 'triangle' },
        { frequency: 787, start: 0.01, duration: 0.22, gain: 0.015, wave: 'triangle' },
      ],
      loud,
      pan,
    )
  }

  /** Lift-off: a long, deep rumble that can be heard (quietly) from anywhere in the hall, and a whoosh. */
  launch(position: Vec3) {
    const ctx = this.ctx
    if (!this.on || !ctx || !this.noise || this.levels.pad < 0.05) return
    const { loud, pan } = this.at(position, 'pad')
    const level = Math.max(loud, 0.25 * this.levels.pad)
    const out = this.route(pan)
    if (!out) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    const now = ctx.currentTime
    low.frequency.setValueAtTime(260, now)
    low.frequency.exponentialRampToValueAtTime(70, now + 6)
    out.gain.setValueAtTime(0.0001, now)
    out.gain.linearRampToValueAtTime(0.5 * level, now + 0.5)
    out.gain.setValueAtTime(0.5 * level, now + 3.5)
    out.gain.exponentialRampToValueAtTime(0.0001, now + 6.2)
    src.connect(low).connect(out)
    src.start(now)
    src.stop(now + 6.4)
    this.whoosh(level, pan)
  }

  /** Distant thunder, `delay` seconds from now: a low rumble that swells and dies away. */
  thunder(delay: number) {
    const ctx = this.ctx
    if (this.levels.weather < 0.05) return
    const out = this.route(0)
    if (!this.on || !ctx || !out || !this.noise) return
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    const start = ctx.currentTime + Math.max(0, delay)
    low.frequency.setValueAtTime(190, start)
    low.frequency.exponentialRampToValueAtTime(60, start + 2.4)
    out.gain.setValueAtTime(0.0001, start)
    out.gain.linearRampToValueAtTime(0.4 * this.levels.weather, start + 0.3)
    out.gain.exponentialRampToValueAtTime(0.0001, start + 2.6)
    src.connect(low).connect(out)
    src.start(start)
    src.stop(start + 2.8)
  }

  /** A robot at `position` performs `clip`. */
  gesture(clip: GestureClip, position: Vec3) {
    if (!this.on) return
    const { loud, pan } = this.at(position)
    if (loud < 0.02) return
    this.play(gestureNotes(clip), loud, pan)
  }
}

export const sound = new SoundEngine()
