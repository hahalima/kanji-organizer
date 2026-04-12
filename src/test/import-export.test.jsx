import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'))
    reader.readAsText(blob)
  })
}

describe('Import/Export', () => {
  it('exports without throwing and imports data', async () => {
    render(<App />)
    await waitForLoaded(screen)

    vi.stubGlobal('confirm', vi.fn(() => true))

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export JSON' }))

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    const importInput = screen.getByLabelText('Import JSON')
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      kanji_lookup: { 1: '一' },
      familiarity: [{ kanji_id: 1, status: 'needs_work', updated_at: new Date().toISOString() }],
      flagged_kanji: [1],
      groups: [],
      preferences: { lightning_mode: false },
    }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    await waitFor(() => expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0))
    await waitFor(() => {
      const card = screen.getAllByText('One')[0].closest('.kanji-card')
      expect(card?.querySelector('.card-flag-tab')).not.toBeNull()
    })
  })

  it('keeps import input available in header', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    expect(screen.getByText('Import JSON')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export JSON' })).toBeInTheDocument()
  })

  it('ignores unsupported import versions', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    const importInput = screen.getByLabelText('Import JSON')
    const payload = { version: 999, familiarity: [], groups: [] }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0)
  })

  it('exports merged csv with the related kanji/readings column', async () => {
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
      target: { value: 'Export<divider>check' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    let exportedBlob = null
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exportedBlob = blob
      return 'blob:test-export'
    })
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download kanji.csv' }))

    await waitFor(() => expect(exportedBlob).toBeTruthy())
    const csv = await readBlobAsText(exportedBlob)
    expect(csv).toContain('related_kanji_and_readings')
    expect(csv).toContain('Export<divider>check')

    clickSpy.mockRestore()
    revokeObjectUrlSpy.mockRestore()
    createObjectUrlSpy.mockRestore()
  })

  it('exports radical-detail related kanji edits into merged csv', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Radicals' }))
    fireEvent.click(screen.getByText('Toe').closest('.radical-card'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit related kanji' }))
    fireEvent.change(screen.getByLabelText('Search kanji'), {
      target: { value: 'Three' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add 三 to Toe' }))

    let exportedBlob = null
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exportedBlob = blob
      return 'blob:test-export'
    })
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download kanji.csv' }))

    await waitFor(() => expect(exportedBlob).toBeTruthy())
    const csv = await readBlobAsText(exportedBlob)
    expect(csv).toContain('三,Three')
    expect(csv).toContain('"12,10"')

    clickSpy.mockRestore()
    revokeObjectUrlSpy.mockRestore()
    createObjectUrlSpy.mockRestore()
  })

  it('does not import when confirmation is cancelled', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    fireEvent.click(screen.getByRole('button', { name: 'Data' }))
    const importInput = screen.getByLabelText('Import JSON')
    const payload = { version: 1, familiarity: [], groups: [], preferences: {} }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    expect(confirmSpy).toHaveBeenCalled()
  })
})
