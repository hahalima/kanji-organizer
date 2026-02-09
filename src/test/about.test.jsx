import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('About modal', () => {
  it('opens from the header and closes with Escape', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText('About')).not.toBeInTheDocument()
    })
  })
})
