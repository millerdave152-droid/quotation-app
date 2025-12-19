import React, { useState, useId } from 'react';

/**
 * Accessible form input component with built-in validation
 * Features:
 * - Inline validation feedback
 * - Error messages with icons
 * - Support for various input types
 * - ARIA attributes for accessibility
 * - Character count for text areas
 */

const FormInput = ({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error = '',
  hint = '',
  maxLength,
  min,
  max,
  pattern,
  validate,
  icon,
  suffix,
  rows = 3,
  options = [], // for select type
  style = {},
  inputStyle = {},
  ...props
}) => {
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const handleBlur = (e) => {
    setTouched(true);
    setFocused(false);
    onBlur?.(e);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const showError = touched && error;
  const showHint = hint && !showError;

  const baseInputStyle = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '14px',
    border: `2px solid ${showError ? '#ef4444' : focused ? '#3b82f6' : '#e5e7eb'}`,
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    background: disabled ? '#f9fafb' : 'white',
    color: disabled ? '#9ca3af' : '#1f2937',
    boxShadow: focused ? `0 0 0 3px ${showError ? '#fecaca' : '#dbeafe'}` : 'none',
    ...inputStyle
  };

  const renderInput = () => {
    const commonProps = {
      id: inputId,
      value,
      onChange,
      onBlur: handleBlur,
      onFocus: handleFocus,
      placeholder,
      disabled,
      required,
      'aria-invalid': showError ? 'true' : 'false',
      'aria-describedby': `${showError ? errorId : ''} ${showHint ? hintId : ''}`.trim() || undefined,
      ...props
    };

    if (type === 'textarea') {
      return (
        <textarea
          {...commonProps}
          rows={rows}
          maxLength={maxLength}
          style={{ ...baseInputStyle, resize: 'vertical', minHeight: '80px' }}
        />
      );
    }

    if (type === 'select') {
      return (
        <select {...commonProps} style={baseInputStyle}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt, idx) => (
            <option key={idx} value={opt.value ?? opt}>
              {opt.label ?? opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        {...commonProps}
        type={type}
        maxLength={maxLength}
        min={min}
        max={max}
        pattern={pattern}
        style={baseInputStyle}
      />
    );
  };

  return (
    <div style={{ marginBottom: '16px', ...style }}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151'
          }}
        >
          {label}
          {required && (
            <span style={{ color: '#ef4444', marginLeft: '4px' }} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {/* Input wrapper */}
      <div style={{ position: 'relative' }}>
        {/* Leading icon */}
        {icon && (
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            pointerEvents: 'none'
          }}>
            {icon}
          </span>
        )}

        {/* Input element */}
        {renderInput()}

        {/* Trailing element (suffix, error icon, etc.) */}
        {(suffix || showError) && (
          <span style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {suffix}
            {showError && (
              <span style={{ color: '#ef4444', fontSize: '16px' }} aria-hidden="true">
                ⚠
              </span>
            )}
          </span>
        )}
      </div>

      {/* Character count for textarea */}
      {type === 'textarea' && maxLength && (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '4px',
          fontSize: '12px',
          color: value?.length > maxLength * 0.9 ? '#ef4444' : '#9ca3af'
        }}>
          {value?.length || 0} / {maxLength}
        </div>
      )}

      {/* Error message */}
      {showError && (
        <div
          id={errorId}
          role="alert"
          style={{
            marginTop: '6px',
            fontSize: '13px',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span aria-hidden="true">✕</span>
          {error}
        </div>
      )}

      {/* Hint text */}
      {showHint && (
        <div
          id={hintId}
          style={{
            marginTop: '6px',
            fontSize: '13px',
            color: '#6b7280'
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
};

// Preset validation patterns
export const validationPatterns = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Please enter a valid email address'
  },
  phone: {
    pattern: /^[\d\s\-()]+$/,
    message: 'Please enter a valid phone number'
  },
  postalCode: {
    pattern: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    message: 'Please enter a valid postal code (e.g., A1A 1A1)'
  },
  url: {
    pattern: /^https?:\/\/.+/,
    message: 'Please enter a valid URL'
  },
  number: {
    pattern: /^\d+$/,
    message: 'Please enter numbers only'
  },
  currency: {
    pattern: /^\d+(\.\d{1,2})?$/,
    message: 'Please enter a valid amount'
  }
};

// Validation helper function
export const validateField = (value, rules = {}) => {
  if (rules.required && (!value || value.trim() === '')) {
    return 'This field is required';
  }

  if (rules.minLength && value.length < rules.minLength) {
    return `Must be at least ${rules.minLength} characters`;
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return `Must be no more than ${rules.maxLength} characters`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return rules.patternMessage || 'Invalid format';
  }

  if (rules.custom) {
    const customError = rules.custom(value);
    if (customError) return customError;
  }

  return '';
};

// Hook for form validation
export const useFormValidation = (initialValues = {}, validationRules = {}) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const setValue = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));

    // Validate on change if already touched
    if (touched[name] && validationRules[name]) {
      const error = validateField(value, validationRules[name]);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const setFieldTouched = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));

    // Validate on blur
    if (validationRules[name]) {
      const error = validateField(values[name], validationRules[name]);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const validateAll = () => {
    const newErrors = {};
    let isValid = true;

    Object.keys(validationRules).forEach(name => {
      const error = validateField(values[name], validationRules[name]);
      if (error) {
        newErrors[name] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched(Object.keys(validationRules).reduce((acc, key) => ({ ...acc, [key]: true }), {}));

    return isValid;
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    setValue,
    setFieldTouched,
    validateAll,
    reset,
    isValid: Object.keys(errors).length === 0
  };
};

export default FormInput;
