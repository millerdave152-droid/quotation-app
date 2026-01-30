/**
 * SortDropdown - Sort options with role-based visibility
 */
import React from 'react';

const sortOptions = [
  { value: 'relevance', label: 'Relevance', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'price_low', label: 'Price: Low to High', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'price_high', label: 'Price: High to Low', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'discount', label: 'Biggest Discount', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'stock', label: 'Stock Level', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'sellability', label: 'Easiest to Sell', roles: ['admin', 'manager', 'sales'] },
  { value: 'newest', label: 'Newest First', roles: ['admin', 'manager', 'sales', 'user'] },
  { value: 'margin', label: 'Best Margin', roles: ['admin', 'manager'] }
];

const SortDropdown = ({ value, onChange, userRole = 'sales' }) => {
  // Filter options based on user role
  const availableOptions = sortOptions.filter(opt => opt.roles.includes(userRole));

  return (
    <div className="sort-dropdown">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {availableOptions.map(option => (
          <option key={option.value} value={option.value}>
            Sort by: {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SortDropdown;
