export function formatCents(cents) {
  if (cents === null || cents === undefined) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2
  }).format(Math.abs(cents) / 100);
}

export function formatCentsNoSymbol(cents) {
  if (cents === null || cents === undefined) return '0.00';
  return (Math.abs(cents) / 100).toFixed(2);
}
