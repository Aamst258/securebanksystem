import { useState } from 'react';
import VoiceCaptcha from '../components/VoiceCaptcha';
import { API_BASE_URL } from '../config/api';

function Transfer() {
  const [activeTab, setActiveTab] = useState('transfer');
  const [formData, setFormData] = useState({ recipient: '', amount: '' });
  const [verificationResult, setVerificationResult] = useState(null);
  const [showVoiceVerification, setShowVoiceVerification] = useState(false);
  const [voiceVerified, setVoiceVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const userData = JSON.parse(localStorage.getItem('userData'));

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setFormData({ recipient: '', amount: '' });
    setVoiceVerified(false);
    setShowVoiceVerification(false);
    setVerificationResult(null);
  };

  const handleVerificationComplete = async (success, message) => {
    setShowVoiceVerification(false);

    if (!success) {
      setVerificationResult({ success: false, message: message || 'Voice verification failed.' });
      return;
    }

    setVoiceVerified(true);
    setIsLoading(true);

    try {
      let endpoint = '';
      if (activeTab === 'transfer') endpoint = 'transfer';
      else if (activeTab === 'deposit') endpoint = 'deposit';
      else if (activeTab === 'withdraw') endpoint = 'withdraw';

      const response = await fetch(`${API_BASE_URL}/api/transactions/${endpoint}`, {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowVoiceVerification(true);
  };

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
            Please complete the verification to proceed.
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h5>Transaction Details</h5>
              {activeTab === 'transfer' && (
                <p><strong>Recipient:</strong> {formData.recipient}</p>
              )}
              <p><strong>Amount:</strong> ₹{parseFloat(formData.amount)?.toLocaleString('en-IN')}</p>
              <p><strong>Action:</strong> {activeTab.toUpperCase()}</p>
            </div>
          </div>

          <VoiceCaptcha
            transactionId={null}
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