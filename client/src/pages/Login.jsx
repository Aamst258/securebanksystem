function Login() {
  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{ minHeight: 'calc(100vh - 56px)' }} // adjusts for navbar
    >
      <form
        className="p-4 border rounded shadow bg-white"
        style={{ maxWidth: '400px', width: '100%' }}
      >
        <h2 className="text-center mb-4">Login</h2>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">Email</label>
          <input type="email" className="form-control" id="email" placeholder="Enter email" />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">Password</label>
          <input type="password" className="form-control" id="password" placeholder="Password" />
        </div>
        <button type="submit" className="btn btn-primary w-100">Login</button>
      </form>
    </div>
  );
}

export default Login;
