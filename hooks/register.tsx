import type { Register } from 'claude-code'

const PANE = 'flappy-clawd'
const TITLE = 'Flappy Clawd'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'flappy-clawd',
      description: 'Play Flappy Clawd in a side pane while Claude thinks',
    })

    return next(e)
  })

  // Claude starts thinking: offer the game once per session (never closed by the mod).
  let offered = false
  on('turn.start', async ($, e, next) => {
    if (!offered) {
      offered = true
      void $.ui.open({ id: PANE, title: TITLE, rows: 40, columns: 96 })
    }

    return next(e)
  })

  on('command.run', { command: 'flappy-clawd' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true, rows: 40, columns: 96 })

    return { text: 'Flappy Clawd opened. Click the game, then press space to flap (Esc gives the keys back).' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Client } = $.ui.resolve(e) as { Client: (p: unknown) => unknown }
    const best = Number((await $.store.get('best')) ?? 0)
    // The pane body's size in cells: the Client's own region can come back small.
    const pane = e.props as { bodyColumns?: number; scroll?: { bodyRows?: number } } | undefined
    const rows = Number(pane?.scroll?.bodyRows ?? e.viewport?.rows ?? 0)
    const cols = Number(pane?.bodyColumns ?? e.viewport?.columns ?? 0)

    return <Client key="game" module="./game.tsx" props={{ best, rows, cols }} width="100%" height="100%" flexGrow={1} />
  })

  // The game posts a new high score when Clawd crashes.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const data = e.data as { best?: unknown } | null
    const best = Number(data?.best)
    if (Number.isFinite(best) && best > 0) {
      const held = Number((await $.store.get('best')) ?? 0)
      if (best > held) await $.store.set('best', Math.floor(best))
    }

    return next(e)
  })
}
