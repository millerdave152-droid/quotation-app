/**
 * POS Voice Note Button
 *
 * Tailwind + heroicons version for the POS app.
 * Records audio → uploads to /api/notes/voice → shows result drawer.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { AlertCircle, Calendar, CheckCircle, ChevronDown, ChevronUp, Mic, Square, X } from 'lucide-react';

const MAX_RECORDING_SECONDS = 300; // 5 min

const SENTIMENT_COLORS = {
  positive: 'bg-green-50 text-green-800 border-green-300',
  neutral:  'bg-gray-100 text-gray-700 border-gray-300',
  negative: 'bg-red-50 text-red-800 border-red-300',
  urgent:   'bg-amber-50 text-amber-800 border-amber-300',
};

export default function VoiceNoteButton({ customerId, surface = 'pos', contextNote, onNoteCreated }) {
  const [state, setState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [processingText, setProcessingText] = useState('Transcribing...');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const isSupported = typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
        if (chunksRef.current.length > 0 && state !== 'idle') submitRecording();
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setElapsed(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) recorder.stop();
          return prev + 1;
        });
      }, 1000);
    } catch {
      setErrorMsg('Microphone access denied.');
      setState('error');
    }
  }, [customerId, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state !== 'inactive') {
      setState('processing');
      recorderRef.current.stop();
    }
  }, []);

  const discard = useCallback(() => {
    chunksRef.current = [];
    clearInterval(timerRef.current);
    if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setState('idle');
    setElapsed(0);
  }, []);

  const submitRecording = useCallback(async () => {
    setState('processing');
    setProcessingText('Transcribing...');
    const txtTimer = setTimeout(() => setProcessingText('Structuring note...'), 3000);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const fd = new FormData();
      fd.append('audio', blob, 'recording.webm');
      fd.append('customerId', String(customerId));
      fd.append('surface', surface);
      if (contextNote) fd.append('contextNote', contextNote);
      const res = await api.post('/notes/voice', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      clearTimeout(txtTimer);
      setResult(res.data);
      setState('done');
      setTimeout(() => setShowDrawer(true), 300);
    } catch (err) {
      clearTimeout(txtTimer);
      const d = err.response?.data?.error;
      setErrorMsg(d?.code === 'TRANSCRIPTION_EMPTY' ? 'No speech detected — try again.' : (d?.message || 'Processing failed'));
      setState('error');
    }
  }, [customerId, surface, contextNote]);

  const closeDrawer = useCallback(() => {
    setShowDrawer(false);
    if (result && onNoteCreated) onNoteCreated(result);
    setState('idle');
    setResult(null);
    setElapsed(0);
  }, [result, onNoteCreated]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!isSupported) {
    return (
      <button disabled title="Voice notes require HTTPS"
        className="w-8 h-8 flex items-center justify-center text-gray-300 cursor-not-allowed">
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      {state === 'idle' && (
        <button onClick={startRecording} disabled={!customerId}
          title="Record interaction note"
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors
            ${customerId ? 'text-blue-500 hover:bg-blue-50 hover:text-blue-600' : 'text-gray-300 cursor-not-allowed'}`}>
          <Mic className="w-5 h-5" />
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-2">
          <button onClick={stopRecording}
            className="w-8 h-8 flex items-center justify-center bg-red-500 rounded-full text-white animate-pulse">
            <Square className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-red-500 tabular-nums">{fmt(elapsed)}</span>
          <button onClick={discard} title="Discard"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-500">{processingText}</span>
        </div>
      )}

      {state === 'done' && !showDrawer && (
        <button onClick={() => setShowDrawer(true)}
          className="w-8 h-8 flex items-center justify-center text-green-500">
          <CheckCircle className="w-5 h-5" />
        </button>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-xs text-red-600 max-w-[160px] truncate">{errorMsg}</span>
          <button onClick={() => { setErrorMsg(''); setState('idle'); }}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded">Retry</button>
        </div>
      )}

      {/* Slide-over Drawer */}
      {showDrawer && result && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[360px] bg-white h-full shadow-2xl flex flex-col overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 flex flex-col gap-4 flex-1">
              <h2 className="text-lg font-bold text-gray-900">Voice Note</h2>

              {/* Summary */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-700 mb-1">Summary</p>
                <p className="text-sm text-gray-800 leading-relaxed">{result.summary}</p>
              </div>

              {/* Transcription */}
              <div>
                <button onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                  {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Raw Transcription
                </button>
                {showTranscript && (
                  <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 leading-relaxed max-h-36 overflow-y-auto">
                    {result.transcription}
                  </div>
                )}
              </div>

              <hr className="border-gray-200" />

              {/* Action Items */}
              {result.actionItems?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Action Items</p>
                  {result.actionItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <div className="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up */}
              {result.followUpDate && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <Calendar className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-semibold text-amber-800">
                    Follow up: {new Date(result.followUpDate + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}

              {/* Tags */}
              {result.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Sentiment */}
              <span className={`inline-block self-start px-2.5 py-0.5 text-[10px] font-bold rounded-full capitalize border ${SENTIMENT_COLORS[result.sentiment] || SENTIMENT_COLORS.neutral}`}>
                {result.sentiment}
              </span>
            </div>

            {/* Done button */}
            <div className="p-4 border-t border-gray-200">
              <button onClick={closeDrawer}
                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
