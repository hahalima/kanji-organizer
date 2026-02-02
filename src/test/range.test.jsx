import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Range page', () => {
  it('shows the empty state before a range is entered', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Range' }))
    const rangePage = document.querySelector('.range-page')
    expect(rangePage).not.toBeNull()
    expect(within(rangePage).getByText('Enter a range to show levels.')).toBeInTheDocument()
  })

  it('renders multiple levels after entering a range', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Range' }))
    const rangePage = document.querySelector('.range-page')
    const input = within(rangePage).getByLabelText(/Levels/)
    fireEvent.change(input, { target: { value: '1...2' } })

    await waitFor(() =>
      expect(within(rangePage).queryByText('Enter a range to show levels.')).toBeNull()
    )
    expect(within(rangePage).getByText('Level 1')).toBeInTheDocument()
    expect(within(rangePage).getByText('Level 2')).toBeInTheDocument()
  })

  it('toggles range alphabetical mode in localStorage', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Range' }))
    const rangePage = document.querySelector('.range-page')
    const toggle = within(rangePage).getByText('Sort Alphabetically')

    fireEvent.click(toggle)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored.ui.rangeMode).toBe('alpha')
    })

    fireEvent.click(toggle)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored.ui.rangeMode).toBe('normal')
    })
  })

  it('clears the range input and returns to empty state', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Range' }))
    const rangePage = document.querySelector('.range-page')
    const input = within(rangePage).getByLabelText(/Levels/)
    fireEvent.change(input, { target: { value: '1...2' } })

    await waitFor(() =>
      expect(within(rangePage).queryByText('Enter a range to show levels.')).toBeNull()
    )
    fireEvent.click(within(rangePage).getByRole('button', { name: 'Clear' }))
    expect(within(rangePage).getByText('Enter a range to show levels.')).toBeInTheDocument()
  })

  it('toggles range familiarity mode in localStorage', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Range' }))
    const rangePage = document.querySelector('.range-page')
    const toggle = within(rangePage).getByText('Sort by Familiarity')

    fireEvent.click(toggle)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored.ui.rangeMode).toBe('familiarity')
    })

    fireEvent.click(toggle)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('kanji_organizer_v1'))
      expect(stored.ui.rangeMode).toBe('normal')
    })
  })
})
