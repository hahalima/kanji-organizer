import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('shows stroke image in hover card when available', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const card = screen.getAllByText('One')[0].closest('.kanji-card')
    expect(card).not.toBeNull()
    fireEvent.mouseEnter(card)
    const img = screen.getAllByAltText('Stroke order')[0]
    expect(img).toBeInTheDocument()
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
})
