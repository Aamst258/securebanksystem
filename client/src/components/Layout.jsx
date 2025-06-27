import { Outlet, Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();          // provided by your auth context

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/">
            SecureBank
          </Link>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarBankNav"
            aria-controls="navbarBankNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="navbarBankNav">
            {user && (
              <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                {['dashboard', 'transactions', 'transfer', 'settings'].map(
                  (p) => (
                    <li className="nav-item" key={p}>
                      <NavLink to={`/${p}`} className="nav-link">
                        {p[0].toUpperCase() + p.slice(1)}
                      </NavLink>
                    </li>
                  )
                )}
              </ul>
            )}

            {user ? (
              <>
                <span className="navbar-text me-2">Hi {user.name}</span>
                <button
                  className="btn btn-outline-light btn-sm"
                  onClick={logout}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link className="btn btn-light btn-sm" to="/login">
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="container my-4">
        <Outlet />
      </main>
    </>
  );
}
