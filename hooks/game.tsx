import type { ClientSurface } from 'claude-code'

type Pipe = { x: number; gapY: number; scored: boolean }
type Game = {
  status: 'ready' | 'play' | 'dead'
  y: number
  vy: number
  pipes: Pipe[]
  score: number
  best: number
  tick: number
  scroll: number
  deadTicks: number
}

// One cell is two stacked square-ish pixels ('▀': foreground = top, background = bottom).
const SKY = '#4EC0CA'
const CLOUD = '#E6F8D4'
const CITY = '#A9DDC9'
const CITY_WIN = '#8CCBB6'
const OUTLINE = '#543847'
const PIPE_LIGHT = '#9CE659'
const PIPE_SHINE = '#E4FDC0'
const PIPE_MID = '#73BF2E'
const PIPE_DARK = '#558022'
const GRASS_A = '#9BE564'
const GRASS_B = '#5E9F28'
const SAND_A = '#DED895'
const SAND_B = '#D2C26B'
const BODY = '#D97757'
const BODY_DARK = '#B35A3D'
const EYE = '#2B1B17'

// Clawd, 9x6: '#' body, 'e' eye, 'd' darker (feet).
const SPRITE = [
  '.#######.',
  '.#e###e#.',
  '#########',
  '#########',
  '.#######.',
  '.dd...dd.',
]
const SPRITE_W = 9
const SPRITE_H = 6
const PIPE_W = 10

const GRAVITY = 0.1 // per tick, times k
const FLAP = -1.15
const MAX_FALL = 2.2
const SPEED = 0.8

// The pane body's size as the plugin last drew it (props of the Client).
const avail = { rows: 0, cols: 0 }

type Dims ={ cols: number; rows: number; W: number; H: number; S: number; k: number; gh: number; sx: number }

function dims(surface: ClientSurface<Game>): Dims {
  // One game pixel is a solid block 2 columns wide and 1 row tall: square, and no
  // line gap between rows (half-block glyphs left black lines on the desktop).
  const availCols = Math.max(surface.columns, avail.cols)
  const availRows = Math.max(surface.rows, avail.rows)
  const cols = Math.min(96, Math.max(32, availCols || 64))
  const rows = Math.min(60, Math.max(12, (availRows || 26) - 2))
  const W = Math.floor(cols / 2)
  const H = rows
  const S = Math.max(1, Math.floor(H / 48))
  return { cols, rows, W, H, S, k: H / 40, gh: 4 * S, sx: Math.round(W * 0.22) }
}

const fresh = (best: number, d: Dims): Game => ({
  status: 'ready',
  y: d.H / 2 - SPRITE_H,
  vy: 0,
  pipes: [],
  score: 0,
  best,
  tick: 0,
  scroll: 0,
  deadTicks: 0,
})

const gapHeight = (d: Dims) => Math.max(12 * d.S, Math.round(15 * d.k))

function newPipe(d: Dims, x: number): Pipe {
  const margin = 4 * d.S
  const low = margin
  const high = Math.max(low + 1, d.H - d.gh - gapHeight(d) - margin)
  return { x, gapY: Math.round(low + Math.random() * (high - low)), scored: false }
}

