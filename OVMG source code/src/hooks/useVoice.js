import { useState, useRef, useCallback } from 'react';

/**
 * useVoice — manages the browser MediaRecorder lifecycle.
 *
 * Returns { phase, start, stop, audioBlob, audioMime, error, reset }
 * phase: 'idle' | 'requesting' | 'recording' | 'processing' | 'done' | 'error'
 */
export function useVoice() {
  const [phase, setPhase]       = useState('idle');
  const [audioBlob, setBlob]    = useState(null);
  const [audioMime, setMime]    = useState('audio/webm');
  const [error, setError]       = useState(null);
  const recorderRef             = useRef(null);
  const chunksRef               = useRef([]);

  const reset = useCallback(() => {
    setPhase('idle');
    setBlob(null);
    setError(null);
    chunksRef.current = [];
    recorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    try {
      setPhase('requesting');
      setError(null);
      setBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick the best supported mime type
      const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      const mime   = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      setMime(mime || 'audio/webm');

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        setBlob(blob);
        setPhase('done');
      };
      recorder.onerror = () => {
        stream.getTracks().forEach(t => t.stop());
        setError('Recording failed. Please try again.');
        setPhase('error');
      };

      recorder.start(250); // collect in 250ms chunks
      setPhase('recording');
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone access in your browser.'
        : `Could not start recording: ${err.message}`;
      setError(msg);
      setPhase('error');
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      setPhase('processing');
    }
  }, []);

  return { phase, start, stop, audioBlob, audioMime, error, reset };
}

/**
 * Convert a Blob to a base64 string (without the data:... prefix)
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // result = "data:audio/webm;base64,XXXXXX" — strip the prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
