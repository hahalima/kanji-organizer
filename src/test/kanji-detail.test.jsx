import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('shows the kanji level label on the detail card footer', async () => {
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

    const detailCard = document.querySelector('.kanji-detail-card')
    expect(detailCard).not.toBeNull()
    expect(within(detailCard).getByText(/^Lv \d+$/)).toBeInTheDocument()
  })

  it('shows radical components and opens radical detail from a component', async () => {
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

    expect(screen.getByText('Mnemonics')).toBeInTheDocument()
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Reading mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Radical components')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Toe/ }))
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Toe mnemonic')).toBeInTheDocument()
  })

  it('shows visually similar kanji and opens detail when clicked', async () => {
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

    expect(screen.getByText(/Visually similar kanji \(\d+\)/)).toBeInTheDocument()
    const similarButton = screen.getByRole('button', { name: '二 Two' })
    fireEvent.click(similarButton)
    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(screen.getByText('二')).toBeInTheDocument()
  })

  it('keeps radical components toggle state across kanji detail pages', async () => {
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
    const componentSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) => section.textContent?.includes('Radical components')
    )
    expect(componentSection).not.toBeNull()
    fireEvent.click(within(componentSection).getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('button', { name: /Toe/ })).toBeNull()

    fireEvent.click(screen.getByText('Back'))
    await waitForLoaded(screen)
    const secondCard = screen.getByText('二').closest('.kanji-card')
    expect(secondCard).not.toBeNull()
    fireEvent.mouseEnter(secondCard)
    fireEvent.click(within(secondCard).getByText('Open details'))
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fins/ })).toBeNull()
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

  it('marks only the vocab word for larger Japanese rendering on the detail page', async () => {
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

    const vocabWord = document.querySelector('.kanji-vocab-word')
    const vocabReading = document.querySelector('.kanji-vocab-reading')
    expect(vocabWord).toBeInTheDocument()
    expect(vocabReading).toBeInTheDocument()
    expect(vocabWord.classList.contains('has-japanese')).toBe(true)
    expect(vocabReading.classList.contains('has-japanese')).toBe(false)
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

  it('shows visually similar kanji on card hover', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })

    fireEvent.mouseEnter(card)
    expect(within(card).getByText('Visually similar kanji (2)')).toBeInTheDocument()
    expect(within(card).getByText('二')).toBeInTheDocument()
    expect(within(card).getByText('Three')).toBeInTheDocument()
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

  it('supports editing mnemonics, readings, and radical components', async () => {
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
    expect(screen.queryByText('N:')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Look at <kanji>One</kanji>.' },
    })
    fireEvent.change(screen.getByLabelText('Reading mnemonic raw text'), {
      target: { value: 'Say <reading>いち</reading>.' },
    })
    fireEvent.change(screen.getByLabelText('Extra reading mnemonic raw text'), {
      target: { value: 'Alias <reading>かず</reading>.' },
    })
    fireEvent.change(screen.getByLabelText('Onyomi'), {
      target: { value: 'いち, いつ' },
    })
    fireEvent.change(screen.getByLabelText('Kunyomi'), {
      target: { value: 'ひと, ひと.つ' },
    })
    fireEvent.change(screen.getByLabelText('Nanori'), {
      target: { value: 'かず' },
    })

    fireEvent.change(screen.getByLabelText('Search radicals'), {
      target: { value: 'Fins' },
    })
    const radicalSelect = screen.getByLabelText('Add radicals')
    Array.from(radicalSelect.options).forEach((option) => {
      option.selected = option.textContent?.includes('Fins') || false
    })
    fireEvent.change(radicalSelect)
    fireEvent.click(screen.getByRole('button', { name: 'Add selected radicals' }))
    fireEvent.click(screen.getByRole('button', { name: /Move Fins up/ }))

    fireEvent.change(screen.getByLabelText('Search kanji'), {
      target: { value: 'Two' },
    })
    const similarSelect = screen.getByLabelText('Add visually similar kanji')
    Array.from(similarSelect.options).forEach((option) => {
      option.selected = option.textContent?.includes('二 Two') || false
    })
    fireEvent.change(similarSelect)
    fireEvent.click(screen.getByRole('button', { name: 'Add selected kanji' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Look at')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fins/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '二 Two' })).toBeInTheDocument()
    expect(screen.getAllByText('かず').length).toBeGreaterThan(0)
    expect(screen.getByText('N:')).toBeInTheDocument()

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.contentEditsByKanji?.['1']?.nanori).toBe('かず')
      expect(stored?.contentEditsByKanji?.['1']?.radicalSubjectIds).toEqual([11, 10])
    })
  })

  it('renders vocabulary mnemonic tags in preview and saved display while preserving raw text in edit mode', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Count it as <vocabulary>一つ</vocabulary>.' },
    })

    expect(screen.getByLabelText('Meaning mnemonic raw text')).toHaveValue(
      'Count it as <vocabulary>一つ</vocabulary>.'
    )
    expect(screen.getAllByText('Tags look valid.').length).toBeGreaterThan(0)

    const previewChip = document.querySelector('.kanji-detail-editor-preview .mnemonic-chip.vocabulary')
    expect(previewChip).not.toBeNull()
    expect(previewChip.textContent).toBe('一つ')
    expect(previewChip.classList.contains('has-japanese')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const savedChip = Array.from(document.querySelectorAll('.kanji-detail-text .mnemonic-chip.vocabulary'))
      .find((node) => node.textContent === '一つ')
    expect(savedChip).toBeTruthy()
    expect(savedChip.classList.contains('has-japanese')).toBe(true)
  })

  it('only enlarges the Japanese portion of mixed mnemonic text fragments', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Store it as たべる for later.' },
    })

    const japaneseRun = Array.from(
      document.querySelectorAll('.kanji-detail-editor-preview .mnemonic-inline-run.has-japanese')
    ).find((node) => node.textContent === 'たべる')
    expect(japaneseRun).toBeTruthy()

    const englishRun = Array.from(
      document.querySelectorAll('.kanji-detail-editor-preview .mnemonic-inline-run')
    ).find((node) => node.textContent?.includes('Store it as '))
    expect(englishRun).toBeTruthy()
    expect(englishRun.classList.contains('has-japanese')).toBe(false)
  })

  it('includes wrapping parentheses with Japanese mnemonic text', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Soon thousands of chicks (ちく) appear.' },
    })

    const japaneseRuns = Array.from(
      document.querySelectorAll('.kanji-detail-editor-preview .mnemonic-inline-run.has-japanese')
    ).map((node) => node.textContent)
    expect(japaneseRuns).toContain('(')
    expect(japaneseRuns).toContain('ちく')
    expect(japaneseRuns).toContain(')')
  })

  it('includes wrapping parentheses with Japanese mnemonic chips', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: '丘 (<reading>おか</reading>) helps here.' },
    })

    const japaneseRuns = Array.from(
      document.querySelectorAll('.kanji-detail-editor-preview .has-japanese')
    ).map((node) => node.textContent)
    expect(japaneseRuns).toContain('(')
    expect(japaneseRuns).toContain('おか')
    expect(japaneseRuns).toContain(')')
  })

  it('blocks saving when mnemonic tags are malformed', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Broken <vocabulary>tag' },
    })

    expect(screen.getByText('Missing closing tag </vocabulary>.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('warns before leaving with unsaved detail edits', async () => {
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

    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Meaning mnemonic raw text'), {
      target: { value: 'Unsaved <kanji>One</kanji>.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})
