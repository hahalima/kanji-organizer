import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
