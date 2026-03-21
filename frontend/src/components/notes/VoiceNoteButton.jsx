/**
 * VoiceNoteButton — Record interaction notes via voice.
 *
 * Uses MediaRecorder API → uploads to backend → Whisper transcription
 * → Claude structuring → shows result in NoteResultDrawer.
 *
 * Deployed in POS customer panel and Quotation quote builder.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  IconButton, Tooltip, Drawer, Chip, CircularProgress,
  Collapse, Box, Typography, Divider, Button,
} from '@mui/material';
import {
  Mic, Square, X, CheckCircle, AlertCircle,
  Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';
import apiClient from '../../services/apiClient';

const MAX_RECORDING_SECONDS = 300; // 5 minutes

// ── Pulse animation for recording ──────────────────────────────
const pulseKeyframes = `
@keyframes voiceNotePulse {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  70%  { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
`;

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('voice-note-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'voice-note-pulse-style';
  style.textContent = pulseKeyframes;
  document.head.appendChild(style);
}

// ── Sentiment colors ────────────────────────────────────────────
const SENTIMENT_COLORS = {
  positive: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  neutral:  { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  negative: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  urgent:   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
};

// ── Main component ──────────────────────────────────────────────

export default function VoiceNoteButton({
  customerId,
  surface = 'quotation',
  contextNote,
  onNoteCreated,
  httpClient,       // optional — POS passes its own axios instance
}) {
  const [state, setState] = useState('idle'); // idle | recording | processing | done | error
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [processingText, setProcessingText] = useState('Transcribing...');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // Check browser support
  const isSupported = typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── Start recording ─────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
        // Only submit if we were in recording state (not discarded)
        if (chunksRef.current.length > 0 && state !== 'idle') {
          submitRecording();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // 1s chunks

      setElapsed(0);
      setState('recording');

      // Timer
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            recorder.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('[VoiceNote] Mic access error:', err);
      setErrorMsg('Microphone access denied. Please allow microphone access in your browser settings.');
      setState('error');
    }
  }, [customerId, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording (submit) ─────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setState('processing');
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Discard recording ───────────────────────────────────────
  const discardRecording = useCallback(() => {
    chunksRef.current = [];
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setState('idle');
    setElapsed(0);
  }, []);

  // ── Submit to backend ───────────────────────────────────────
  const submitRecording = useCallback(async () => {
    setState('processing');
    setProcessingText('Transcribing...');

    // Switch text after 3 seconds
    const textTimer = setTimeout(() => setProcessingText('Structuring note...'), 3000);

    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      formData.append('customerId', String(customerId));
      formData.append('surface', surface);
      if (contextNote) formData.append('contextNote', contextNote);

      const client = httpClient || apiClient;
      const res = await client.post('/api/notes/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000, // 2 min for transcription + structuring
      });

      clearTimeout(textTimer);
      setResult(res.data.data);
      setState('done');

      // Brief success flash, then open drawer
      setTimeout(() => setDrawerOpen(true), 300);
    } catch (err) {
      clearTimeout(textTimer);
      const errData = err.response?.data?.error;
      if (errData?.code === 'TRANSCRIPTION_EMPTY') {
        setErrorMsg('No speech detected — try again.');
      } else {
        setErrorMsg(errData?.message || err.message || 'Failed to process voice note');
      }
      setState('error');
    }
  }, [customerId, surface, contextNote, httpClient]);

  // ── Close drawer ────────────────────────────────────────────
  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    if (result && onNoteCreated) onNoteCreated(result);
    setState('idle');
    setResult(null);
    setElapsed(0);
  }, [result, onNoteCreated]);

  // ── Retry after error ───────────────────────────────────────
  const handleRetry = useCallback(() => {
    setErrorMsg('');
    setState('idle');
  }, []);

  // ── Format elapsed time ─────────────────────────────────────
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── Unsupported browser ─────────────────────────────────────
  if (!isSupported) {
    return (
      <Tooltip title="Voice notes require a secure connection (HTTPS)">
        <span>
          <IconButton disabled size="small">
            <Mic size={20} color="#9ca3af" />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  // ── Render by state ─────────────────────────────────────────
  return (
    <>
      {state === 'idle' && (
        <Tooltip title="Record interaction note">
          <IconButton onClick={startRecording} size="small" disabled={!customerId}>
            <Mic size={20} color={customerId ? '#3b82f6' : '#9ca3af'} />
          </IconButton>
        </Tooltip>
      )}

      {state === 'recording' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <IconButton
            onClick={stopRecording}
            size="small"
            style={{
              background: '#ef4444',
              color: 'white',
              animation: 'voiceNotePulse 1.5s infinite',
            }}
          >
            <Square size={16} fill="white" />
          </IconButton>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(elapsed)}
          </span>
          <IconButton onClick={discardRecording} size="small" title="Discard">
            <X size={16} color="#6b7280" />
          </IconButton>
        </div>
      )}

      {state === 'processing' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <CircularProgress size={20} />
          <span style={{ fontSize: '13px', color: '#6b7280' }}>{processingText}</span>
        </div>
      )}

      {state === 'done' && !drawerOpen && (
        <IconButton size="small" onClick={() => setDrawerOpen(true)}>
          <CheckCircle size={20} color="#16a34a" />
        </IconButton>
      )}

      {state === 'error' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} color="#dc2626" />
          <span style={{ fontSize: '12px', color: '#dc2626', maxWidth: '200px' }}>{errorMsg}</span>
          <button
            onClick={handleRetry}
            style={{
              padding: '4px 10px', fontSize: '12px', background: '#3b82f6',
              color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Result Drawer */}
      <NoteResultDrawer
        open={drawerOpen}
        result={result}
        onClose={handleDrawerClose}
      />
    </>
  );
}

