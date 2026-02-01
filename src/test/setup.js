import '@testing-library/jest-dom'

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock'
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {}
}
