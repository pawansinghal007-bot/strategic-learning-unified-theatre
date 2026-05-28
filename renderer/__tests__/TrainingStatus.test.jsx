import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TrainingStatus from '../TrainingStatus';

describe('TrainingStatus.jsx', () => {
  it('renders capture count badge with default zero', () => {
    render(<TrainingStatus />);
    const badge = screen.getByText('captured this session').previousElementSibling;
    expect(badge).toHaveTextContent('0');
    expect(screen.getByText('captured this session')).toBeInTheDocument();
  });

  it('renders capture count with provided value', () => {
    render(<TrainingStatus captureCount={12} />);
    const badge = screen.getByText('12');
    expect(badge).toBeInTheDocument();
    expect(screen.getByText('captured this session')).toBeInTheDocument();
  });

  it('renders total docs with default zero', () => {
    render(<TrainingStatus />);
    const totalDocsValue = screen.getByText('Total docs:').nextElementSibling;
    expect(totalDocsValue).toHaveTextContent('0');
    expect(screen.getByText('Total docs:')).toBeInTheDocument();
  });

  it('renders total docs with provided value', () => {
    render(<TrainingStatus totalDocs={456} />);
    const totalDocsText = screen.getByText('456');
    expect(totalDocsText).toBeInTheDocument();
  });

  it('renders "never" when lastCapturedAt is null', () => {
    render(<TrainingStatus lastCapturedAt={null} />);
    expect(screen.getByText('never')).toBeInTheDocument();
  });

  it('renders "Last:" label always', () => {
    render(<TrainingStatus />);
    expect(screen.getByText('Last:')).toBeInTheDocument();
  });

  it('renders relative time for recent timestamp', () => {
    const now = Date.now();
    const twoMinutesAgo = now - 2 * 60 * 1000;
    render(<TrainingStatus lastCapturedAt={twoMinutesAgo} />);
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('renders relative time for ISO string', () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - 5);
    const isoString = date.toISOString();
    render(<TrainingStatus lastCapturedAt={isoString} />);
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('renders seconds ago for very recent capture', () => {
    const now = Date.now();
    const fiveSecondsAgo = now - 5000;
    render(<TrainingStatus lastCapturedAt={fiveSecondsAgo} />);
    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
  });

  it('renders minutes ago for captures within an hour', () => {
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    render(<TrainingStatus lastCapturedAt={thirtyMinutesAgo} />);
    expect(screen.getByText(/30m ago/)).toBeInTheDocument();
  });

  it('renders hours ago for captures within a day', () => {
    const now = Date.now();
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    render(<TrainingStatus lastCapturedAt={threeHoursAgo} />);
    expect(screen.getByText(/3h ago/)).toBeInTheDocument();
  });

  it('renders days ago for older captures', () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    render(<TrainingStatus lastCapturedAt={twoDaysAgo} />);
    // Could be "2d ago" or "2 days ago" depending on Intl support
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('all props are optional', () => {
    const { container } = render(<TrainingStatus />);
    expect(container).toBeInTheDocument();
  });

  it('combines multiple metrics in single view', () => {
    render(
      <TrainingStatus
        captureCount={25}
        lastCapturedAt={Date.now() - 5 * 60 * 1000}
        totalDocs={1250}
      />
    );
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('1250')).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('renders flex layout container', () => {
    const { container } = render(<TrainingStatus />);
    const div = container.firstChild;
    expect(div).toHaveClass('flex');
    expect(div).toHaveClass('items-center');
  });

  it('renders badge with distinct styling', () => {
    const { container } = render(<TrainingStatus captureCount={5} />);
    const badges = container.querySelectorAll('span');
    // Find the badge with the number
    const badge = Array.from(badges).find(el => el.textContent === '5');
    expect(badge).toHaveClass('bg-blue-500');
    expect(badge).toHaveClass('text-white');
  });
});
