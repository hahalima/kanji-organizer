import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

function getDetailKanjiText() {
  return document.querySelector('.kanji-detail-kanji')?.textContent?.trim() || ''
}

describe('Random Needs', () => {
  it('disables random actions when there are no Needs Work kanji', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByRole('button', { name: 'Random Needs (R)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset Random (Q)' })).toBeDisabled()
  })

  it('opens a Needs Work kanji detail page from the header action', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        familiarity: {
          1: 'needs_work',
          2: 'lukewarm',
          3: 'needs_work',
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByRole('button', { name: 'Reset Random (Q)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Random Needs (R)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '三']).toContain(getDetailKanjiText())
    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
  })

  it('does not immediately repeat while walking the random Needs Work queue', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        familiarity: {
          1: 'needs_work',
          2: 'needs_work',
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Random Needs (R)' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    const first = getDetailKanjiText()
    expect(['一', '二']).toContain(first)

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Needs (R)' }))

    await waitFor(() => {
      const second = getDetailKanjiText()
      expect(['一', '二']).toContain(second)
      expect(second).not.toBe(first)
    })
  })

  it('supports R to open random Needs Work and Q to reset the queue', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        familiarity: {
          1: 'needs_work',
          2: 'needs_work',
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByRole('button', { name: 'Reset Random (Q)' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '二']).toContain(getDetailKanjiText())

    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
    fireEvent.keyDown(window, { key: 'q', code: 'KeyQ' })

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Needs (R)' }))

    await waitFor(() => expect(['一', '二']).toContain(getDetailKanjiText()))
  })
})
