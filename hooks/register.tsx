import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastAt } from '../types'

const TTL_MS = 60 * 60 * 1000
const WARN_MS = 5 * 60 * 1000

const lastAt = atom({ plugin: 'cache-timer', key: 'lastAt' } as const, null as LastAt)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)

const format = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const register: Register = on => {
  let warned = false
  let expired = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.ui.status(undefined)

    $.clock.every(1000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)

      const last = await read($, lastAt)
      if (last === null) {
        return
      }

      const left = last + TTL_MS - t

      if (left <= WARN_MS && left > 0 && !warned) {
        warned = true
        $.ui.toast('Prompt cache expires in 5 minutes')
      }
      if (left <= 0 && !expired) {
        expired = true
        $.ui.toast('Prompt cache expired: next message re-writes the full context')
      }
    })

    return result
  })

  // Each request in the main loop refreshes the cache; the turn's end is the last one.
  on('turn.start', async ($, e, next) => {
    const t = await $.clock.now()
    warned = false
    expired = false
    await update($, lastAt, () => t)
    await update($, now, () => t)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const t = await $.clock.now()
      warned = false
      expired = false
      await update($, lastAt, () => t)
      await update($, now, () => t)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const last = await read($, lastAt)
    if (e.props.hasSurvey || last === null) {
      return next(e)
    }

    const left = last + TTL_MS - (await read($, now))
    const color = left <= 0 ? 'red' : left <= WARN_MS ? 'red' : left <= 15 * 60 * 1000 ? 'yellow' : 'green'
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={color}>
          {left > 0
            ? `⏱ Cache warm: ${format(left)} left`
            : '⏱ Cache expired: next message pays full input price'}
        </Text>
      </Box>
    )
  })
}
