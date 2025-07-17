import React, { useState } from 'react';
import { API_BASE_URL, apiEndpoints } from '../config/api';

function VoiceCaptcha({ question, userId, transactionId, onVerificationComplete, isPreVerification = false }) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);

  // No question fetching, question is passed as prop

  const startRecording = async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      setVerificationStatus('Already recording!');
      return;
    }
    setAudioBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new window.MediaRecorder(stream);
      let chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      // Stop recording after 10 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setIsRecording(false);
        }
      }, 10000);
    } catch (error) {
      setVerificationStatus('Microphone access denied or unavailable.');
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
      // No question sent, backend knows which field to check
      const response = await fetch(apiEndpoints.verifyVoiceCaptcha, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (typeof data.attemptsLeft === 'number') {
        setAttemptsLeft(data.attemptsLeft);
      }
      if (data.success) {
        setVerificationStatus('✅ Verification successful!');
        onVerificationComplete(true, 'Voice verification passed');
      } else if (data.attemptsLeft > 0) {
        setAudioBlob(null);
        setVerificationStatus(`❌ Verification failed. Try again! Attempts left: ${data.attemptsLeft}`);
      } else if (data.attemptsLeft === 0) {
        setVerificationStatus('❌ Maximum attempts reached. Transaction denied.');
        onVerificationComplete(false, 'Maximum attempts reached. Transaction denied.');
      } else {
        setVerificationStatus('❌ Verification failed');
        onVerificationComplete(false, data.message || 'Voice verification failed');
      }
    } catch (error) {
      setVerificationStatus('❌ Verification error');
      onVerificationComplete(false, 'Verification error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">🎤 Voice Verification</h5>
        {question && (
          <div className="mb-3">
            <div className="alert alert-info">
              <strong>Security Question:</strong><br />
              {question}
            </div>
          </div>
        )}
        <div className="mb-3">
          <p><strong>Instructions:</strong></p>
          <ol>
            <li>Read the question above</li>
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
        {typeof attemptsLeft === 'number' && attemptsLeft > 0 && (
          <div className="alert alert-info mb-2">Attempts left: {attemptsLeft}</div>
        )}
        {attemptsLeft === 0 && (
          <div className="alert alert-danger mb-2">You have reached the maximum number of attempts. Please try again later.</div>
        )}
      </div>
    </div>
  );
}

export default VoiceCaptcha;