function step(g: Game, d: Dims): Game {
  const scroll = g.scroll + (g.status === 'dead' ? 0 : SPEED)
  const tick = g.tick + 1

  if (g.status === 'ready') {
    return { ...g, tick, scroll, y: d.H / 2 - SPRITE_H + Math.sin(tick / 4) * d.k }
  }

  const vy = Math.min(MAX_FALL * d.k, g.vy + GRAVITY * d.k)
  let y = g.y + vy
  const floor = d.H - d.gh - SPRITE_H * d.S

  if (g.status === 'dead') {
    if (y >= floor) y = floor
    return { ...g, tick, y, vy: y >= floor ? 0 : vy, deadTicks: g.deadTicks + 1 }
  }

  let score = g.score
  let pipes = g.pipes.map(p => ({ ...p, x: p.x - SPEED * d.k }))
  const spacing = Math.round(d.W * 0.75)
  const last = pipes[pipes.length - 1]
  if (!last || last.x < d.W - spacing) pipes.push(newPipe(d, last ? Math.max(d.W, last.x + spacing) : d.W + 4 * d.S))
  pipes = pipes.filter(p => p.x > -14 * d.S)
  for (const p of pipes) {
    if (!p.scored && p.x + (PIPE_W + 1) * d.S < d.sx) {
      p.scored = true
      score += 1
    }
  }

  let nextVy = vy
  if (y < 0) {
    y = 0
    nextVy = 0
  }
  let dead = y >= floor
  if (dead) y = floor
  const gap = gapHeight(d)
  const bx0 = d.sx + d.S
  const bx1 = d.sx + (SPRITE_W - 1) * d.S
  const by0 = y + d.S
  const by1 = y + (SPRITE_H - 0.5) * d.S
  for (const p of pipes) {
    const px0 = p.x - d.S
    const px1 = p.x + (PIPE_W + 1) * d.S
    if (bx1 > px0 && bx0 < px1 && (by0 < p.gapY || by1 > p.gapY + gap)) dead = true
  }

  return {
    ...g,
    y,
    vy: nextVy,
    pipes,
    score,
    best: Math.max(g.best, score),
    status: dead ? 'dead' : 'play',
    tick,
    scroll,
    deadTicks: 0,
  }
}

// What colour is the pixel at (x, y)? Painted back to front.
function pixel(g: Game, d: Dims, x: number, y: number): string {
  const { S, H } = d
  const sy = Math.round(g.y)
  // Clawd
  const dx = Math.floor((x - d.sx) / S)
  const dy = Math.floor((y - sy) / S)
  if (dx >= 0 && dx < SPRITE_W && dy >= 0 && dy < SPRITE_H) {
    let ch = SPRITE[dy][dx]
    if (ch === 'd' && Math.floor(g.tick / 3) % 2 === 0 && g.status === 'play') ch = '.'
    if (ch === '#') return BODY
    if (ch === 'e') return EYE
    if (ch === 'd') return BODY_DARK
  }

  // Pipes
  const gap = gapHeight(d)
  for (const p of g.pipes) {
    const px = Math.floor(p.x)
    const capH = 4 * S
    const bottomOfTop = p.gapY
    const topOfBottom = p.gapY + gap
    const inTop = y < bottomOfTop
    const inBottom = y >= topOfBottom && y < H - d.gh
    if (!inTop && !inBottom) continue
    const nearCap = inTop ? y >= bottomOfTop - capH : y < topOfBottom + capH
    if (nearCap) {
      const i = x - (px - S)
      if (i < 0 || i >= (PIPE_W + 2) * S) continue
      const rowInCap = inTop ? y - (bottomOfTop - capH) : y - topOfBottom
      if (rowInCap < S || rowInCap >= capH - S) return OUTLINE
      const u = Math.floor(i / S)
      return u === 0 || u === 11 ? OUTLINE : u === 1 || u === 3 || u === 4 ? PIPE_LIGHT : u === 2 ? PIPE_SHINE : u >= 9 ? PIPE_DARK : PIPE_MID
    }
    const i = x - px
    if (i < 0 || i >= PIPE_W * S) continue
    const u = Math.floor(i / S)
    return u === 0 || u === 9 ? OUTLINE : u === 1 || u === 3 ? PIPE_LIGHT : u === 2 ? PIPE_SHINE : u >= 7 ? PIPE_DARK : PIPE_MID
  }

  // Ground
  const gy = y - (H - d.gh)
  if (gy >= 0) {
    if (gy < S) return OUTLINE
    const sx = Math.floor(x + g.scroll)
    if (gy < 2 * S) return Math.floor(sx / (2 * S)) % 2 === 0 ? GRASS_A : GRASS_B
    if (gy < 3 * S) return GRASS_B
    return Math.floor((sx + gy) / (2 * S)) % 2 === 0 ? SAND_A : SAND_B
  }

  // Skyline: slow-moving cream clouds with city blocks in front.
  const far = x + g.scroll * 0.25
  const cloudTop = H * 0.62 - Math.abs(Math.sin(far / (9 * S))) * 4 * S - Math.abs(Math.sin(far / (5 * S) + 1)) * 2 * S
  const block = Math.floor(far / (6 * S))
  const bh = 5 * S + ((block * 7919) % 5) * 2 * S
  const cityTop = H - d.gh - bh
  if (y >= cityTop && Math.floor(far / S) % 6 !== 0 && Math.floor(far / S) % 6 < 5) {
    return y < cityTop + S ? CITY_WIN : CITY
  }
  if (y >= cloudTop) return CLOUD
  return SKY
}

export default function FlappyClawd(props: { best?: number; rows?: number; cols?: number }, surface: ClientSurface<Game>) {
  const { Box, Text } = surface.elements
  avail.rows = Number(props?.rows) || 0
  avail.cols = Number(props?.cols) || 0
  const d = dims(surface)

  let g = surface.state
  if (!g) {
    g = fresh(Number(props?.best) || 0, d)
    surface.setState(g)

    const flap = () => {
      const cur = surface.state
      if (!cur) return
      const dd = dims(surface)
      if (cur.status === 'dead') {
        if (cur.deadTicks > 8) surface.setState(fresh(cur.best, dd))
        return
      }
      surface.setState({ ...cur, status: 'play', vy: FLAP * dd.k })
    }

    surface.every(50, () => {
      const cur = surface.state
      if (!cur) return
      const next = step(cur, dims(surface))
      if (cur.status === 'play' && next.status === 'dead') surface.post({ best: next.best })
      surface.setState(next)
    })
    surface.onKey(k => {
      // The desktop may name the space bar rather than send " ": accept both.
      const key = String(k.key).toLowerCase()
      if (key === ' ' || key === 'space' || key === 'spacebar' || key === 'up' || key === 'arrowup' || key === 'return' || key === 'enter') flap()
      else if (key === 'r') {
        const cur = surface.state
        if (cur) surface.setState(fresh(cur.best, dims(surface)))
      }
    })
    surface.onPointer(p => {
      if (p.type === 'down') flap()
    })
  }

  // The tree may not serialize past 100000 characters (~100 per colour run):
  // sample every `xs`-th pixel column until the runs fit the budget.
  const MAX_RUNS = 600
  type Run = { n: number; color: string }
  let grid: Run[][] = []
  for (let xs = 1; xs <= 4; xs++) {
    grid = []
    let total = 0
    for (let r = 0; r < d.rows; r++) {
      const runs: Run[] = []
      for (let c = 0; c < d.W; c++) {
        const color = pixel(g, d, c - (c % xs), r)
        const last = runs[runs.length - 1]
        if (last && last.color === color) last.n += 1
        else runs.push({ n: 1, color })
      }
      total += runs.length
      grid.push(runs)
    }
    if (total <= MAX_RUNS) break
  }
  const lines = grid.map(runs => (
    <Box flexDirection="row" height={1}>
      {runs.map(run => (
        <Box width={run.n * 2} height={1} backgroundColor={run.color} />
      ))}
    </Box>
  ))

  const hint =
    g.status === 'ready'
      ? 'Cliquez ici puis espace / ↑ pour battre des ailes'
      : g.status === 'dead'
        ? 'Aïe ! espace ou clic pour rejouer'
        : 'Échap rend le clavier'

  return (
    <Box flexDirection="column">
      <Text bold>
        Score {g.score} · Record {g.best}
      </Text>
      {lines}
      <Text dimColor>{hint}</Text>
    </Box>
  )
}
