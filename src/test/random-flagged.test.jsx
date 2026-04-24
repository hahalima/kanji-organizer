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

function getRandomFlaggedProgress(scope = document) {
  return scope.querySelector('.kanji-detail-random-flagged-count')?.textContent?.trim() || ''
}

describe('Random Review', () => {
  it('disables random actions when there are no matching review items', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Random Review (R)' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Reset Random (Q)' })).toBeDisabled()
    expect(document.querySelector('.kanji-detail-random-flagged-fab')).toBeNull()
  })

  it('disables random review when no filters are selected', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
        },
        ui: {
          randomReviewFilters: {
            flagged: false,
            statuses: {
              needs_work: false,
              lukewarm: false,
              comfortable: false,
              unmarked: false,
            },
          },
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Random Review (R)' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Reset Random (Q)' })).toBeDisabled()
  })

  it('opens a review item detail page from the header action with the default flagged-only filter', async () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '三']).toContain(getDetailKanjiText())
    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 2')
    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
    expect(getRandomFlaggedFab()).not.toBeNull()
  })

  it('supports familiarity-only review pools', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        familiarity: {
          2: 'needs_work',
          3: 'needs_work',
        },
        ui: {
          randomReviewFilters: {
            flagged: false,
            statuses: {
              needs_work: true,
              lukewarm: false,
              comfortable: false,
              unmarked: false,
            },
          },
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    expect(screen.getByRole('menuitem', { name: 'Random Review (R)' })).toBeEnabled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['二', '三']).toContain(getDetailKanjiText())
    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 2')
  })

  it('unions included sections for the review pool without duplicates', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
        },
        familiarity: {
          1: 'comfortable',
          2: 'needs_work',
          3: 'needs_work',
        },
        ui: {
          randomReviewFilters: {
            flagged: true,
            statuses: {
              needs_work: true,
              lukewarm: false,
              comfortable: false,
              unmarked: false,
            },
          },
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Study' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    expect(['一', '二', '三']).toContain(getDetailKanjiText())
    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 3')
  })

  it('filters out selected sections from the included pool', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          3: true,
        },
        familiarity: {
          2: 'needs_work',
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('一'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('0 / 2')

    fireEvent.click(within(detailActions).getByRole('button', { name: 'Review Pool' }))
    expect(screen.getByText('Review Pool')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Needs Work'))
    fireEvent.click(screen.getByLabelText('Filter Out Flagged'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.queryByText('Review Pool')).not.toBeInTheDocument())
    expect(getRandomFlaggedProgress(detailActions)).toBe('0 / 1')

    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Review (R)' }))

    await waitFor(() => expect(getDetailKanjiText()).toBe('二'))
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 1')
  })

  it('does not immediately repeat while walking the random review queue', async () => {
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    const first = getDetailKanjiText()
    expect(['一', '二']).toContain(first)

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 2')
    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Review (R)' }))

    await waitFor(() => {
      const second = getDetailKanjiText()
      expect(['一', '二']).toContain(second)
      expect(second).not.toBe(first)
    })
    expect(getRandomFlaggedProgress(detailActions)).toBe('2 / 2')
  })

  it('supports R to open random review and Q to reset the queue', async () => {
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

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 2')
    expect(screen.getAllByRole('button', { name: 'Reset Random (Q)' })[0]).toBeEnabled()
    fireEvent.keyDown(window, { key: 'q', code: 'KeyQ' })
    expect(getRandomFlaggedProgress(detailActions)).toBe('0 / 2')

    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Review (R)' }))

    await waitFor(() => expect(['一', '二']).toContain(getDetailKanjiText()))
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 2')
  })

  it('uses the floating button on the detail page when review items exist', async () => {
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
    expect(getRandomFlaggedProgress(fab)).toBe('0 / 2')
    fireEvent.click(fab)

    await waitFor(() => {
      const second = getDetailKanjiText()
      expect(['一', '二']).toContain(second)
      expect(second).not.toBe(first)
    })
    expect(getRandomFlaggedProgress(fab)).toBe('1 / 2')
  })

  it('keeps queue progress stable across manual navigation and continues the shuffled order', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          2: true,
          3: true,
        },
      })
    )

    try {
      render(<App />)
      await waitForLoaded(screen)

      fireEvent.click(screen.getByRole('button', { name: 'Study' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
      expect(getDetailKanjiText()).toBe('一')

      const detailActions = document.querySelector('.kanji-detail-actions')
      expect(detailActions).not.toBeNull()
      expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 3')

      fireEvent.click(screen.getByRole('button', { name: '二 Two' }))
      await waitFor(() => expect(getDetailKanjiText()).toBe('二'))
      expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 3')

      fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Review (R)' }))

      await waitFor(() => expect(getDetailKanjiText()).toBe('三'))
      expect(getRandomFlaggedProgress(detailActions)).toBe('2 / 3')
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('applies review settings and resets queue progress to the new pool', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        flaggedKanji: {
          1: true,
          3: true,
        },
        familiarity: {
          2: 'needs_work',
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('一'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())

    const detailActions = document.querySelector('.kanji-detail-actions')
    expect(detailActions).not.toBeNull()
    expect(getRandomFlaggedProgress(detailActions)).toBe('0 / 2')

    fireEvent.click(within(detailActions).getByRole('button', { name: 'Review Pool' }))
    expect(screen.getByText('Review Pool')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Flagged'))
    fireEvent.click(screen.getByLabelText('Needs Work'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.queryByText('Review Pool')).not.toBeInTheDocument())
    expect(getRandomFlaggedProgress(detailActions)).toBe('0 / 1')

    fireEvent.click(within(detailActions).getByRole('button', { name: 'Random Review (R)' }))

    await waitFor(() => expect(getDetailKanjiText()).toBe('二'))
    expect(getRandomFlaggedProgress(detailActions)).toBe('1 / 1')
  })

  it('renders the mobile random review action outside the detail card and keeps it working', async () => {
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
      expect(document.querySelector('.detail-page > .kanji-detail-mobile-actions')).toBe(mobileActions)
      expect(document.querySelector('.detail-page .content .kanji-detail-mobile-actions')).toBeNull()
      expect(document.querySelector('.kanji-detail-card .kanji-detail-random-flagged-fab')).toBeNull()

      const fab = mobileActions.querySelector('.kanji-detail-random-flagged-fab')
      expect(fab).not.toBeNull()
      expect(getRandomFlaggedProgress(fab)).toBe('0 / 2')
      fireEvent.click(fab)

      await waitFor(() => {
        const second = getDetailKanjiText()
        expect(['一', '二']).toContain(second)
        expect(second).not.toBe(first)
      })
      expect(getRandomFlaggedProgress(fab)).toBe('1 / 2')
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      })
    }
  })

  it('positions the kanji card at the top on mobile random review opens', async () => {
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
      fireEvent.click(screen.getByRole('menuitem', { name: 'Random Review (R)' }))

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

  it('removes the floating button when the last matching detail item is unflagged', async () => {
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
