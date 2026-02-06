import { render, screen, waitFor } from '@testing-library/react';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
});

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

jest.mock('./services/authGuards', () => ({}));

jest.mock('./contexts/AuthContext', () => {
  return {
    AuthProvider: ({ children }) => children,
    useAuth: () => ({
      isAuthenticated: true,
      loading: false,
      user: { role: 'admin' },
      login: jest.fn(),
      logout: jest.fn(),
      updateUser: jest.fn(),
      token: 'test-token',
      canApproveQuotes: true,
      approvalThreshold: 20,
      isAdmin: true,
      isManagerOrAbove: true,
      hasRole: jest.fn(),
      hasAnyRole: jest.fn(),
      refreshUser: jest.fn()
    })
  };
});

jest.mock('./contexts/ThemeContext', () => {
  return {
    ThemeProvider: ({ children }) => children,
    useTheme: () => ({
      theme: 'light',
      isDark: false,
      toggleTheme: jest.fn(),
      setLightTheme: jest.fn(),
      setDarkTheme: jest.fn(),
      setSystemTheme: jest.fn()
    })
  };
});

jest.mock('./components/AIAssistant', () => {
  return function AIAssistant() {
    return <div>AIAssistant Component</div>;
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

const App = require('./App').default;

describe('App Component', () => {
  test('renders app title', async () => {
    render(<App />);
    const titleElements = await screen.findAllByText(/Quotation System/i);
    expect(titleElements.length).toBeGreaterThan(0);
  });

  test('renders navigation tabs', async () => {
    render(<App />);

    expect((await screen.findAllByText(/^Dashboard$/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^Customers$/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^Products$/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^Quotations$/i)).length).toBeGreaterThan(0);
  });

  test('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
