import React, { useState } from 'react';
import { apiEndpoints } from '../config/api';

function VoiceCaptcha({ question, userId, transactionId, onVerificationComplete }) {
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioBlob, setAudioBlob] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // --- NEW: State for diagnostic information ---
    const [recognizedText, setRecognizedText] = useState('');
    const [similarityScore, setSimilarityScore] = useState(null);


    const startRecording = async () => {
        if (isRecording) return;
        // Reset state for a new recording
        setAudioBlob(null);
        setVerificationStatus('');
        setRecognizedText('');
        setSimilarityScore(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            const chunks = [];
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
        } catch (error) {
            console.error("Microphone access error:", error);
            setVerificationStatus('Microphone access denied or unavailable.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    };

    const verifyResponse = async () => {
        if (!audioBlob) {
            setVerificationStatus('Please record your response first');
            return;
        }
        setIsLoading(true);
        setVerificationStatus('Verifying...');
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice-response.webm');
            formData.append('userId', userId);
            formData.append('transactionId', transactionId);

            const response = await fetch(apiEndpoints.verifyVoiceCaptcha, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            // --- NEW: Capture diagnostic info from the response ---
            // NOTE: Your backend must be updated to send these fields in the response.
            if (data.recognizedText) {
                setRecognizedText(data.recognizedText);
            }
            if (typeof data.similarity === 'number') {
                setSimilarityScore(data.similarity);
            }


            if (!response.ok) {
                throw new Error(data.message || data.error || `Server responded with status: ${response.status}`);
            }

            if (data.success) {
                setVerificationStatus('✅ Verification successful!');
                onVerificationComplete(true, 'Voice verification passed');
            } else {
                // --- NEW: More descriptive failure messages ---
                let failureMessage = 'Verification failed.';
                if (data.attemptsLeft > 0) {
                     failureMessage += ` Please try again. Attempts left: ${data.attemptsLeft}`;
                } else {
                     failureMessage = 'Maximum attempts reached. Transaction denied.';
                }
                setVerificationStatus(`❌ ${failureMessage}`);

                if (data.attemptsLeft === 0) {
                    onVerificationComplete(false, 'Maximum attempts reached. Transaction denied.');
                }
            }
        } catch (error) {
            console.error("Verification failed:", error);
            setVerificationStatus(`❌ Verification Error: ${error.message}`);
            onVerificationComplete(false, error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="card">
            <div className="card-body">
                <h5 className="card-title">🎤 Voice Verification</h5>
                {question && (
                    <div className="alert alert-info">
                        <strong>Security Question:</strong><br />
                        {question}
                    </div>
                )}
                <div className="d-flex gap-2 mb-3">
                    <button
                        className={`btn ${isRecording ? 'btn-danger' : 'btn-success'}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isLoading}
                    >
                        {isRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
                    </button>
                    {audioBlob && !isLoading && (
                        <button
                            className="btn btn-primary"
                            onClick={verifyResponse}
                            disabled={isLoading}
                        >
                            ✅ Verify Response
                        </button>
                    )}
                </div>
                {isRecording && <div className="alert alert-warning">🔴 Recording...</div>}
                
                {verificationStatus && (
                    <div className={`alert mt-3 ${verificationStatus.includes('✅') ? 'alert-success' : 'alert-danger'}`}>
                        {verificationStatus}
                    </div>
                )}

                {/* --- NEW: Diagnostic Information Box --- */}
                {!isLoading && (recognizedText || similarityScore !== null) && (
                     <div className="alert alert-secondary mt-2">
                        <h6 className="alert-heading">Verification Details</h6>
                        {recognizedText && (
                            <p className="mb-1"><strong>What we heard:</strong> "{recognizedText}"</p>
                        )}
                        {similarityScore !== null && (
                            <p className="mb-0">
                                <strong>Voice Match Score:</strong> {(similarityScore * 100).toFixed(2)}% 
                                <small className="text-muted"> (Threshold is 75%)</small>
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default VoiceCaptcha;