// ── NoteResultDrawer ────────────────────────────────────────────

function NoteResultDrawer({ open, result, onClose }) {
  const [showTranscription, setShowTranscription] = useState(false);

  if (!result) return null;

  const sentimentStyle = SENTIMENT_COLORS[result.sentiment] || SENTIMENT_COLORS.neutral;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 360, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: '#1e293b' }}>
          Voice Note
        </Typography>

        {/* Summary */}
        <Box sx={{
          p: 2, mb: 2, borderRadius: '8px',
          background: '#f0f9ff', border: '1px solid #bfdbfe',
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: '#1e40af', fontSize: '12px' }}>
            Summary
          </Typography>
          <Typography variant="body2" sx={{ color: '#1e293b', lineHeight: 1.5 }}>
            {result.summary}
          </Typography>
        </Box>

        {/* Transcription (collapsible) */}
        <Box sx={{ mb: 2 }}>
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: '#6b7280', padding: 0,
            }}
          >
            {showTranscription ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Raw Transcription
          </button>
          <Collapse in={showTranscription}>
            <Box sx={{
              mt: 1, p: 1.5, background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: '6px', fontSize: '13px', color: '#4b5563',
              lineHeight: 1.6, maxHeight: '150px', overflowY: 'auto',
            }}>
              {result.transcription}
            </Box>
          </Collapse>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Action Items */}
        {result.actionItems && result.actionItems.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#1e293b', fontSize: '13px' }}>
              Action Items
            </Typography>
            {result.actionItems.map((item, i) => (
              <Box key={i} sx={{
                display: 'flex', alignItems: 'flex-start', gap: '8px', mb: 0.5,
              }}>
                <Box sx={{
                  width: 16, height: 16, border: '2px solid #d1d5db',
                  borderRadius: '3px', flexShrink: 0, mt: '2px',
                }} />
                <Typography variant="body2" sx={{ color: '#374151', fontSize: '13px' }}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Follow-up Date */}
        {result.followUpDate && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: '8px', mb: 2,
            p: 1.5, background: '#fef3c7', border: '1px solid #fde68a',
            borderRadius: '6px',
          }}>
            <Calendar size={16} color="#92400e" />
            <Typography variant="body2" sx={{ color: '#92400e', fontWeight: 600, fontSize: '13px' }}>
              Follow up: {new Date(result.followUpDate + 'T00:00:00').toLocaleDateString('en-CA', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </Typography>
          </Box>
        )}

        {/* Tags */}
        {result.tags && result.tags.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#1e293b', fontSize: '13px' }}>
              Tags
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {result.tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    fontSize: '11px', fontWeight: 600,
                    backgroundColor: '#C8614A20',
                    color: '#C8614A',
                    border: '1px solid #C8614A40',
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Sentiment */}
        <Box sx={{ mb: 3 }}>
          <Chip
            label={result.sentiment}
            size="small"
            sx={{
              fontSize: '11px', fontWeight: 700, textTransform: 'capitalize',
              backgroundColor: sentimentStyle.bg,
              color: sentimentStyle.text,
              border: `1px solid ${sentimentStyle.border}`,
            }}
          />
        </Box>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Done button */}
        <Button
          variant="contained"
          fullWidth
          onClick={onClose}
          sx={{
            textTransform: 'none', fontWeight: 600,
            background: '#3b82f6', '&:hover': { background: '#2563eb' },
          }}
        >
          Done
        </Button>
      </Box>
    </Drawer>
  );
}
