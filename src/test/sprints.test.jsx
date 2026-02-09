import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Sprints page', () => {
  it('renders the sprint landing state', async () => {
    render(<App />)
    await waitForLoaded(screen)

    const sprintTab = screen.getByRole('button', { name: 'Sprints' })
    expect(sprintTab).toBeInTheDocument()

    fireEvent.click(sprintTab)

    await waitFor(() => {
      expect(document.querySelector('.sprint-start')).not.toBeNull()
    })
  })

  it('shows the empty state before starting a sprint', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Sprints' }))

    expect(screen.getByText('Start a sprint to generate weekday reviews.')).toBeInTheDocument()
  })

  it('shows the sprint header summary', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByRole('button', { name: 'Sprints' }))

    expect(screen.getByText(/Weekdays only · 2 weeks/)).toBeInTheDocument()
  })
})
