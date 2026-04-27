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
    expect(screen.getByText('Related kanji/readings')).toBeInTheDocument()
    expect(screen.getByText('Radical components')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Toe/ }))
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Toe mnemonic')).toBeInTheDocument()
  })

  it('renders review sections in the expected order on the detail page', async () => {
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

    const sectionTitles = Array.from(document.querySelectorAll('.kanji-detail-section')).map(
      (section) => section.querySelector('.kanji-detail-title')?.textContent?.trim() || ''
    )

    expect(sectionTitles.indexOf('Readings')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Other meanings')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Stroke order')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Visually similar kanji (2)')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Related kanji/readings')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Mnemonics')).toBeGreaterThan(-1)
    expect(sectionTitles.indexOf('Readings')).toBeLessThan(sectionTitles.indexOf('Other meanings'))
    expect(sectionTitles.indexOf('Other meanings')).toBeLessThan(
      sectionTitles.indexOf('Stroke order')
    )
    expect(sectionTitles.indexOf('Stroke order')).toBeLessThan(
      sectionTitles.indexOf('Visually similar kanji (2)')
    )
    expect(sectionTitles.indexOf('Visually similar kanji (2)')).toBeLessThan(
      sectionTitles.indexOf('Related kanji/readings')
    )
    expect(sectionTitles.indexOf('Related kanji/readings')).toBeLessThan(
      sectionTitles.indexOf('Mnemonics')
    )
    expect(sectionTitles.indexOf('Stroke order')).toBeLessThan(sectionTitles.indexOf('Mnemonics'))
    expect(document.querySelector('.kanji-detail-readings-display')).not.toBeNull()
  })

  it('keeps edit and compare controls in the kanji detail header', async () => {
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

    const header = document.querySelector('.kanji-detail-header')
    expect(header).not.toBeNull()

    const cardActions = header?.querySelector('.kanji-detail-card-actions')
    expect(cardActions).not.toBeNull()
    expect(within(cardActions).getByRole('button', { name: 'Edit details' })).toBeInTheDocument()
    expect(within(cardActions).getByRole('button', { name: 'Compare Off' })).toBeInTheDocument()

    const mnemonicsSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) => section.querySelector('.kanji-detail-title')?.textContent?.trim() === 'Mnemonics'
    )
    expect(mnemonicsSection).not.toBeNull()
    expect(within(mnemonicsSection).queryByRole('button', { name: 'Edit details' })).toBeNull()
    expect(within(mnemonicsSection).queryByRole('button', { name: 'Compare Off' })).toBeNull()
    expect(within(mnemonicsSection).getByRole('button', { name: 'Hide' })).toBeInTheDocument()

    fireEvent.click(within(cardActions).getByRole('button', { name: 'Edit details' }))
    expect(within(cardActions).getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(within(cardActions).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('hides empty optional mnemonic sections in saved view but keeps them editable', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('二')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
    expect(screen.getByText('Reading mnemonic')).toBeInTheDocument()
    expect(screen.queryByText('Extra reading mnemonic')).not.toBeInTheDocument()
    expect(screen.queryByText('Related kanji/readings')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))

    expect(screen.getByLabelText('Extra reading mnemonic raw text')).toBeInTheDocument()
    expect(screen.getByLabelText('Related kanji/readings raw text')).toBeInTheDocument()
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
    const similarItems = Array.from(document.querySelectorAll('.kanji-similar-item'))
    expect(similarItems.length).toBeGreaterThan(0)
    expect(similarItems[0].querySelector('.compact-reading-label')?.textContent).toBe('O:')
    const similarButton = screen.getByRole('button', { name: '二 Two' })
    fireEvent.click(similarButton)
    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(screen.getByText('二')).toBeInTheDocument()
  })

  it('sorts visually similar kanji by level on the detail page', async () => {
    render(<App />)
    await waitForLoaded(screen)

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('九')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const order = Array.from(document.querySelectorAll('.kanji-similar-grid .kanji-similar-char')).map(
      (item) => item.textContent?.trim()
    )
    expect(order).toEqual(['二', '三'])
  })

  it('shows a green mnemonic tag indicator when the current mnemonics are valid', async () => {
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

    const indicator = document.querySelector('.kanji-detail-tag-indicator')
    expect(indicator).not.toBeNull()
    expect(indicator.classList.contains('is-valid')).toBe(true)
  })

  it('cycles kanji familiarity from the detail page status dot', async () => {
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

    let statusButton = screen.getByRole('button', {
      name: 'Kanji familiarity status: Unmarked',
    })
    expect(statusButton.className).toMatch(/status-default/)

    fireEvent.click(statusButton)
    statusButton = screen.getByRole('button', {
      name: 'Kanji familiarity status: Needs Work',
    })
    expect(statusButton.className).toMatch(/status-needs/)

    fireEvent.click(statusButton)
    statusButton = screen.getByRole('button', {
      name: 'Kanji familiarity status: Lukewarm',
    })
    expect(statusButton.className).toMatch(/status-lukewarm/)
  })

  it('toggles kanji flagged state from the detail page flag button', async () => {
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

    let flagButton = screen.getByRole('button', { name: 'Kanji flag: Not flagged' })
    fireEvent.click(flagButton)
    flagButton = screen.getByRole('button', { name: 'Kanji flag: Flagged' })
    expect(flagButton.className).toMatch(/is-flagged/)
  })

  it('toggles kanji flagged state with keyboard 5 on the detail page', async () => {
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

    fireEvent.keyDown(window, { key: '5' })
    expect(screen.getByRole('button', { name: 'Kanji flag: Flagged' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '5' })
    expect(screen.getByRole('button', { name: 'Kanji flag: Not flagged' })).toBeInTheDocument()
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

  it('toggles mnemonics with keyboard comma on the kanji detail page', async () => {
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

    const mnemonicsSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) => section.textContent?.includes('Mnemonics')
    )
    expect(mnemonicsSection).not.toBeNull()
    expect(within(mnemonicsSection).getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: ',', code: 'Comma' })
    expect(within(mnemonicsSection).getByRole('button', { name: 'Show' })).toBeInTheDocument()
    expect(screen.queryByText('Meaning mnemonic')).toBeNull()
    fireEvent.keyUp(window, { key: ',', code: 'Comma' })
    expect(within(mnemonicsSection).getByRole('button', { name: 'Show' })).toBeInTheDocument()
    expect(screen.queryByText('Meaning mnemonic')).toBeNull()

    fireEvent.keyDown(window, { key: ',', code: 'Comma' })
    expect(within(mnemonicsSection).getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()
  })

  it('allows toggling mnemonics in read-only mode when another tab owns storage', async () => {
    localStorage.setItem(
      'kanji_organizer_owner_v1',
      JSON.stringify({ id: 'other-tab', ts: Date.now() })
    )
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByText('Read-only: another tab is active.')).toBeInTheDocument()

    let card = null
    await waitFor(() => {
      const kanji = screen.getByText('一')
      card = kanji.closest('.kanji-card')
      expect(card).not.toBeNull()
    })
    fireEvent.mouseEnter(card)
    fireEvent.click(within(card).getByText('Open details'))

    const mnemonicsSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) => section.textContent?.includes('Mnemonics')
    )
    expect(mnemonicsSection).not.toBeNull()
    expect(within(mnemonicsSection).getByRole('button', { name: 'Hide' })).toBeEnabled()
    expect(screen.getByText('Meaning mnemonic')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: ',', code: 'Comma' })
    expect(within(mnemonicsSection).getByRole('button', { name: 'Show' })).toBeInTheDocument()
    expect(screen.queryByText('Meaning mnemonic')).toBeNull()
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
    fireEvent.change(screen.getByLabelText('Related kanji/readings raw text'), {
      target: { value: 'Bridge<divider><reading>かず</reading>.' },
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
    expect(document.querySelector('.kanji-detail-text .mnemonic-divider')).not.toBeNull()

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.contentEditsByKanji?.['1']?.nanori).toBe('かず')
      expect(stored?.contentEditsByKanji?.['1']?.relatedMnemonicReadings).toBe(
        'Bridge<divider><reading>かず</reading>.'
      )
      expect(stored?.contentEditsByKanji?.['1']?.radicalSubjectIds).toEqual([11, 10])
    })
  })

  it('requires confirmation before removing radical components and visually similar kanji in edit mode', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Remove Toe from radical components' }))
    expect(
      screen.getByRole('button', { name: 'Confirm removing Toe from radical components' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm removing Toe from radical components' })
    )
    expect(
      screen.queryByRole('button', { name: 'Remove Toe from radical components' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove 二 from visually similar kanji' }))
    expect(
      screen.getByRole('button', { name: 'Confirm removing 二 from visually similar kanji' })
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm removing 二 from visually similar kanji' })
    )
    expect(
      screen.queryByRole('button', { name: 'Remove 二 from visually similar kanji' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored?.contentEditsByKanji?.['1']?.radicalSubjectIds).toEqual([])
      expect(stored?.contentEditsByKanji?.['1']?.visuallySimilarKanji).toBe('三')
    })
  })

  it('renders divider tags in related mnemonic/readings preview and saved display', async () => {
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

    expect(screen.getByText('Related kanji/readings')).toBeInTheDocument()
    expect(document.querySelector('.kanji-detail-text .mnemonic-divider')).not.toBeNull()
    expect(
      document.querySelector('.kanji-detail-text .mnemonic-subsection-content.is-divided')
    ).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Related kanji/readings raw text'), {
      target: { value: 'First<divider>Second' },
    })

    expect(screen.queryByText('Closing tag </divider> is not allowed.')).toBeNull()
    expect(document.querySelector('.kanji-detail-editor-preview .mnemonic-divider')).not.toBeNull()
    expect(
      document.querySelector(
        '.kanji-detail-editor-preview .mnemonic-subsection-content.is-divided'
      )
    ).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const savedText = Array.from(document.querySelectorAll('.kanji-detail-text')).find((node) =>
      node.textContent?.includes('First')
    )
    expect(savedText?.querySelector('.mnemonic-divider')).not.toBeNull()
    expect(savedText?.querySelector('.mnemonic-subsection-content.is-divided')).not.toBeNull()
    expect(savedText?.textContent).toContain('Second')
  })

  it('auto-links known kanji only in the saved related mnemonic/readings section', async () => {
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
      target: { value: 'Plain 二 stays unlinked here.' },
    })
    fireEvent.change(screen.getByLabelText('Related kanji/readings raw text'), {
      target: { value: 'Walk from 二 to 三.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const mnemonicBlocks = Array.from(document.querySelectorAll('.kanji-detail-mnemonic-block'))
    const meaningBlock = mnemonicBlocks.find((block) =>
      block.textContent?.includes('Meaning mnemonic')
    )
    const relatedSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) => section.querySelector('.kanji-detail-title')?.textContent?.trim() === 'Related kanji/readings'
    )

    expect(meaningBlock).toBeTruthy()
    expect(relatedSection).toBeTruthy()
    expect(within(meaningBlock).queryByRole('button', { name: '二' })).toBeNull()

    const relatedLink = within(relatedSection).getByRole('button', { name: '二' })
    expect(relatedLink).toBeInTheDocument()
    expect(within(relatedSection).getByRole('button', { name: '三' })).toBeInTheDocument()

    fireEvent.click(relatedLink)
    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(screen.getByText('二')).toBeInTheDocument()
  })

  it('does not auto-link the current kanji in related mnemonic/readings', async () => {
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
    fireEvent.change(screen.getByLabelText('Related kanji/readings raw text'), {
      target: { value: '一 relates to 二.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const relatedSection = Array.from(document.querySelectorAll('.kanji-detail-section')).find(
      (section) =>
        section.querySelector('.kanji-detail-title')?.textContent?.trim() ===
        'Related kanji/readings'
    )

    expect(relatedSection).toBeTruthy()
    expect(within(relatedSection).queryByRole('button', { name: '一' })).toBeNull()
    expect(within(relatedSection).getByRole('button', { name: '二' })).toBeInTheDocument()
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

  it('preserves single spaces around reading chips in mnemonic text content', async () => {
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
      target: { value: 'Word <reading>よむ</reading> next.' },
    })

    const meaningEditor = screen
      .getByLabelText('Meaning mnemonic raw text')
      .closest('.kanji-detail-editor-block')
    const previewText = meaningEditor?.querySelector(
      '.kanji-detail-editor-preview .kanji-detail-text'
    )
    expect(previewText?.textContent).toBe('Word よむ next.')
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

  it('includes wrapping parentheses with kanji mnemonic chips', async () => {
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
      target: { value: '羅 (<kanji>spread out</kanji>) helps here.' },
    })

    const styledRuns = Array.from(
      document.querySelectorAll('.kanji-detail-editor-preview .has-japanese')
    ).map((node) => node.textContent)
    expect(styledRuns).toContain('(')
    expect(styledRuns).toContain(')')
    const kanjiChip = document.querySelector('.kanji-detail-editor-preview .mnemonic-chip.kanji')
    expect(kanjiChip?.textContent).toBe('spread out')
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
    expect(document.querySelector('.kanji-detail-tag-indicator')?.classList.contains('is-invalid')).toBe(
      true
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('rejects closing divider tags', async () => {
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
    fireEvent.change(screen.getByLabelText('Related kanji/readings raw text'), {
      target: { value: 'Broken </divider> marker' },
    })

    expect(screen.getByText('Closing tag </divider> is not allowed.')).toBeInTheDocument()
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
