/**
 * AI Assistant Chat Component
 * Embedded chat interface for TeleTime Solutions customer support
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  IconButton,
  TextField,
  Typography,
  CircularProgress,
  Fab,
  Collapse,
  Divider,
  Chip,
  Tooltip,
  Badge
} from '@mui/material';
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

// API base URL
const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Main AI Assistant Component
 */
export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Send message to AI
  const sendMessage = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    setInputValue('');
    setError(null);

    // Add user message to UI
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/api/ai/chat`, {
        message,
        conversationId
      });

      const { data } = response.data;

      // Update conversation ID if new
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
      }

      // Add assistant response
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message,
        model: data.model,
        queryType: data.queryType,
        responseTimeMs: data.responseTimeMs,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error('AI chat error:', err);
      setError(err.response?.data?.message || 'Failed to get response. Please try again.');

      // Add error message
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'error',
        content: err.response?.data?.message || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, conversationId]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Start new conversation
  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    // Add welcome message
    setMessages([{
      id: Date.now(),
      role: 'assistant',
      content: "Hi! I'm your TeleTime AI assistant. I can help you:\n\n• **Look up customers** by name, phone, or email\n• **Search products** and check availability\n• **Check quotation status** and history\n• **Draft customer emails**\n• **Suggest cross-sell items**\n\nHow can I help you today?",
      timestamp: new Date()
    }]);
  };

  // Initialize with welcome message when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      startNewConversation();
    }
  }, [isOpen, messages.length]);

  // Submit feedback
  const submitFeedback = async (messageId, feedback) => {
    try {
      await axios.post(`${API_BASE}/api/ai/feedback`, {
        queryLogId: messageId,
        feedback
      });
      // Update message to show feedback submitted
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, feedback } : m
      ));
    } catch (err) {
      console.error('Feedback error:', err);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="AI Assistant"
        onClick={() => setIsOpen(!isOpen)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000
        }}
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
      </Fab>

      {/* Chat Window */}
      <Collapse in={isOpen}>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            width: { xs: 'calc(100% - 48px)', sm: 400 },
            maxWidth: 400,
            height: { xs: 'calc(100vh - 180px)', sm: 500 },
            maxHeight: 600,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 999,
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              bgcolor: 'primary.main',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BotIcon />
              <Typography variant="subtitle1" fontWeight="bold">
                TeleTime AI Assistant
              </Typography>
            </Box>
            <Box>
              <Tooltip title="New conversation">
                <IconButton size="small" onClick={startNewConversation} sx={{ color: 'white' }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: 'white' }}>
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              bgcolor: 'grey.50',
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onFeedback={submitFeedback}
              />
            ))}

            {isLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Thinking...
                </Typography>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          <Box sx={{ p: 2, bgcolor: 'white', borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                ref={inputRef}
                fullWidth
                size="small"
                placeholder="Ask me anything..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                multiline
                maxRows={3}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2
                  }
                }}
              />
              <IconButton
                color="primary"
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
              >
                <SendIcon />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Press Enter to send • Shift+Enter for new line
            </Typography>
          </Box>
        </Paper>
      </Collapse>
    </>
  );
}

/**
 * Individual Message Bubble Component
 */
function MessageBubble({ message, onFeedback }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isAssistant = message.role === 'assistant';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '100%'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          maxWidth: '85%',
          flexDirection: isUser ? 'row-reverse' : 'row'
        }}
      >
        {/* Avatar */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isUser ? 'primary.main' : (isError ? 'error.main' : 'secondary.main'),
            color: 'white',
            flexShrink: 0
          }}
        >
          {isUser ? <PersonIcon fontSize="small" /> : <BotIcon fontSize="small" />}
        </Box>

        {/* Message Content */}
        <Paper
          elevation={1}
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: isUser ? 'primary.main' : (isError ? 'error.light' : 'white'),
            color: isUser ? 'white' : 'text.primary',
            borderTopRightRadius: isUser ? 0 : 2,
            borderTopLeftRadius: isUser ? 2 : 0
          }}
        >
          <Box
            sx={{
              '& p': { m: 0, mb: 1 },
              '& p:last-child': { mb: 0 },
              '& ul, & ol': { m: 0, pl: 2.5 },
              '& li': { mb: 0.5 },
              '& code': {
                bgcolor: isUser ? 'rgba(255,255,255,0.2)' : 'grey.100',
                px: 0.5,
                borderRadius: 0.5,
                fontFamily: 'monospace',
                fontSize: '0.875em'
              },
              '& pre': {
                bgcolor: isUser ? 'rgba(255,255,255,0.2)' : 'grey.100',
                p: 1,
                borderRadius: 1,
                overflow: 'auto',
                '& code': { bgcolor: 'transparent', p: 0 }
              },
              '& table': {
                borderCollapse: 'collapse',
                width: '100%',
                '& th, & td': {
                  border: 1,
                  borderColor: 'divider',
                  p: 0.5,
                  fontSize: '0.875rem'
                }
              },
              '& strong': { fontWeight: 600 }
            }}
          >
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </Box>

          {/* Metadata for assistant messages */}
          {isAssistant && message.model && (
            <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={message.model.includes('haiku') ? 'Haiku' : 'Sonnet'}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
              {message.queryType && (
                <Chip
                  size="small"
                  label={message.queryType.replace('_', ' ')}
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
              {message.responseTimeMs && (
                <Chip
                  size="small"
                  label={`${message.responseTimeMs}ms`}
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          )}
        </Paper>
      </Box>

      {/* Feedback buttons for assistant messages */}
      {isAssistant && !message.feedback && (
        <Box sx={{ mt: 0.5, ml: isUser ? 0 : 5, mr: isUser ? 5 : 0 }}>
          <Tooltip title="Helpful">
            <IconButton
              size="small"
              onClick={() => onFeedback(message.id, 'helpful')}
              sx={{ p: 0.5 }}
            >
              <ThumbUpIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Not helpful">
            <IconButton
              size="small"
              onClick={() => onFeedback(message.id, 'not_helpful')}
              sx={{ p: 0.5 }}
            >
              <ThumbDownIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Show feedback confirmation */}
      {message.feedback && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 5, mt: 0.5 }}>
          Thanks for your feedback!
        </Typography>
      )}
    </Box>
  );
}
