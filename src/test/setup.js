import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock'
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {}
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  window.location.hash = ''
})
