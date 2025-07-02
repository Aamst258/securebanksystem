function Transfer() {
  return (
    <div>
      <h2 className="mb-4">Transfer Funds</h2>
      <form>
        <div className="mb-3">
          <label htmlFor="recipient" className="form-label">Recipient</label>
          <input type="text" className="form-control" id="recipient" placeholder="Recipient Name" />
        </div>
        <div className="mb-3">
          <label htmlFor="amount" className="form-label">Amount</label>
          <input type="number" className="form-control" id="amount" placeholder="Amount" />
        </div>
        <button type="submit" className="btn btn-success">Transfer</button>
      </form>
    </div>
  );
}
export default Transfer;