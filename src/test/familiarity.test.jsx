import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Familiarity', () => {
  it('sets familiarity with keyboard 1/2/3/4 on hover', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    fireEvent.mouseEnter(card)
    fireEvent.keyDown(window, { key: '1' })
    expect(card.className).toMatch(/status-needs/)

    fireEvent.keyDown(window, { key: '2' })
    expect(card.className).toMatch(/status-lukewarm/)

    fireEvent.keyDown(window, { key: '3' })
    expect(card.className).toMatch(/status-comfortable/)

    fireEvent.keyDown(window, { key: '4' })
    expect(card.className).toMatch(/status-default/)
  })

  it('shows familiarity filter and counts on familiarity page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    expect(screen.getByText('Levels filter')).toBeInTheDocument()
    expect(screen.getByText(/Total:/)).toBeInTheDocument()
  })

  it('adds extra spacing to the familiarity page card grid', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    const grid = document
      .getElementById('familiarity-unmarked')
      ?.querySelector('.simple-grid')
    expect(grid).not.toBeNull()
    expect(grid.style.columnGap).toBe('18px')
    expect(grid.style.rowGap).toBe('20px')
    expect(grid.style.gridTemplateColumns).toContain('150px')
  })

  it('clears familiarity level filter', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    const filterInput = screen.getByPlaceholderText('e.g. 1...3, 5')
    fireEvent.change(filterInput, { target: { value: '1...2' } })
    expect(filterInput.value).toBe('1...2')
    fireEvent.click(screen.getByText('Clear'))
    expect(filterInput.value).toBe('')
  })

  it('toggles familiarity split and includes unmarked section', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Sort by Familiarity'))
    expect(document.querySelectorAll('.split-section').length).toBeGreaterThan(3)
    fireEvent.click(screen.getByText('Sort by Familiarity'))
    expect(document.querySelectorAll('.split-section').length).toBe(0)
  })

  it('shows lazy-loaded stroke images on hover cards and on the detail page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    fireEvent.mouseEnter(card)
    const hoverImg = await screen.findByAltText('Stroke order')
    expect(hoverImg.getAttribute('src')).toContain('/strokes_media/')
    expect(hoverImg.getAttribute('loading')).toBe('lazy')

    fireEvent.click(card)
    const img = await screen.findByAltText('Stroke order')
    expect(img.getAttribute('src')).toContain('/strokes_media/')
  })

  it('reorders cards with shift-drag on Familiarity page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    const section = document.getElementById('familiarity-unmarked')
    expect(section).not.toBeNull()

    const getOrder = () =>
      Array.from(section.querySelectorAll('.meaning')).map((el) => el.textContent)

    const before = getOrder()
    const cards = section.querySelectorAll('.kanji-card')
    expect(cards.length).toBeGreaterThan(1)

    fireEvent.keyDown(window, { key: 'Shift' })
    fireEvent.mouseDown(cards[0], { shiftKey: true })
    fireEvent.mouseEnter(cards[1])
    fireEvent.mouseUp(window)

    const after = getOrder()
    expect(after[0]).toBe(before[1])
  })

  it('scrolls to a familiarity section when clicking a status pill', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    const container = document.querySelector('.content')
    expect(container).not.toBeNull()

    const needsPill = document.querySelector('.count-badge.status-needs')
    expect(needsPill).not.toBeNull()
    container.scrollTo = vi.fn()
    const windowScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    fireEvent.click(needsPill)
    await waitFor(() =>
      expect(
        container.scrollTo.mock.calls.length + windowScroll.mock.calls.length
      ).toBeGreaterThan(0)
    )
    windowScroll.mockRestore()
  })

  it('navigates familiarity sections with left and right arrows', async () => {
    localStorage.setItem(
      'kanji_organizer_familiarity_v1',
      JSON.stringify({ 1: 'needs_work', 2: 'lukewarm' })
    )
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))

    await waitFor(() => {
      expect(document.querySelector('.count-badge.status-needs')?.textContent).toBe('1')
      expect(document.querySelector('.count-badge.status-lukewarm')?.textContent).toBe('1')
      expect(document.querySelector('.count-badge.status-default')?.textContent).toBe('2')
    })

    const container = document.querySelector('.content')
    expect(container).not.toBeNull()
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1600 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 })
    let activeSectionIndex = 2
    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 0,
      right: 0,
      width: 0,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => {},
    }))
    container.scrollTo = vi.fn(({ top }) => {
      if (top < 300) activeSectionIndex = 0
      else if (top < 700) activeSectionIndex = 1
      else activeSectionIndex = 2
    })

    const header = document.querySelector('.app-header')
    expect(header).not.toBeNull()
    Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 60 })

    const sections = [
      { id: 'familiarity-needs_work', top: 120, bottom: 420 },
      { id: 'familiarity-lukewarm', top: 460, bottom: 760 },
      { id: 'familiarity-comfortable', top: 800, bottom: 1100 },
      { id: 'familiarity-unmarked', top: 1140, bottom: 1440 },
    ]
    sections.forEach(({ id, top, bottom }) => {
      const element = document.getElementById(id)
      expect(element).not.toBeNull()
      element.getBoundingClientRect = vi.fn(() => ({
        top: top - activeSectionIndex * 680,
        bottom: bottom - activeSectionIndex * 680,
        left: 0,
        right: 0,
        width: 0,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => {},
      }))
    })

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(container.scrollTo).toHaveBeenCalledTimes(1))
    expect(container.scrollTo.mock.calls[0][0].behavior).toBe('auto')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(container.scrollTo).toHaveBeenCalledTimes(2))
    expect(container.scrollTo.mock.calls[1][0].behavior).toBe('auto')
  })

  it('toggles familiarity page between kanji and radicals', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Familiarity'))
    expect(screen.getByText('One')).toBeInTheDocument()

    const viewToggle = document.querySelector('.familiarity-view-toggle')
    expect(viewToggle).not.toBeNull()
    fireEvent.click(within(viewToggle).getByRole('button', { name: 'Radicals' }))
    expect(screen.getByText('Toe')).toBeInTheDocument()
    expect(screen.queryByText('One')).not.toBeInTheDocument()

    fireEvent.click(within(viewToggle).getByRole('button', { name: 'Kanji' }))
    expect(screen.getByText('One')).toBeInTheDocument()
  })
})
