import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

function VoiceCaptcha({ transactionId, userId, onVerificationComplete, isPreVerification = false }) {
  const [question, setQuestion] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    generateQuestion();
  }, []);

  const generateQuestion = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/voice-captcha/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, transactionId })
      });

      const data = await response.json();
      if (data.success) {
        setQuestion(data.question);
        setAudioUrl(data.audioUrl);

        // Play the question audio
        const audio = new Audio(data.audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error('Error generating question:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      let chunks = [];

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);

      // Stop recording after 10 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
        }
      }, 10000);

    } catch (error) {
      console.error('Error starting recording:', error);
      setVerificationStatus('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const verifyResponse = async () => {
    if (!audioBlob) {
      setVerificationStatus('Please record your response first');
      return;
    }

    try {
      setIsLoading(true);
      setVerificationStatus('Verifying...');

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('userId', userId);
      formData.append('transactionId', transactionId);

      const response = await fetch(`${API_BASE_URL}/api/voice-captcha/verify`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setVerificationStatus('✅ Verification successful!');
        onVerificationComplete(true, 'Voice verification passed');
      } else {
        setVerificationStatus('❌ Verification failed');
        onVerificationComplete(false, data.message || 'Voice verification failed');
      }
    } catch (error) {
      console.error('Error verifying response:', error);
      setVerificationStatus('❌ Verification error');
      onVerificationComplete(false, 'Verification error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const playQuestion = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">🎤 Voice Verification</h5>

        {isLoading && (
          <div className="text-center mb-3">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2">Generating security question...</p>
          </div>
        )}

        {question && (
          <div className="mb-3">
            <div className="alert alert-info">
              <strong>Security Question:</strong><br />
              {question}
            </div>

            <button 
              className="btn btn-outline-primary btn-sm me-2" 
              onClick={playQuestion}
              disabled={!audioUrl}
            >
              🔊 Play Question
            </button>
          </div>
        )}

        <div className="mb-3">
          <p><strong>Instructions:</strong></p>
          <ol>
            <li>Listen to the question above</li>
            <li>Click "Start Recording" and speak your answer clearly</li>
            <li>Click "Stop Recording" when done</li>
            <li>Click "Verify" to complete verification</li>
          </ol>
        </div>

        <div className="d-flex gap-2 mb-3">
          <button 
            className={`btn ${isRecording ? 'btn-danger' : 'btn-success'}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
          >
            {isRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
          </button>

          {audioBlob && (
            <button 
              className="btn btn-primary"
              onClick={verifyResponse}
              disabled={isLoading}
            >
              {isLoading ? 'Verifying...' : '✅ Verify Response'}
            </button>
          )}
        </div>

        {isRecording && (
          <div className="alert alert-warning">
            🔴 Recording... Speak clearly and answer the question above.
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="alert alert-success">
            ✅ Response recorded. Click "Verify Response" to continue.
          </div>
        )}

        {verificationStatus && (
          <div className={`alert ${verificationStatus.includes('✅') ? 'alert-success' : 'alert-danger'}`}>
            {verificationStatus}
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceCaptcha;