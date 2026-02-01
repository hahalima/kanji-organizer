import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Levels page', () => {
  it('renders level list and default content', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('One').length).toBeGreaterThan(0)
  })

  it('toggles hide state only for the current level', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Hide'))
    expect(screen.queryByText('One')).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getAllByText('Three').length).toBeGreaterThan(0)
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
})
