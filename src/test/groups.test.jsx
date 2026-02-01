import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App.jsx'
import { waitForLoaded } from './helpers.js'

describe('Groups', () => {
  it('creates a group and adds a kanji via the add modal', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))
    fireEvent.click(screen.getByText('Add Kanji'))

    const searchInput = screen.getByPlaceholderText('Search by meaning')
    await user.type(searchInput, 'One')

    const modalResult = screen.getAllByRole('button', { name: /One/ })[0]
    await user.click(modalResult)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByText('New Group (1)')).toBeInTheDocument()
  })

  it('shows All Groups and keeps it non-draggable', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    const allGroupsButton = screen.getByText(/All Groups/)
    expect(allGroupsButton).toBeInTheDocument()
    expect(allGroupsButton.getAttribute('draggable')).toBeNull()
  })

  it('clears search input on reopen in add modal', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))
    fireEvent.click(screen.getByText('Add Kanji'))
    const searchInput = screen.getByPlaceholderText('Search by meaning')
    fireEvent.change(searchInput, { target: { value: 'One' } })
    expect(searchInput.value).toBe('One')

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByText('Add Kanji'))
    const searchInputAgain = screen.getByPlaceholderText('Search by meaning')
    expect(searchInputAgain.value).toBe('')
  })

  it('displays group in All Groups view after creation', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))
    fireEvent.click(screen.getByText(/All Groups/))
    expect(screen.getByText('New Group')).toBeInTheDocument()
  })

  it('deletes a group', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))
    fireEvent.click(screen.getByText('Delete Group'))
    expect(screen.queryByText('New Group')).toBeNull()
  })
})
