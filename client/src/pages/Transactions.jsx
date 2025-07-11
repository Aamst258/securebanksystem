import { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';

function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/transactions/${user?.id}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    if (filter === 'all') return true;
    return transaction.status === filter;
  });

  const getStatusBadge = (status) => {
    const badges = {
      approved: 'bg-success',
      denied: 'bg-danger',
      pending: 'bg-warning text-dark'
    };
    return badges[status] || 'bg-secondary';
  };

  return (
    <div className="container mt-4 px-4">
      <div className="row">
        <div className="col-12">
          <h2>Transaction History 📋</h2>
          <p className="text-muted">View all your banking transactions</p>
        </div>
      </div>

      <div className="row mt-3">
        <div className="col-md-6">
          <div className="btn-group" role="group">
            <button 
              className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button 
              className={`btn ${filter === 'approved' ? 'btn-success' : 'btn-outline-success'}`}
              onClick={() => setFilter('approved')}
            >
              Approved
            </button>
            <button 
              className={`btn ${filter === 'pending' ? 'btn-warning' : 'btn-outline-warning'}`}
              onClick={() => setFilter('pending')}
            >
              Pending
            </button>
            <button 
              className={`btn ${filter === 'denied' ? 'btn-danger' : 'btn-outline-danger'}`}
              onClick={() => setFilter('denied')}
            >
              Denied
            </button>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-12">
          {isLoading ? (
            <div className="text-center">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading transactions...</p>
            </div>
          ) : filteredTransactions.length > 0 ? (
            <div className="card">
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Recipient</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Verification Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((transaction) => (
                        <tr key={transaction._id}>
                          <td>{new Date(transaction.createdAt).toLocaleDateString()}</td>
                          <td>{transaction.recipient}</td>
                          <td>₹{transaction.amount?.toLocaleString('en-IN')}</td>
                          <td>
                            <span className={`badge ${getStatusBadge(transaction.status)}`}>
                              {transaction.status.toUpperCase()}
                            </span>
                          </td>
                          <td>{transaction.verificationAttempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-info text-center">
              <h4>No transactions found</h4>
              <p>No transactions match the selected filter criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default Transactions;