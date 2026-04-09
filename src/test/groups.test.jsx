import { describe, expect, it, vi } from 'vitest'
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

  it('collapses and expands group categories from the sidebar', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))
    fireEvent.click(screen.getByText(/All Groups/))

    const categoryToggle = screen.getAllByText('Miscellaneous')[0]
    fireEvent.click(categoryToggle)
    expect(screen.queryByText('New Group (0)')).toBeNull()

    fireEvent.click(categoryToggle)
    expect(screen.getByText('New Group (0)')).toBeInTheDocument()
  })

  it('collapses and expands all categories', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))

    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('New Group (0)')).toBeNull()

    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('New Group (0)')).toBeInTheDocument()
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

  it('navigates between adjacent groups with left and right arrows', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))

    let titleInput = screen.getByDisplayValue('New Group')
    fireEvent.change(titleInput, { target: { value: 'Look Group' } })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Look-Alikes' },
    })

    fireEvent.click(screen.getByText('+ New Group'))
    titleInput = screen.getByDisplayValue('New Group')
    fireEvent.change(titleInput, { target: { value: 'Meaning Group' } })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Similar Meanings' },
    })

    fireEvent.click(screen.getByText('Look Group (0)'))
    expect(screen.getByDisplayValue('Look Group')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByDisplayValue('Meaning Group')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByDisplayValue('Look Group')).toBeInTheDocument()
  })

  it('navigates between groups from the selected group title input', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitForLoaded(screen)

    await user.click(screen.getByText('Groups'))
    await user.click(screen.getByText('+ New Group'))

    let titleInput = screen.getByDisplayValue('New Group')
    await user.clear(titleInput)
    await user.type(titleInput, 'Look Group')
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Look-Alikes' },
    })

    await user.click(screen.getByText('+ New Group'))
    titleInput = screen.getByDisplayValue('New Group')
    await user.clear(titleInput)
    await user.type(titleInput, 'Meaning Group')
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Similar Meanings' },
    })

    await user.click(screen.getByText('Look Group (0)'))
    titleInput = screen.getByDisplayValue('Look Group')
    titleInput.focus()
    expect(titleInput).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByDisplayValue('Meaning Group')).toBeInTheDocument()
  })

  it('scrolls between populated categories while staying on All Groups', async () => {
    render(<App />)
    await waitForLoaded(screen)

    fireEvent.click(screen.getByText('Groups'))
    fireEvent.click(screen.getByText('+ New Group'))

    let titleInput = screen.getByDisplayValue('New Group')
    fireEvent.change(titleInput, { target: { value: 'Look Group' } })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Look-Alikes' },
    })

    fireEvent.click(screen.getByText('+ New Group'))
    titleInput = screen.getByDisplayValue('New Group')
    fireEvent.change(titleInput, { target: { value: 'Meaning Group' } })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Similar Meanings' },
    })

    fireEvent.click(screen.getByText(/All Groups/))
    const allGroupsButton = screen.getByText(/All Groups/)
    const lookSection = document.getElementById('group-category-look-alikes')
    const meaningSection = document.getElementById('group-category-similar-meanings')
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    expect(lookSection).not.toBeNull()
    expect(meaningSection).not.toBeNull()

    lookSection.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 20,
      left: 0,
      bottom: 320,
      right: 0,
      width: 0,
      height: 300,
      toJSON: () => ({}),
    })
    meaningSection.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 520,
      left: 0,
      bottom: 820,
      right: 0,
      width: 0,
      height: 300,
      toJSON: () => ({}),
    })

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(allGroupsButton).toHaveClass('active')
    expect(scrollSpy).toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Meaning Group')).toBeNull()

    scrollSpy.mockRestore()
  })
})
