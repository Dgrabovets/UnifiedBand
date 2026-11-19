import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

const BG = '#070707'
const TEXT = '#f3f2ee'
const MUTED = '#8d8b84'
const GREEN = '#5fe08a'
const SANS = "Inter, 'Segoe UI', -apple-system, Roboto, sans-serif"
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace"

type Shot = { kind: 'shot'; frames: number; image: string; title: string; text: string; focus: string }
type Title = { kind: 'title'; frames: number }
type Outro = { kind: 'outro'; frames: number }
type Scene = Shot | Title | Outro

export const SCENES: Scene[] = [
  { kind: 'title', frames: 90 },
  { kind: 'shot', frames: 105, image: 'overview.png', title: 'Overview', text: 'Sessions, agent time, cost and tokens at a glance, for the period you pick.', focus: '30% 20%' },
  { kind: 'shot', frames: 90, image: 'projects.png', title: 'Projects', text: 'One table that is also the chart legend. Click a row to show or hide a project.', focus: '40% 40%' },
  { kind: 'shot', frames: 95, image: 'context.png', title: 'Context and limits', text: 'How fast your context fills, where compactions hit, and how close the limits got.', focus: '60% 30%' },
  { kind: 'shot', frames: 105, image: 'router.png', title: 'Model Router', text: 'Where your prompts went, what it saved, and why it changed the model.', focus: '50% 40%' },
  { kind: 'shot', frames: 90, image: 'reuse.png', title: 'Reuse', text: 'How well Ponytail keeps the code small: reuse, new code and open callers.', focus: '40% 30%' },
  { kind: 'shot', frames: 90, image: 'export.png', title: 'Export', text: 'Pick sections, pick a format: PDF, Markdown or Raw data.', focus: '50% 50%' },
  { kind: 'shot', frames: 105, image: 'share-card.png', title: 'Share card', text: 'A poster of your month, with cost and tokens per day.', focus: '45% 55%' },
  { kind: 'outro', frames: 120 },
]

export const totalFrames = (scenes: Scene[]) => scenes.reduce((n, s) => n + s.frames, 0)

const Logo = ({ size }: { size: number }) => (
  <svg width={size} height={(size * 32) / 28} viewBox="0 0 28 32">
    <path d="M14 1.6 25.4 8.2v15.6L14 30.4 2.6 23.8V8.2z" fill="none" stroke={TEXT} strokeWidth="1.8" strokeLinejoin="round" />
    <rect x="7" y="9.6" width="14" height="3" rx="1.5" fill={GREEN} />
    <rect x="7" y="14.6" width="10" height="3" rx="1.5" fill="#7c8cff" />
    <rect x="7" y="19.6" width="12" height="3" rx="1.5" fill="#ffd166" />
  </svg>
)

