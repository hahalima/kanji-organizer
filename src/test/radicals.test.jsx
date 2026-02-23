import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

beforeEach(() => {
  window.history.pushState({}, '', '/')
  window.location.hash = ''
})

describe('Radicals page', () => {
  const getRadicalOrder = () =>
    Array.from(document.querySelectorAll('.radical-card .meaning')).map((el) => el.textContent?.trim())

  it('renders radicals grouped by level', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    expect(screen.getByRole('heading', { name: 'Level 1' })).toBeInTheDocument()
    expect(screen.getByText('Toe')).toBeInTheDocument()
    expect(screen.getByText('Fins')).toBeInTheDocument()
  })

  it('opens detail page on click and WK URL on cmd-click', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    let card = null
    await waitFor(() => {
      const meaning = screen.getByText('Toe')
      card = meaning.closest('.radical-card')
      expect(card).not.toBeNull()
    })

    fireEvent.click(card)
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Related kanji')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const toeCardAgain = screen.getByText('Toe').closest('.radical-card')
    fireEvent.click(toeCardAgain, { ctrlKey: true })
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/radical/toe',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('keeps radical familiarity separate from kanji familiarity', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    let radicalCard = null
    await waitFor(() => {
      const meaning = screen.getByText('Toe')
      radicalCard = meaning.closest('.radical-card')
      expect(radicalCard).not.toBeNull()
    })
    fireEvent.mouseEnter(radicalCard)
    fireEvent.keyDown(window, { key: '1' })
    expect(radicalCard.className).toMatch(/status-needs/)

    fireEvent.click(screen.getByRole('button', { name: 'Levels' }))
    let kanjiCard = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      kanjiCard = kanji.closest('.kanji-card')
      expect(kanjiCard).not.toBeNull()
    })
    fireEvent.mouseEnter(kanjiCard)
    fireEvent.keyDown(window, { key: '3' })
    expect(kanjiCard.className).toMatch(/status-comfortable/)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    const toeCard = screen.getByText('Toe').closest('.radical-card')
    expect(toeCard.className).toMatch(/status-needs/)
  })

  it('supports radical detail prev/next navigation with buttons and arrow keys', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sort Alphabetically' }))
    const cards = Array.from(document.querySelectorAll('.radical-card'))
    fireEvent.click(cards[0])

    const currentMeaning = document.querySelector('.kanji-detail-meaning')?.textContent?.trim()
    expect(currentMeaning).toBeTruthy()
    const nextButton = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(nextButton)
    const nextMeaning = document.querySelector('.kanji-detail-meaning')?.textContent?.trim()
    expect(nextMeaning).toBeTruthy()
    expect(nextMeaning).not.toBe(currentMeaning)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const backMeaning = document.querySelector('.kanji-detail-meaning')?.textContent?.trim()
    expect(backMeaning).toBe(currentMeaning)
  })

  it('supports shuffle, alphabetical, and familiarity sort modes per radical level', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))

    fireEvent.click(screen.getByRole('button', { name: 'Sort Alphabetically' }))
    expect(getRadicalOrder()[0]).toBe('Fins')

    let cards = Array.from(document.querySelectorAll('.radical-card'))
    const toeCard = cards.find((card) => card.textContent?.includes('Toe'))
    const finsCard = cards.find((card) => card.textContent?.includes('Fins'))
    fireEvent.mouseEnter(toeCard)
    fireEvent.keyDown(window, { key: '1' }) // needs
    fireEvent.mouseEnter(finsCard)
    fireEvent.keyDown(window, { key: '3' }) // comfortable

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Familiarity' }))
    expect(getRadicalOrder()[0]).toBe('Toe')

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))
    expect(getRadicalOrder()[0]).toBe('Fins')
    randomSpy.mockRestore()
  })

  it('supports arrow key level navigation on radicals page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    expect(screen.getByRole('heading', { name: 'Level 1' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: 'Level 2' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: 'Level 1' })).toBeInTheDocument()
  })
})
