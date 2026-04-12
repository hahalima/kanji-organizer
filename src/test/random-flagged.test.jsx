import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

function getDetailKanjiText() {
  return document.querySelector('.kanji-detail-kanji')?.textContent?.trim() || ''
}

function getRandomFlaggedFab() {
  return document.querySelector('.kanji-detail-random-flagged-fab')
}

describe('Random Flagged', () => {
  it('disables random actions when there are no flagged kanji', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Random Flagged (R)' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Reset Random (Q)' })).toBeDisabled()
    expect(document.querySelector('.kanji-detail-random-flagged-fab')).toBeNull()
  })

  it('opens a flagged kanji detail page from the header action', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          3: true,
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Reset Random (Q)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Flagged (R)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '三']).toContain(getDetailKanjiText())
    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
    expect(getRandomFlaggedFab()).not.toBeNull()
  })

  it('does not immediately repeat while walking the random flagged queue', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Flagged (R)' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    const first = getDetailKanjiText()
    expect(['一', '二']).toContain(first)

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Flagged (R)' }))

    await waitFor(() => {
      const second = getDetailKanjiText()
      expect(['一', '二']).toContain(second)
      expect(second).not.toBe(first)
    })
  })

  it('supports R to open random flagged and Q to reset the queue', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Reset Random (Q)' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '二']).toContain(getDetailKanjiText())

    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
    fireEvent.keyDown(window, { key: 'q', code: 'KeyQ' })

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Flagged (R)' }))

    await waitFor(() => expect(['一', '二']).toContain(getDetailKanjiText()))
  })

  it('uses the floating button on the detail page when flagged kanji exist', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('一'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())

    const first = getDetailKanjiText()
    expect(first).toBe('一')

    const fab = getRandomFlaggedFab()
    expect(fab).not.toBeNull()
    fireEvent.click(fab)

    await waitFor(() => {
      const second = getDetailKanjiText()
      expect(['一', '二']).toContain(second)
      expect(second).not.toBe(first)
    })
  })

  it('renders the mobile random flagged action outside the detail card and keeps it working', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    })

    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
        },
      })
    )

    try {
      render(<App />)
      await waitForLoaded(screen)

      fireEvent.click(screen.getByText('一'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())

      const first = getDetailKanjiText()
      expect(first).toBe('一')

      const mobileActions = document.querySelector('.kanji-detail-mobile-actions')
      expect(mobileActions).not.toBeNull()
      expect(document.querySelector('.kanji-detail-card .kanji-detail-random-flagged-fab')).toBeNull()

      const fab = mobileActions.querySelector('.kanji-detail-random-flagged-fab')
      expect(fab).not.toBeNull()
      fireEvent.click(fab)

      await waitFor(() => {
        const second = getDetailKanjiText()
        expect(['一', '二']).toContain(second)
        expect(second).not.toBe(first)
      })
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      })
    }
  })

  it('positions the kanji card at the top on mobile random flagged opens', async () => {
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const originalInnerWidth = window.innerWidth
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoViewMock = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    })

    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          3: true,
        },
      })
    )

    try {
      render(<App />)
      await waitForLoaded(screen)

      fireEvent.click(screen.getByRole('button', { name: 'Study' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Random Flagged (R)' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
      expect(
        scrollIntoViewMock.mock.calls.some(
          (call) => call[0]?.block === 'start' && call[0]?.behavior === 'auto'
        )
      ).toBe(true)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      })
      rafSpy.mockRestore()
      cancelSpy.mockRestore()
    }
  })

  it('removes the floating button when the last flagged detail item is unflagged', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('一'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(getRandomFlaggedFab()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Kanji flag: Flagged' }))

    await waitFor(() => {
      expect(getRandomFlaggedFab()).toBeNull()
    })
  })
})
