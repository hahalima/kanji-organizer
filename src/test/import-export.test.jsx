import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Import/Export', () => {
  it('exports without throwing and imports data', async () => {
    render(<App />)
    await waitForLoaded(screen)

    vi.stubGlobal('confirm', vi.fn(() => true))

    fireEvent.click(screen.getByText('Export JSON'))

    const importInput = screen.getByLabelText('Import JSON')
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      kanji_lookup: { 1: '一' },
      familiarity: [{ kanji_id: 1, status: 'needs_work', updated_at: new Date().toISOString() }],
      groups: [],
      preferences: { lightning_mode: false },
    }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    await waitFor(() => expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0))
  })

  it('keeps import input available in header', async () => {
    render(<App />)
    await waitForLoaded(screen)

    expect(screen.getByText('Import JSON')).toBeInTheDocument()
    expect(screen.getByText('Export JSON')).toBeInTheDocument()
  })

  it('ignores unsupported import versions', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const importInput = screen.getByLabelText('Import JSON')
    const payload = { version: 999, familiarity: [], groups: [] }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getAllByText('Level 1').length).toBeGreaterThan(0)
  })
  it('does not import when confirmation is cancelled', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const importInput = screen.getByLabelText('Import JSON')
    const payload = { version: 1, familiarity: [], groups: [], preferences: {} }
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' })
    fireEvent.change(importInput, { target: { files: [file] } })

    expect(confirmSpy).toHaveBeenCalled()
  })
})
