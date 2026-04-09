import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Levels page', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    window.location.hash = ''
  })

  it('renders level list and default content', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('One').length).toBeGreaterThan(0)
  })

  it('toggles global hide for card details', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Hide'))
    const details = document.querySelector('.card-details')
    expect(details).toBeNull()
    fireEvent.click(screen.getByText('Groups'))
    expect(document.querySelector('.group-meaning')).toBeNull()
  })

  it('renders sidebar levels list', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByRole('button', { name: 'Level 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Level 2' })).toBeInTheDocument()
  })

  it('shows header navigation and level actions', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getAllByText('Levels').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Groups').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Familiarity').length).toBeGreaterThan(0)
    expect(screen.getByText('Shuffle')).toBeInTheDocument()
    expect(screen.getByText('Hide')).toBeInTheDocument()
    expect(screen.getByText('Sort Alphabetically')).toBeInTheDocument()
  })

  it('toggles alphabetical sort on and off without crashing', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const button = screen.getByText('Sort Alphabetically')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getByText('Sort Alphabetically')).toBeInTheDocument()
  })

  it('clicking shuffle keeps the page responsive', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Shuffle'))
    expect(screen.getByText('Shuffle')).toBeInTheDocument()
  })

  it('supports arrow navigation between levels', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getAllByText('Level 2').length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0)
  })

  it('keeps level order when revisiting a level', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const getOrderForLevel = () => {
      const raw = localStorage.getItem('kanji_organizer_v1')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.ui?.orderByLevel?.[1] || null
    }

    let firstOrder = null
    await waitFor(() => {
      firstOrder = getOrderForLevel()
      expect(firstOrder).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Level 2' }))
    await waitFor(() => expect(screen.getAllByText('Level 2').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Level 1' }))
    await waitFor(() => expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0))

    let newOrder = null
    await waitFor(() => {
      newOrder = getOrderForLevel()
      expect(newOrder).toBeTruthy()
    })
    expect(newOrder).toEqual(firstOrder)
  })

  it('renders the progress bar', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(document.querySelector('.progress-bar')).not.toBeNull()
  })

  it('caps the main level grid width so rows do not exceed ten cards', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(document.querySelector('.level-grid-limit')).not.toBeNull()
  })

  it('uses the ten-card width cap for the shared level grid wrapper', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8')
    expect(css).toContain('width: min(100%, calc(10 * 150px + 9 * 12px));')
  })

  it('opens detail on click and source URL on cmd/ctrl-click', async () => {
    const openSpy = vi.spyOn(window, 'open')
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    fireEvent.click(card)
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const sameCard = screen.getAllByText('One')[0].closest('.kanji-card')
    fireEvent.click(sameCard, { metaKey: true })
    expect(openSpy).toHaveBeenCalled()
  })

  it('sets familiarity via the 3-dot menu', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    const menuTrigger = card.querySelector('.card-menu-trigger')
    expect(menuTrigger).not.toBeNull()
    fireEvent.click(menuTrigger)
    fireEvent.click(screen.getByText('Needs Work'))
    expect(card.className).toMatch(/status-needs/)
  })

  it('toggles colors off and on from the header', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    expect(card.className).toMatch(/status-default/)

    fireEvent.click(screen.getByText('Colors Off'))
    expect(document.querySelector('.app.is-decolor')).not.toBeNull()

    fireEvent.click(screen.getByText('Colors On'))
    expect(document.querySelector('.app.is-decolor')).toBeNull()
  })

  it('clears familiarity via the 3-dot menu', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    const menuTrigger = card.querySelector('.card-menu-trigger')
    fireEvent.click(menuTrigger)
    fireEvent.click(screen.getByText('Comfortable'))
    expect(card.className).toMatch(/status-comfortable/)

    fireEvent.click(menuTrigger)
    fireEvent.click(screen.getByText('Clear'))
    expect(card.className).toMatch(/status-default/)
  })

  it('toggles reading status per kanji and cycles with option-click', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    const readingButton = card.querySelector('.reading-token')
    expect(readingButton).not.toBeNull()
    fireEvent.click(readingButton)

    let stored = null
    await waitFor(() => {
      stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.readingStatusByKanji?.['1']?.いち).toBe('common')
    })
    expect(stored.readingStatusByKanji['2']).toBeUndefined()

    fireEvent.click(readingButton)
    await waitFor(() => {
      stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.readingStatusByKanji?.['1']?.いち).toBe('uncommon')
    })

    fireEvent.click(readingButton, { altKey: true })
    await waitFor(() => {
      stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.readingStatusByKanji?.['1']).toBeUndefined()
    })
  })

  it('shows only highlighted nanori readings on level cards', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        contentEditsByKanji: {
          '1': {
            nanori: 'かず, かつ',
          },
        },
        readingStatusByKanji: {
          '1': {
            かず: 'common',
          },
        },
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    expect(within(card).getByText('N:')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'かず' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'かつ' })).toBeNull()
  })

  it('locks local storage writes when storage lock is enabled', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByLabelText('Storage unlocked (click to lock)'))
    const before = localStorage.getItem('kanji_organizer_v1')

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    const menu = card.querySelector('.card-menu-trigger')
    fireEvent.click(menu)
    fireEvent.click(screen.getByText('Needs Work'))

    await waitFor(() => {
      expect(localStorage.getItem('kanji_organizer_v1')).toBe(before)
    })
    expect(card.className).toMatch(/status-default/)
  })

  it('shows read-only banner when another tab owns storage', async () => {
    localStorage.setItem(
      'kanji_organizer_owner_v1',
      JSON.stringify({ id: 'other-tab', ts: Date.now() })
    )
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByText('Read-only: another tab is active.')).toBeInTheDocument()
  })

  it('allows taking over storage ownership', async () => {
    localStorage.setItem(
      'kanji_organizer_owner_v1',
      JSON.stringify({ id: 'other-tab', ts: Date.now() })
    )
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Take Over'))
    expect(screen.queryByText('Read-only: another tab is active.')).toBeNull()
  })
})
