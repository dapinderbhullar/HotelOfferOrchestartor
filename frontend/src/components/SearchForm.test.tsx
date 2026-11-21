// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchForm } from './SearchForm';

afterEach(cleanup);

it('validates entered bounds before publishing filters and clears both bounds', () => {
  const onSearch = vi.fn();
  render(<SearchForm advanced pending={false} initial={{ city: 'delhi', minPrice: '', maxPrice: '' }} onSearch={onSearch} />);
  fireEvent.change(screen.getByLabelText('Minimum price', { exact: false }), { target: { value: '8000' } });
  fireEvent.change(screen.getByLabelText('Maximum price', { exact: false }), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert').textContent).toContain('Minimum price cannot exceed');
  expect(onSearch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(onSearch).toHaveBeenCalledWith({ city: 'delhi', minPrice: '', maxPrice: '' });
});
