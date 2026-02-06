import '@testing-library/jest-dom';

const originalWarn = console.warn;

console.warn = (...args) => {
  const message = args?.[0];
  if (typeof message === 'string' && message.includes('React Router Future Flag Warning')) {
    return;
  }
  originalWarn(...args);
};
