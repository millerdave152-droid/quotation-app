import { useEffect, useCallback, useRef, useState } from 'react';

/**
 * Hook for handling barcode scanner input
 * Barcode scanners typically work as keyboard input
 * They type characters quickly and end with Enter
 */
export function useBarcode(onScan, options = {}) {
  const {
    minLength = 4,           // Minimum barcode length
    maxDelay = 50,           // Max ms between characters (scanners are fast)
    endKeys = ['Enter'],     // Keys that signal end of scan
    enabled = true,          // Enable/disable scanning
    preventDefault = true,   // Prevent default key behavior during scan
  } = options;

  const [isScanning, setIsScanning] = useState(false);
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);

  // Reset buffer
  const resetBuffer = useCallback(() => {
    bufferRef.current = '';
    setIsScanning(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Process completed scan
  const processScan = useCallback(
    (barcode) => {
      if (barcode.length >= minLength && onScan) {
        onScan(barcode.trim());
      }
      resetBuffer();
    },
    [minLength, onScan, resetBuffer]
  );

  // Handle keydown events
  const handleKeyDown = useCallback(
    (event) => {
      if (!enabled) return;

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Check if this is an end key
      if (endKeys.includes(event.key)) {
        if (bufferRef.current.length >= minLength) {
          if (preventDefault) {
            event.preventDefault();
          }
          processScan(bufferRef.current);
        } else {
          resetBuffer();
        }
        return;
      }

      // If too much time has passed, start fresh
      if (timeSinceLastKey > maxDelay && bufferRef.current.length > 0) {
        resetBuffer();
      }

      // Only capture printable characters
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Check if input is focused - if so, let it handle the input
        const activeElement = document.activeElement;
        const isInputFocused =
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable);

        // If not in an input, capture for barcode
        if (!isInputFocused) {
          if (preventDefault) {
            event.preventDefault();
          }

          bufferRef.current += event.key;
          setIsScanning(true);

          // Set timeout to clear buffer if scan doesn't complete
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(resetBuffer, 500);
        }
      }
    },
    [enabled, endKeys, minLength, maxDelay, preventDefault, processScan, resetBuffer]
  );

  // Attach event listener
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [enabled, handleKeyDown]);

  // Manual scan function (for testing or manual entry)
  const manualScan = useCallback(
    (barcode) => {
      if (barcode && barcode.length >= minLength) {
        onScan?.(barcode.trim());
      }
    },
    [minLength, onScan]
  );

  return {
    isScanning,
    manualScan,
    resetBuffer,
    currentBuffer: bufferRef.current,
  };
}

/**
 * Hook for barcode input field
 * Use when you want a dedicated input field for barcode entry
 */
export function useBarcodeInput(onScan, options = {}) {
  const { minLength = 4, debounceMs = 300 } = options;

  const [value, setValue] = useState('');
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const handleChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      setValue(newValue);

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new debounce
      debounceRef.current = setTimeout(() => {
        if (newValue.length >= minLength) {
          onScan?.(newValue.trim());
          setValue('');
        }
      }, debounceMs);
    },
    [minLength, debounceMs, onScan]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (value.length >= minLength) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          onScan?.(value.trim());
          setValue('');
        }
      }
    },
    [value, minLength, onScan]
  );

  const focus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const clear = useCallback(() => {
    setValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    value,
    inputRef,
    inputProps: {
      ref: inputRef,
      value,
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      placeholder: 'Scan barcode or enter SKU...',
      autoComplete: 'off',
    },
    focus,
    clear,
  };
}

export default useBarcode;
