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
    expect(document.querySelector('.level-grid-limit')).not.toBeNull()
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

  it('sorts related kanji by level on the radical detail page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    let card = null
    await waitFor(() => {
      const meaning = screen.getByText('Fins')
      card = meaning.closest('.radical-card')
      expect(card).not.toBeNull()
    })

    fireEvent.click(card)
    const order = Array.from(document.querySelectorAll('.radical-related-grid .kanji-character')).map(
      (item) => item.textContent?.trim()
    )
    expect(order.slice(0, 3)).toEqual(['一', '二', '三'])
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

  it('shows disabled placeholder buttons for missing radical levels', async () => {
    const gappedRadicalsCsv = `wk_subject_id,radical_character,primary_meaning,other_meanings,meaning_mnemonic,amalgamation_kanji_json,downloaded_image_files,url,wk_level
10,丶,Toe,To,Toe mnemonic,"[""一""]",wk_radical_10_1.svg,https://example.com/radical/toe,1
12,丨,Stick,,Stick mnemonic,"[""二""]",wk_radical_12_1.svg,https://example.com/radical/stick,3`

    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = typeof input === 'string' ? input : input?.url || ''
        if (url.includes('wk_vocab.csv')) {
          return Promise.resolve({ text: () => Promise.resolve('wk_subject_id,subject_type,word,primary_reading,primary_meaning,other_meanings,parts_of_speech,context_sentence_ja_1,context_sentence_en_1,context_sentence_ja_2,context_sentence_en_2,context_sentence_ja_3,context_sentence_en_3,audio_url_1,meanings_json,readings_json,auxiliary_meanings_json,pronunciation_audios_json,context_sentences_json,parts_of_speech_json,component_subject_ids_json,component_subject_kanji_json,meaning_mnemonic,reading_mnemonic,slug,created_at,document_url,hidden_at,lesson_position,spaced_repetition_system_id,url,wk_level,srs_stage\n2501,vocabulary,一,いち,One,1,numeral,,,,,,,,,,,,,,[440],["一"],,,,,https://example.com/vocab/1,1,') })
        }
        if (url.includes('kanji.csv')) {
          return Promise.resolve({ text: () => Promise.resolve('wk_subject_id,kanji,primary_meaning,other_meanings,onyomi,kunyomi,nanori,radical_subject_ids,visually_similar_subject_ids,visually_similar_kanji,meaning_mnemonic,reading_mnemonic,url,wk_level,srs_stage,StrokeImg\n1,一,One,1,いち,ひと,,[10],,,,,https://example.com/1,1,,<img src="jisho_strokes_04E00.png">') })
        }
        if (url.includes('radicals.csv')) {
          return Promise.resolve({ text: () => Promise.resolve(gappedRadicalsCsv) })
        }
        return Promise.resolve({ text: () => Promise.resolve('{}') })
      })
    )

    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    const missingLevelButton = screen.getByRole('button', { name: 'Level 2' })
    expect(missingLevelButton).toBeDisabled()
    fireEvent.click(missingLevelButton)
    expect(screen.getByRole('heading', { name: 'Level 1' })).toBeInTheDocument()
  })
})
