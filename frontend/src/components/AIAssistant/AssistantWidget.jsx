/**
 * AssistantWidget — AI Business Assistant (floating chat)
 *
 * Surface-aware assistant with tool use, session memory,
 * and live data access. Powered by POST /api/assistant.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Paper, IconButton, TextField, Typography,
  Fab, Chip, Badge,
} from '@mui/material';
import {
  Sparkles, Send, Plus, Minus,
  Loader2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import apiClient from '../../services/apiClient';

// ── Constants ────────────────────────────────────────────────────

const KLEONIK_COPPER = '#C8614A';
const MAX_CHARS = 500;

const SURFACE_LABELS = {
  pos: 'POS',
  quotation: 'Quotation',
  backoffice: 'Back Office',
};

const TOOL_PROGRESS_TEXT = {
  search_knowledge: 'Searching...',
  get_customer_history: 'Loading customer...',
  get_sales_summary: 'Checking sales data...',
  check_inventory: 'Checking inventory...',
  get_product_details: 'Loading product...',
};

const SUGGESTION_CHIPS = {
  quotation: [
    "What's our history with Peel Housing?",
    'Show me open quotes over $10K',
    'Which brands have the best margin this month?',
  ],
  backoffice: [
    'How did we do this week vs last week?',
    'Which products are aging in inventory?',
    'Show me rep performance this month',
  ],
  pos: [
    'What Samsung fridges do we have in stock?',
    'Look up customer John Smith',
    'Compare LG vs Samsung washers',
  ],
};

// ── Component ────────────────────────────────────────────────────

export default function AssistantWidget({ surface = 'quotation' }) {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [activeTools, setActiveTools] = useState([]);
  const [error, setError] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setHasUnread(false);
    }
  }, [isOpen]);

  // ── Create session ─────────────────────────────────────────

  const createSession = useCallback(async () => {
    try {
      const res = await apiClient.post('/api/assistant/sessions', { surface });
      setSessionId(res.data.data.sessionId);
      setMessages([]);
      setError(null);
      return res.data.data.sessionId;
    } catch (err) {
      console.error('[AssistantWidget] Session create error:', err);
      setError('Could not start session');
      return null;
    }
  }, [surface]);

  // ── Send message ───────────────────────────────────────────

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    setInput('');
    setError(null);

    // Add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setIsLoading(true);

    // Simulate tool-in-progress (we don't have streaming, so show generic)
    setActiveTools(['search_knowledge']);

    try {
      // Ensure we have a session
      let sid = sessionId;
      if (!sid) {
        sid = await createSession();
        if (!sid) { setIsLoading(false); return; }
      }

      const res = await apiClient.post(`/api/assistant/sessions/${sid}/message`, {
        message: msg,
        surface,
      });

      const data = res.data.data;
      setActiveTools([]);

      // Add assistant response
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        toolCallsMade: data.toolCallsMade,
        tokensUsed: data.tokensUsed,
        ts: Date.now(),
      }]);

      // Unread indicator if widget is closed
      if (!isOpen) setHasUnread(true);

    } catch (err) {
      console.error('[AssistantWidget] Send error:', err);
      setActiveTools([]);
      const errMsg = err.response?.data?.message || 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, {
        role: 'error', content: errMsg, ts: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, surface, isOpen, createSession]);

  // ── New session ────────────────────────────────────────────

  const handleNewSession = useCallback(async () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    await createSession();
  }, [createSession]);

  // ── Key handler ────────────────────────────────────────────

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Suggestion click ──────────────────────────────────────

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  // ── Render ────────────────────────────────────────────────

  const suggestions = SUGGESTION_CHIPS[surface] || SUGGESTION_CHIPS.quotation;
  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────── */}
      {!isOpen && (
        <Fab
          onClick={() => setIsOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            bgcolor: KLEONIK_COPPER,
            '&:hover': { bgcolor: '#B5573F' },
            zIndex: 1200,
          }}
        >
          <Badge
            variant="dot"
            invisible={!hasUnread}
            sx={{ '& .MuiBadge-dot': { bgcolor: '#10b981', width: 10, height: 10 } }}
          >
            <Sparkles size={24} color="white" />
          </Badge>
        </Fab>
      )}

      {/* ── Chat Panel ─────────────────────────────────────── */}
      {isOpen && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 400,
            height: 560,
            zIndex: 1200,
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 2, py: 1.5,
            bgcolor: KLEONIK_COPPER, color: 'white',
          }}>
            <Sparkles size={20} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
              TeleTime Assistant
            </Typography>
            <Chip
              label={SURFACE_LABELS[surface]}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontSize: 11 }}
            />
            <IconButton size="small" onClick={handleNewSession} sx={{ color: 'white' }} title="New session">
              <Plus size={18} />
            </IconButton>
            <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: 'white' }} title="Minimize">
              <Minus size={18} />
            </IconButton>
          </Box>

          {/* Messages area */}
          <Box sx={{
            flex: 1, overflowY: 'auto', px: 2, py: 1.5,
            display: 'flex', flexDirection: 'column', gap: 1.5,
            bgcolor: '#fafafa',
          }}>
            {/* Empty state */}
            {isEmpty && !isLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 2, py: 4 }}>
                <Sparkles size={32} style={{ color: KLEONIK_COPPER, opacity: 0.5 }} />
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Ask me anything about your business
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                  {suggestions.map((s, i) => (
                    <Box
                      key={i}
                      onClick={() => handleSuggestion(s)}
                      sx={{
                        px: 2, py: 1, borderRadius: '10px',
                        border: '1px solid #e5e7eb', bgcolor: 'white',
                        cursor: 'pointer', fontSize: 13,
                        '&:hover': { borderColor: KLEONIK_COPPER, bgcolor: '#fef7f5' },
                        transition: 'all 0.15s',
                      }}
                    >
                      {s}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {/* Tool-in-progress indicator */}
            {isLoading && activeTools.length > 0 && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 2, py: 1, bgcolor: '#f0f4f8', borderRadius: '10px',
                maxWidth: '80%',
              }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: KLEONIK_COPPER }} />
                <Typography variant="caption" color="text.secondary">
                  {TOOL_PROGRESS_TEXT[activeTools[0]] || 'Thinking...'}
                </Typography>
              </Box>
            )}

            {/* Loading dots when no active tools */}
            {isLoading && activeTools.length === 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, px: 2, py: 1 }}>
                {[0, 1, 2].map(i => (
                  <Box
                    key={i}
                    sx={{
                      width: 6, height: 6, borderRadius: '50%',
                      bgcolor: '#9ca3af',
                      animation: `pulse 1.4s ${i * 0.2}s infinite ease-in-out`,
                      '@keyframes pulse': {
                        '0%, 80%, 100%': { opacity: 0.3 },
                        '40%': { opacity: 1 },
                      },
                    }}
                  />
                ))}
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Input area */}
          <Box sx={{
            px: 2, py: 1.5,
            borderTop: '1px solid #e5e7eb',
            bgcolor: 'white',
          }}>
            {error && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {error}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
              <TextField
                inputRef={inputRef}
                value={input}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                multiline
                maxRows={3}
                size="small"
                fullWidth
                disabled={isLoading}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    fontSize: 14,
                  },
                }}
              />
              <IconButton
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                sx={{
                  bgcolor: KLEONIK_COPPER,
                  color: 'white',
                  width: 36, height: 36,
                  '&:hover': { bgcolor: '#B5573F' },
                  '&.Mui-disabled': { bgcolor: '#e5e7eb', color: '#9ca3af' },
                }}
              >
                <Send size={16} />
              </IconButton>
            </Box>
            {input.length > MAX_CHARS - 50 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
                {input.length}/{MAX_CHARS}
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      {/* Spin keyframe for Loader2 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

// ── Message Bubble ──────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '100%',
    }}>
      <Box sx={{
        maxWidth: '85%',
        px: 2,
        py: 1,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        bgcolor: isUser ? KLEONIK_COPPER : isError ? '#fef2f2' : 'white',
        color: isUser ? 'white' : isError ? '#dc2626' : 'inherit',
        border: isUser || isError ? 'none' : '1px solid #e5e7eb',
        boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
      }}>
        {isUser || isError ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {message.content}
          </Typography>
        ) : (
          <Box sx={{
            '& p': { m: 0, mb: 0.5, fontSize: 13, lineHeight: 1.6 },
            '& p:last-child': { mb: 0 },
            '& ul, & ol': { m: 0, pl: 2.5, fontSize: 13 },
            '& li': { mb: 0.25 },
            '& strong': { fontWeight: 700 },
            '& code': {
              fontSize: 12, bgcolor: '#f3f4f6', px: 0.5,
              borderRadius: '4px', fontFamily: 'monospace',
            },
            '& pre': {
              bgcolor: '#f3f4f6', p: 1, borderRadius: '8px',
              overflow: 'auto', fontSize: 12,
            },
          }}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </Box>
        )}
        {message.toolCallsMade > 0 && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.5, fontSize: 10 }}>
            {message.toolCallsMade} tool{message.toolCallsMade > 1 ? 's' : ''} used
          </Typography>
        )}
      </Box>
    </Box>
  );
}
