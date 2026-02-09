import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

beforeEach(() => {
  window.history.pushState({}, '', '/')
  window.location.hash = ''
})

describe('Kanji detail page', () => {
  it('opens the detail page from the hover card', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    const openDetail = within(card).getByText('Open details')
    fireEvent.click(openDetail)

    expect(screen.getByText('Other meanings')).toBeInTheDocument()
    expect(screen.getByText('Vocab')).toBeInTheDocument()
  })

  it('shows vocab entries and allows highlighting', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const vocabLink = document.querySelector('.kanji-vocab-word')
    expect(vocabLink).toBeInTheDocument()

    const highlightButtons = screen.getAllByRole('button', { name: 'Highlight' })
    fireEvent.click(highlightButtons[0])
    expect(screen.getAllByRole('button', { name: 'Highlight: Orange' }).length).toBeGreaterThan(0)
    expect(document.querySelector('.kanji-vocab-item.lukewarm')).not.toBeNull()
  })

  it('shows highlighted vocab on the card hover', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    fireEvent.click(screen.getAllByRole('button', { name: 'Highlight' })[0])
    fireEvent.click(screen.getByText('Back'))

    await waitForLoaded(screen)
    let newCard = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      newCard = kanji.closest('.kanji-card')
      expect(newCard).not.toBeNull()
    })
    fireEvent.mouseEnter(newCard)
    expect(within(newCard).getByText('Highlighted vocab')).toBeInTheDocument()
    const vocabWord = newCard.querySelector('.hover-vocab-word')
    expect(vocabWord).not.toBeNull()
    expect(vocabWord.textContent).toBe('一')
  })

  it('matches hover highlighted vocab order with the detail list', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const vocabItems = document.querySelectorAll('.kanji-vocab-item')
    expect(vocabItems.length).toBeGreaterThan(1)
    fireEvent.mouseEnter(vocabItems[0])
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.mouseEnter(vocabItems[1])
    fireEvent.keyDown(window, { key: '3' })

    const detailOrder = Array.from(document.querySelectorAll('.kanji-vocab-item'))
      .map((item) => item.querySelector('.kanji-vocab-word')?.textContent?.trim())
      .filter(Boolean)

    fireEvent.click(screen.getByText('Back'))

    await waitForLoaded(screen)
    let newCard = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      newCard = kanji.closest('.kanji-card')
      expect(newCard).not.toBeNull()
    })
    fireEvent.mouseEnter(newCard)

    const hoverOrder = Array.from(newCard.querySelectorAll('.hover-vocab-item'))
      .map((item) => item.querySelector('.hover-vocab-word')?.textContent?.trim())
      .filter(Boolean)

    expect(hoverOrder).toEqual(detailOrder.slice(0, hoverOrder.length))
  })

  it('sorts highlighted vocab by green then orange on detail page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const vocabItems = document.querySelectorAll('.kanji-vocab-item')
    expect(vocabItems.length).toBeGreaterThan(1)
    fireEvent.mouseEnter(vocabItems[0])
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.mouseEnter(vocabItems[1])
    fireEvent.keyDown(window, { key: '3' })

    const ordered = Array.from(document.querySelectorAll('.kanji-vocab-item'))
    const firstStatus = ordered[0].className
    const secondStatus = ordered[1].className
    expect(firstStatus).toMatch(/comfortable/)
    expect(secondStatus).toMatch(/lukewarm/)
  })

  it('toggles vocab highlight with keyboard shortcut', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const vocabItem = document.querySelector('.kanji-vocab-item')
    expect(vocabItem).not.toBeNull()
    fireEvent.mouseEnter(vocabItem)
    fireEvent.keyDown(window, { key: '3' })

    const highlighted = document.querySelector('.kanji-vocab-item.comfortable')
    expect(highlighted).not.toBeNull()
  })

  it('unmarks vocab highlight with keyboard 4', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const vocabItem = document.querySelector('.kanji-vocab-item')
    expect(vocabItem).not.toBeNull()
    fireEvent.mouseEnter(vocabItem)
    fireEvent.keyDown(window, { key: '3' })
    expect(document.querySelector('.kanji-vocab-item.comfortable')).not.toBeNull()

    fireEvent.keyDown(window, { key: '4' })
    expect(document.querySelector('.kanji-vocab-item.comfortable')).toBeNull()
  })

  it('reorders vocab within the same status group', async () => {
    localStorage.setItem(
      'kanji_organizer_v1',
      JSON.stringify({
        familiarity: {},
        readingStatusByKanji: {},
        groups: [],
        ui: {},
        highlightedVocabByKanji: {
          一: {
            2501: { status: 'lukewarm', updated_at: new Date().toISOString() },
            2503: { status: 'lukewarm', updated_at: new Date().toISOString() },
          },
        },
        vocabOrderByKanji: {
          一: [2503, 2501],
        },
      })
    )
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))
    const vocabItems = Array.from(document.querySelectorAll('.kanji-vocab-item'))
    expect(vocabItems.length).toBeGreaterThan(1)
    const ordered = vocabItems.map((item) =>
      item.querySelector('.kanji-vocab-word')?.textContent?.trim()
    )
    expect(ordered[0]).toBe('一日')
    expect(ordered[1]).toBe('一')
  })

  it('prevents reordering vocab across different status groups', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    let vocabItems = Array.from(document.querySelectorAll('.kanji-vocab-item'))
    expect(vocabItems.length).toBeGreaterThan(1)
    fireEvent.mouseEnter(vocabItems[0])
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.mouseEnter(vocabItems[1])
    fireEvent.keyDown(window, { key: '2' })

    vocabItems = Array.from(document.querySelectorAll('.kanji-vocab-item'))
    const before = vocabItems.map((item) =>
      item.querySelector('.kanji-vocab-word')?.textContent?.trim()
    )

    fireEvent.dragStart(vocabItems[0])
    fireEvent.dragOver(vocabItems[1])
    fireEvent.drop(vocabItems[1])
    fireEvent.dragEnd(vocabItems[0])

    const after = Array.from(document.querySelectorAll('.kanji-vocab-item')).map((item) =>
      item.querySelector('.kanji-vocab-word')?.textContent?.trim()
    )
    expect(after).toEqual(before)
  })
})