// A scene fades in and out at its edges so the cuts do not jump.
const useFade = (frames: number) => {
  const f = useCurrentFrame()
  return interpolate(f, [0, 12, frames - 12, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const TitleScene = ({ frames }: { frames: number }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fade = useFade(frames)
  const pop = spring({ frame: f, fps, config: { damping: 14 } })
  const lift = interpolate(f, [10, 40], [24, 0], clamp)
  const sub = interpolate(f, [28, 52], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', opacity: fade, fontFamily: SANS }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${GREEN}22, transparent 65%)` }} />
      <div style={{ transform: `scale(${0.7 + 0.3 * pop})`, opacity: pop }}>
        <Logo size={150} />
      </div>
      <div style={{ marginTop: 36, fontFamily: MONO, fontSize: 92, fontWeight: 700, color: TEXT, transform: `translateY(${lift}px)`, opacity: sub }}>Unified Band</div>
      <div style={{ marginTop: 22, fontSize: 38, color: MUTED, opacity: sub, textAlign: 'center', lineHeight: 1.4 }}>
        One band above the Claude Code prompt.
        <br />
        Ponytail inside. A Board of what you did.
      </div>
    </AbsoluteFill>
  )
}

const ShotScene = ({ scene }: { scene: Shot }) => {
  const f = useCurrentFrame()
  const fade = useFade(scene.frames)
  const zoom = interpolate(f, [0, scene.frames], [1, 1.04])
  const textIn = interpolate(f, [8, 28], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade, fontFamily: SANS }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 38%, ${GREEN}14, transparent 60%)` }} />
      <div style={{ position: 'absolute', left: 256, top: 56, width: 1408, height: 880, borderRadius: 26, overflow: 'hidden', border: '1px solid #2a2926', background: '#0b0b0b', boxShadow: '0 40px 120px rgba(0,0,0,.6)' }}>
        <Img src={staticFile(`images/${scene.image}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0%', transformOrigin: scene.focus, transform: `scale(${zoom})` }} />
      </div>
      <div style={{ position: 'absolute', left: 150, right: 150, bottom: 38, display: 'flex', alignItems: 'baseline', gap: 28, opacity: textIn, transform: `translateY(${(1 - textIn) * 14}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{scene.title}</div>
        <div style={{ fontSize: 30, color: TEXT, lineHeight: 1.3 }}>{scene.text}</div>
      </div>
    </AbsoluteFill>
  )
}

const OutroScene = ({ frames }: { frames: number }) => {
  const f = useCurrentFrame()
  const fade = useFade(frames)
  const a = interpolate(f, [8, 30], [0, 1], clamp)
  const b = interpolate(f, [30, 55], [0, 1], clamp)
  const code = { fontFamily: MONO, fontSize: 38, color: TEXT, background: '#141412', border: '1px solid #2a2926', borderRadius: 16, padding: '18px 30px' }
  return (
    <AbsoluteFill style={{ background: BG, alignItems: 'center', justifyContent: 'center', opacity: fade, fontFamily: SANS }}>
      <div style={{ opacity: a, display: 'flex', alignItems: 'center', gap: 28 }}>
        <Logo size={84} />
        <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: TEXT }}>Unified Band</div>
      </div>
      <div style={{ opacity: b, marginTop: 56, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
        <div style={code}>/plugin marketplace add Dgrabovets/UnifiedBand</div>
        <div style={code}>/plugin install unified-band@dgrabovets-plugins</div>
        <div style={{ marginTop: 18, fontSize: 30, color: MUTED }}>github.com/Dgrabovets/UnifiedBand</div>
      </div>
    </AbsoluteFill>
  )
}

export const Demo = () => {
  let from = 0
  return (
    <AbsoluteFill style={{ background: BG }}>
      {SCENES.map((scene, i) => {
        const start = from
        from += scene.frames
        return (
          <Sequence key={i} from={start} durationInFrames={scene.frames}>
            {scene.kind === 'title' ? <TitleScene frames={scene.frames} /> : scene.kind === 'outro' ? <OutroScene frames={scene.frames} /> : <ShotScene scene={scene} />}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

// The picture GitHub shows when the repository link is shared (1280 by 640).
export const Social = () => (
  <AbsoluteFill style={{ background: BG, fontFamily: SANS, flexDirection: 'row', alignItems: 'center', padding: '0 72px', gap: 56 }}>
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 78% 50%, ${GREEN}1c, transparent 60%)` }} />
    <div style={{ flex: 1, zIndex: 1 }}>
      <Logo size={96} />
      <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 68, fontWeight: 700, color: TEXT }}>Unified Band</div>
      <div style={{ marginTop: 16, fontSize: 30, color: MUTED, lineHeight: 1.4 }}>One band above the Claude Code prompt, Ponytail inside, and a Board of what you did.</div>
    </div>
    <div style={{ width: 560, height: 350, borderRadius: 20, overflow: 'hidden', border: '1px solid #2a2926', boxShadow: '0 30px 80px rgba(0,0,0,.6)', zIndex: 1 }}>
      <Img src={staticFile('images/overview.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 0%' }} />
    </div>
  </AbsoluteFill>
)
