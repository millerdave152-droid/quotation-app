import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock the cachedFetch function
jest.mock('./services/apiCache', () => ({
  cachedFetch: jest.fn()
}));

// Mock lazy-loaded components
jest.mock('./components/QuotationManager', () => {
  return function QuotationManager() {
    return <div>QuotationManager Component</div>;
  };
});

jest.mock('./components/CustomerManagement', () => {
  return function CustomerManagement() {
    return <div>CustomerManagement Component</div>;
  };
});

jest.mock('./components/ProductManagement', () => {
  return function ProductManagement() {
    return <div>ProductManagement Component</div>;
  };
});

jest.mock('./components/RevenueAnalytics', () => {
  return function RevenueAnalytics() {
    return <div>RevenueAnalytics Component</div>;
  };
});

// Mock jsPDF to avoid canvas issues in tests
jest.mock('jspdf', () => {
  return jest.fn().mockImplementation(() => ({
    text: jest.fn(),
    addImage: jest.fn(),
    save: jest.fn()
  }));
});

describe('App Component', () => {
  test('renders app title', () => {
    render(<App />);
    const titleElement = screen.getByText(/Customer Quotation System Pro/i);
    expect(titleElement).toBeInTheDocument();
  });

  test('renders navigation tabs', () => {
    render(<App />);

    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Customers/i)).toBeInTheDocument();
    expect(screen.getByText(/Products/i)).toBeInTheDocument();
    expect(screen.getByText(/Quotations/i)).toBeInTheDocument();
  });

  test('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
