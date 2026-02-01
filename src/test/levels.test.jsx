import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Levels page', () => {
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

    expect(screen.getAllByText(/Level \d/).length).toBeGreaterThan(0)
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

  it('reshuffles when revisiting a level', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => 0.9)
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

    fireEvent.click(screen.getAllByText('Level 2')[0])
    await waitFor(() => expect(screen.getAllByText('Level 2').length).toBeGreaterThan(0))

    randomSpy.mockImplementation(() => 0.0)
    fireEvent.click(screen.getAllByText('Level 1')[0])
    await waitFor(() => expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0))

    let newOrder = null
    await waitFor(() => {
      newOrder = getOrderForLevel()
      expect(newOrder).toBeTruthy()
    })
    expect(newOrder).not.toEqual(firstOrder)
    randomSpy.mockRestore()
  })

  it('renders the progress bar', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(document.querySelector('.progress-bar')).not.toBeNull()
  })

  it('opens the source URL when clicking a card', async () => {
    const openSpy = vi.spyOn(window, 'open')
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    fireEvent.click(card)
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

    const readingButton = screen.getByText('いち')
    fireEvent.click(readingButton)

    let stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
    expect(stored.readingStatusByKanji['1'].いち).toBe('common')
    expect(stored.readingStatusByKanji['2']).toBeUndefined()

    fireEvent.click(readingButton)
    stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
    expect(stored.readingStatusByKanji['1'].いち).toBe('uncommon')

    fireEvent.click(readingButton, { altKey: true })
    stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
    expect(stored.readingStatusByKanji['1']).toBeUndefined()
  })
})
