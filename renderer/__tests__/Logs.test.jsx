import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Logs from '../Logs.jsx'

describe('Logs.jsx', () => {
  const originalRotator = globalThis.rotator

  afterEach(() => {
    globalThis.rotator = originalRotator
  })

  it('renders without crashing when globalThis.rotator.logs is not present', () => {
    globalThis.rotator = {}

    const { container } = render(<Logs />)

    expect(container).toBeInTheDocument()
  })

  it('renders "No log entries yet." placeholder on mount', () => {
    globalThis.rotator = {}

    render(<Logs />)

    expect(screen.getByText('No log entries yet.')).toBeInTheDocument()
  })
})
