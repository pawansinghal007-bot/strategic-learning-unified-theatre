import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Logs from '../Logs.jsx'

describe('Logs.jsx', () => {
  const originalRotator = window.rotator

  afterEach(() => {
    window.rotator = originalRotator
  })

  it('renders without crashing when window.rotator.logs is not present', () => {
    window.rotator = {}

    const { container } = render(<Logs />)

    expect(container).toBeInTheDocument()
  })

  it('renders "No log entries yet." placeholder on mount', () => {
    window.rotator = {}

    render(<Logs />)

    expect(screen.getByText('No log entries yet.')).toBeInTheDocument()
  })
})
