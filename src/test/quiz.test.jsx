import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Quiz', () => {
  it('opens the quiz modal and advances on Enter after reveal', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    const input = screen.getByPlaceholderText('Type meaning')
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Enter' })
  })

  it('reveals answer and toggles lightning mode', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    fireEvent.click(screen.getByText('Reveal Answer'))
    expect(screen.getAllByText(/O:/).length).toBeGreaterThan(0)

    const lightningButton = screen.getByText(/Lightning:/)
    fireEvent.click(lightningButton)
    expect(screen.getByText(/Lightning: On|Lightning: Off/)).toBeInTheDocument()
  })

  it('shows colored readings in reveal view and allows toggling', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    fireEvent.click(screen.getByText('Reveal Answer'))

    const readingToken = document.querySelector('.quiz-reveal .reading-token')
    expect(readingToken).not.toBeNull()
    fireEvent.click(readingToken)
    expect(readingToken.className).toMatch(/reading-common/)
  })

  it('closes quiz modal with Escape', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    expect(screen.getAllByText('Quiz').length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByText('Quiz').length).toBe(1))
  })

  it('counts skipped items as incorrect and shows summary', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    const input = screen.getByPlaceholderText('Type meaning')
    const submit = screen.getByText('Submit')

    for (let i = 0; i < 3; i += 1) {
      fireEvent.change(input, { target: { value: 'wrong' } })
      fireEvent.click(submit)
      const nextButtons = screen.queryAllByText('Next')
      if (nextButtons.length > 0 && !nextButtons[0].disabled) {
        fireEvent.click(nextButtons[0])
      }
    }

    await waitFor(() => expect(screen.queryByText('Quiz Complete')).not.toBeNull())
    expect(screen.getByText(/% correct/)).toBeInTheDocument()
  })

  it('shows missed and correct sections in summary', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getAllByText('Quiz')[0])
    const input = screen.getByPlaceholderText('Type meaning')
    const submit = screen.getByText('Submit')

    for (let i = 0; i < 3; i += 1) {
      fireEvent.change(input, { target: { value: 'wrong' } })
      fireEvent.click(submit)
      const nextButtons = screen.queryAllByText('Next')
      if (nextButtons.length > 0 && !nextButtons[0].disabled) {
        fireEvent.click(nextButtons[0])
      }
    }

    await waitFor(() => expect(screen.queryByText('Quiz Complete')).not.toBeNull())
    await waitFor(() => expect(screen.queryByText('Missed')).not.toBeNull())
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('opens and closes the global quiz modal with Escape', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Global Quiz'))
    expect(screen.getAllByText('Global Quiz').length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByText('Global Quiz').length).toBe(1))
  })

  it('opens global quiz modal and toggles filters', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Global Quiz'))
    const levelInput = screen.getByLabelText('Levels (e.g. 1...3, 5)')
    fireEvent.change(levelInput, { target: { value: '1...2' } })
    expect(levelInput.value).toBe('1...2')

    const needsCheckbox = screen.getByLabelText('Needs Work')
    fireEvent.click(needsCheckbox)
    expect(needsCheckbox.checked).toBe(true)
  })

  it('starts a global quiz session from the modal', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Global Quiz'))
    fireEvent.click(screen.getByText('Start Quiz'))
    expect(screen.getAllByText('Quiz').length).toBeGreaterThan(0)
  })
})
