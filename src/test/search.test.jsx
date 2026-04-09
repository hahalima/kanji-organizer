import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Header search', () => {
  it('shows results for meaning search and opens detail on click', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const input = screen.getByPlaceholderText('Search kanji or meaning')
    fireEvent.change(input, { target: { value: 'one' } })

    await waitFor(() => {
      const results = screen.getAllByRole('button', { name: /One/ })
      expect(results.length).toBeGreaterThan(0)
    })

    const [result] = screen.getAllByRole('button', { name: /One/ })
    fireEvent.click(result)

    expect(screen.getByText('Other meanings')).toBeInTheDocument()
  })

  it('shows radicals in a separate search section and opens radical detail', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const input = screen.getByPlaceholderText('Search kanji or meaning')
    fireEvent.change(input, { target: { value: 'toe' } })

    const panel = await waitFor(() => {
      const element = document.querySelector('.header-search-results')
      expect(element).not.toBeNull()
      return element
    })
    expect(panel).not.toBeNull()
    expect(within(panel).getByText('Radicals')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: /Toe/ }))

    expect(screen.getByText('Related kanji')).toBeInTheDocument()
    expect(screen.getByText('Toe mnemonic')).toBeInTheDocument()
  })
})
