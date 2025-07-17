import { useState, useEffect } from 'react';
import VoiceCaptcha from '../components/VoiceCaptcha';
import { API_BASE_URL, apiEndpoints } from '../config/api';

// Add static question templates for transfer verification
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
  const [voiceVerified, setVoiceVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [transactionId, setTransactionId] = useState(null);

  const userData = JSON.parse(localStorage.getItem('userData'));

  // Fetch full user profile from backend
  useEffect(() => {
    async function fetchProfile() {
      if (userData?.id) {
        const res = await fetch(apiEndpoints.getUserProfile(userData.id));
        const data = await res.json();
        if (data.success) setUserProfile(data.user);
      }
    }
    fetchProfile();
  }, [userData]);

  // Pick a random filled field for the question from userProfile, but only when starting verification
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
    setVoiceVerified(false);
    setShowVoiceVerification(false);
    setVerificationResult(null);
    setSelectedQuestion(null);
  };

  const handleVerificationComplete = async (success, message) => {
    setShowVoiceVerification(false);
    setSelectedQuestion(null);
    setTransactionId(null);

    if (!success) {
      setVerificationResult({ success: false, message: message || 'Voice verification failed.' });
      return;
    }

    setVoiceVerified(true);
    setIsLoading(true);

    try {
      let endpoint = '';
      if (activeTab === 'transfer') endpoint = apiEndpoints.transferMoney;
      else if (activeTab === 'deposit') endpoint = apiEndpoints.depositMoney;
      else if (activeTab === 'withdraw') endpoint = apiEndpoints.withdrawMoney;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userData.id,
          amount: parseFloat(formData.amount),
          recipient: activeTab === 'transfer' ? formData.recipient : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Complete the transaction after voice verification
        const completeResponse = await fetch(`${API_BASE_URL}/api/transactions/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionId: data.transactionId
          }),
        });

        const completeData = await completeResponse.json();

        if (completeData.success) {
          setVerificationResult({ 
            success: true, 
            message: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} successful! New balance: ₹${completeData.newBalance?.toLocaleString('en-IN')}` 
          });
          resetForm();
        } else {
          throw new Error(completeData.message || 'Transaction completion failed.');
        }
      } else {
        throw new Error(data.message || 'Transaction failed.');
      }
    } catch (error) {
      setVerificationResult({ success: false, message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Always create a transaction before starting verification
    let endpoint = '';
    if (activeTab === 'transfer') endpoint = apiEndpoints.transferMoney;
    else if (activeTab === 'deposit') endpoint = apiEndpoints.depositMoney;
    else if (activeTab === 'withdraw') endpoint = apiEndpoints.withdrawMoney;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userData.id,
          amount: parseFloat(formData.amount),
          recipient: activeTab === 'transfer' ? formData.recipient : undefined,
        }),
      });
      const data = await response.json();
      if (data.success && data.transactionId) {
        setTransactionId(data.transactionId);
        if (!selectedQuestion) {
          const q = getRandomQuestion();
          setSelectedQuestion(q);
        }
        setShowVoiceVerification(true);
      } else {
        setVerificationResult({ success: false, message: data.message || 'Failed to initiate transaction.' });
      }
    } catch (error) {
      setVerificationResult({ success: false, message: error.message });
    }
  };

  const question = selectedQuestion ? selectedQuestion.question : 'No security info available.';

  return (
    <div className="container mt-4 px-4">
      <h2 className="mb-4">🏦 Account Actions</h2>

      <ul className="nav nav-tabs mb-3">
        {['transfer', 'deposit', 'withdraw'].map((tab) => (
          <li className="nav-item" key={tab}>
            <button
              className={`nav-link ${activeTab === tab ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab);
                resetForm();
              }}
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
        <div>
          <div className="alert alert-warning">
            <strong>Voice Verification Required</strong><br />
            Please answer the following security question to proceed.
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h5>Transaction Details</h5>
              {activeTab === 'transfer' && (
                <p><strong>Recipient:</strong> {formData.recipient}</p>
              )}
              <p><strong>Amount:</strong> ₹{parseFloat(formData.amount)?.toLocaleString('en-IN')}</p>
              <p><strong>Action:</strong> {activeTab.toUpperCase()}</p>
              <div className="mt-3 alert alert-info">
                <strong>Security Question:</strong><br />
                {question}
              </div>
            </div>
          </div>

          {/* VoiceCaptcha component can be replaced with a simple recorder and submit button if desired */}
          <VoiceCaptcha
            question={question}
            transactionId={transactionId}
            userId={userData?.id}
            onVerificationComplete={handleVerificationComplete}
            isPreVerification={true}
          />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {activeTab === 'transfer' && (
            <div className="mb-3">
              <label htmlFor="recipient" className="form-label">Recipient Name</label>
              <input
                type="text"
                className="form-control"
                id="recipient"
                name="recipient"
                value={formData.recipient}
                onChange={handleChange}
                placeholder="Enter recipient name"
                required
              />
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="amount" className="form-label">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              className="form-control"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="Enter amount"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Processing...' : `Verify & ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
          </button>
        </form>
      )}
    </div>
  );
}

export default Transfer;