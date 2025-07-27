import { useState, useEffect } from 'react';
import VoiceCaptcha from '../components/VoiceCaptcha';
import { API_BASE_URL, apiEndpoints } from '../config/api';

// Static question templates for transfer verification
const QUESTION_TEMPLATES = [
    { field: 'nickname', question: "What is your nickname?" },
    { field: 'shoeSize', question: "What is your shoe size?" },
    { field: 'favoriteColor', question: "What is your favorite color?" },
    { field: 'birthPlace', question: "What is your birth place?" },
    { field: 'petName', question: "What is your pet's name?" },
    { field: 'motherMaidenName', question: "What is your mother's maiden name?" },
    { field: 'firstSchool', question: "What is the name of your first school?" },
    { field: 'childhoodFriend', question: "Who was your best childhood friend?" }
];

function Transfer() {
    const [activeTab, setActiveTab] = useState('transfer');
    const [formData, setFormData] = useState({ recipient: '', amount: '' });
    const [verificationResult, setVerificationResult] = useState(null);
    const [showVoiceVerification, setShowVoiceVerification] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [selectedQuestion, setSelectedQuestion] = useState(null);
    const [transactionId, setTransactionId] = useState(null);

    const userData = JSON.parse(localStorage.getItem('userData'));

    // Fetch full user profile from backend
    useEffect(() => {
        async function fetchProfile() {
            if (userData?.id) {
                try {
                    const res = await fetch(apiEndpoints.getUserProfile(userData.id));
                    const data = await res.json();
                    if (res.ok && data.success) {
                        setUserProfile(data.user);
                    } else {
                        setVerificationResult({ success: false, message: data.message || 'Failed to fetch user profile.' });
                    }
                } catch (error) {
                    setVerificationResult({ success: false, message: 'Error fetching user profile.' });
                }
            }
        }
        fetchProfile();
    }, [userData?.id]);

    const getRandomQuestion = () => {
        if (!userProfile) return null;
        const filledFields = QUESTION_TEMPLATES.filter(q => userProfile[q.field]);
        if (filledFields.length === 0) return null;
        return filledFields[Math.floor(Math.random() * filledFields.length)];
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const resetForm = () => {
        setFormData({ recipient: '', amount: '' });
        setShowVoiceVerification(false);
        setVerificationResult(null);
        setSelectedQuestion(null);
        setTransactionId(null);
        setIsLoading(false);
    };

    const handleVerificationComplete = async (success, message) => {
        setShowVoiceVerification(false);
        setSelectedQuestion(null);

        if (!success) {
            setVerificationResult({ success: false, message: message || 'Voice verification failed.' });
            resetForm();
            return;
        }

        setIsLoading(true);
        try {
            if (!transactionId) {
                throw new Error('Transaction ID is missing. Cannot complete the transaction.');
            }

            const completeResponse = await fetch(apiEndpoints.completeTransaction, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId }),
            });

            const completeData = await completeResponse.json();
            if (!completeResponse.ok) {
                throw new Error(completeData.message || `Failed to complete transaction. Status: ${completeResponse.status}`);
            }

            setVerificationResult({
                success: true,
                message: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} successful! New balance: ₹${completeData.newBalance?.toLocaleString('en-IN')}`
            });
            setTimeout(resetForm, 4000);
        } catch (error) {
            setVerificationResult({ success: false, message: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setVerificationResult(null);

        if (!userData?.id) {
            setVerificationResult({ success: false, message: 'User not logged in.' });
            return;
        }
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            setVerificationResult({ success: false, message: 'Please enter a valid amount.' });
            return;
        }
        if (activeTab === 'transfer' && !formData.recipient) {
            setVerificationResult({ success: false, message: 'Please enter a recipient.' });
            return;
        }

        setIsLoading(true);
        try {
            let endpoint = '';
            if (activeTab === 'transfer') endpoint = apiEndpoints.transferMoney;
            else if (activeTab === 'deposit') endpoint = apiEndpoints.depositMoney;
            else if (activeTab === 'withdraw') endpoint = apiEndpoints.withdrawMoney;

            // FIX: Always include recipient, set to null if not a transfer.
            // This can help with backend validation that expects the field to exist.
            const requestBody = {
                userId: userData.id,
                amount: parseFloat(formData.amount),
                recipient: activeTab === 'transfer' ? formData.recipient : null,
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();
            
            // FIX: Better error handling to catch 4xx/5xx responses.
            if (!response.ok) {
                throw new Error(data.message || `Request failed with status ${response.status}`);
            }

            if (data.success && data.transactionId) {
                setTransactionId(data.transactionId);
                const q = getRandomQuestion();
                if (!q) {
                    setVerificationResult({ success: false, message: 'Cannot proceed. No security questions are set up on your profile.' });
                    return;
                }
                setSelectedQuestion(q);
                setShowVoiceVerification(true);
            } else {
                setVerificationResult({ success: false, message: data.message || 'Failed to initiate transaction.' });
            }
        } catch (error) {
            setVerificationResult({ success: false, message: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const questionText = selectedQuestion ? selectedQuestion.question : 'Loading security question...';

    return (
        <div className="container mt-4 px-4">
            <h2 className="mb-4">🏦 Account Actions</h2>
            <ul className="nav nav-tabs mb-3">
                {['transfer', 'deposit', 'withdraw'].map((tab) => (
                    <li className="nav-item" key={tab}>
                        <button
                            className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => { setActiveTab(tab); resetForm(); }}
                            disabled={isLoading}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    </li>
                ))}
            </ul>

            {verificationResult && (
                <div className={`alert ${verificationResult.success ? 'alert-success' : 'alert-danger'}`}>
                    {verificationResult.message}
                </div>
            )}

            {showVoiceVerification ? (
                <VoiceCaptcha
                    question={questionText}
                    transactionId={transactionId}
                    userId={userData?.id}
                    onVerificationComplete={handleVerificationComplete}
                />
            ) : (
                <form onSubmit={handleSubmit}>
                    {activeTab === 'transfer' && (
                        <div className="mb-3">
                            <label htmlFor="recipient" className="form-label">Recipient Name</label>
                            <input type="text" className="form-control" id="recipient" name="recipient" value={formData.recipient} onChange={handleChange} placeholder="Enter recipient name" required />
                        </div>
                    )}
                    <div className="mb-3">
                        <label htmlFor="amount" className="form-label">Amount (₹)</label>
                        <input type="number" step="0.01" className="form-control" id="amount" name="amount" value={formData.amount} onChange={handleChange} placeholder="Enter amount" required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isLoading || !userProfile}>
                        {isLoading ? 'Processing...' : `Proceed to Verification`}
                    </button>
                    {!userProfile && <small className="d-block mt-2 text-muted">Loading user data...</small>}
                </form>
            )}
        </div>
    );
}

export default Transfer;
