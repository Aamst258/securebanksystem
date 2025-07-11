import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth';

function Dashboard() {
  const { user } = useAuth();
  const [userDetails, setUserDetails] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?._id) {
      fetchUserDetails(user._id);
      fetchRecentTransactions();
    }
    // eslint-disable-next-line
  }, [user]);

  const fetchUserDetails = async (userId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/users/${userId}`);
      const data = await res.json();
      if (data.success) {
        setUserDetails(data.user);
      }
    } catch (err) {
      console.error('Error fetching user details:', err);
    }
  };

  const fetchRecentTransactions = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/transactions/${user?._id}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.transactions.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mt-4 px-4">
      <div className="row">
        <div className="col-12">
          <h2>Welcome back, {userDetails?.name || user?.name}! 👋</h2>
          <p className="text-muted">
            Account No: <strong>{userDetails?.accountNumber || 'Loading...'}</strong>
          </p>
          <p className="text-muted">Your secure banking dashboard</p>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-md-4">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <h5 className="card-title">💰 Account Balance</h5>
              <h3>₹{user?.accountBalance?.toLocaleString('en-IN') || '0'}</h3>
              <small>Available Balance</small>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card bg-success text-white">
            <div className="card-body">
              <h5 className="card-title">📊 This Month</h5>
              <h3>₹2,340.50</h3>
              <small>Total Spent</small>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card bg-info text-white">
            <div className="card-body">
              <h5 className="card-title">🔒 Security Level</h5>
              <h3>High</h3>
              <small>Voice-Verified</small>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Quick Actions</h5>
            </div>
            <div className="card-body">
              <Link to="/transfer" className="btn btn-primary me-2 mb-2">💸 Transfer Money</Link>
              <Link to="/transactions" className="btn btn-outline-primary me-2 mb-2">📋 View All Transactions</Link>
              <Link to="/settings" className="btn btn-outline-secondary mb-2">⚙️ Account Settings</Link>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Recent Transactions</h5>
            </div>
            <div className="card-body">
              {isLoading ? (
                <div className="text-center">Loading...</div>
              ) : transactions.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {transactions.map((transaction) => (
                    <li key={transaction._id} className="list-group-item d-flex justify-content-between">
                      <span>{transaction.recipient}</span>
                      <span className={`badge ${transaction.status === 'approved' ? 'bg-success' : transaction.status === 'denied' ? 'bg-danger' : 'bg-warning'}`}>
                        ₹{transaction.amount?.toLocaleString('en-IN')} - {transaction.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No recent transactions</p>
              )}
              {transactions.length > 0 && (
                <Link to="/transactions" className="btn btn-sm btn-outline-primary mt-2">View All</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Dashboard;