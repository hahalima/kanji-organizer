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

    const vocabLink = screen.getByRole('link', { name: '一' })
    expect(vocabLink).toBeInTheDocument()

    const highlightButton = screen.getByRole('button', { name: 'Highlight' })
    fireEvent.click(highlightButton)
    expect(screen.getByRole('button', { name: 'Unhighlight' })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
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

    const highlighted = document.querySelector('.kanji-vocab-item.is-highlighted')
    expect(highlighted).not.toBeNull()
  })
})
