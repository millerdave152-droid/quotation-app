/**
 * TeleTime POS - Barcode Scanner Component
 * Hidden component that listens for barcode scanner input
 */

import { useEffect, useRef, useCallback } from 'react';

// Audio context for beep sound
let audioContext = null;

/**
 * Play a beep sound for successful scan
 */
const playBeep = () => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 1200; // Frequency in Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.1
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Audio not supported or blocked - silent fail
    console.debug('[BarcodeScanner] Audio not available:', error.message);
  }
};

/**
 * Check if the active element is an input that should block barcode capture
 * @returns {boolean} True if input is focused
 */
const isInputFocused = () => {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  // Check if it's a text input, textarea, or contenteditable
  const tagName = activeElement.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea';
  const isContentEditable = activeElement.isContentEditable;

  // Check for barcode-ignore attribute (allows input to receive barcode)
  const ignoreBarcode = activeElement.getAttribute('data-barcode-ignore') === 'true';

  // If it's an input but has barcode-ignore, we should NOT block capture
  // Otherwise, block capture if it's an input
  if (ignoreBarcode) {
    return false;
  }

  return isInput || isContentEditable;
};

/**
 * Barcode scanner listener component
 * Detects rapid keyboard input followed by Enter (typical barcode scanner pattern)
 *
 * @param {object} props
 * @param {function} props.onScan - Callback when barcode is scanned
 * @param {boolean} props.enabled - Whether scanning is enabled
 * @param {number} props.maxDelay - Max delay between keystrokes (ms) to be considered scanner input
 * @param {number} props.minLength - Minimum barcode length
 * @param {boolean} props.playSound - Whether to play beep on successful scan
 */
export function BarcodeScanner({
  onScan,
  enabled = true,
  maxDelay = 50,
  minLength = 4,
  playSound = true,
}) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);

  // Clear buffer
  const clearBuffer = useCallback(() => {
    bufferRef.current = '';
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Process scanned barcode
  const processScan = useCallback(
    (barcode) => {
      if (barcode.length >= minLength) {
        if (playSound) {
          playBeep();
        }
        onScan?.(barcode);
      }
      clearBuffer();
    },
    [minLength, playSound, onScan, clearBuffer]
  );

  // Handle keydown events
  const handleKeyDown = useCallback(
    (event) => {
      if (!enabled) return;

      // Ignore if input is focused (unless marked with data-barcode-ignore)
      if (isInputFocused()) {
        clearBuffer();
        return;
      }

      const now = Date.now();
      const key = event.key;

      // Check if this keystroke is part of a rapid sequence
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      const isRapidInput = timeSinceLastKey < maxDelay || bufferRef.current === '';

      lastKeyTimeRef.current = now;

      // If Enter key, process the buffer
      if (key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          event.preventDefault();
          processScan(bufferRef.current);
        } else {
          clearBuffer();
        }
        return;
      }

      // If not rapid input, clear buffer and start fresh
      if (!isRapidInput) {
        clearBuffer();
      }

      // Add printable characters to buffer
      if (key.length === 1 && /[\w\d\-_.]/i.test(key)) {
        bufferRef.current += key;

        // Set a timeout to clear buffer if no more input comes
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          clearBuffer();
        }, maxDelay * 3);
      }
    },
    [enabled, maxDelay, minLength, processScan, clearBuffer]
  );

  // Attach keyboard listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      clearBuffer();
    };
  }, [enabled, handleKeyDown, clearBuffer]);

  // This component renders nothing
  return null;
}

export default BarcodeScanner;
