import React, { useContext, useState, createContext } from 'react';

// Create Auth context
const AuthContext = createContext();

// Custom hook to access the context
export function useAuth() {
  return useContext(AuthContext);
}

// AuthProvider component to wrap your app
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null means not logged in

  // Dummy login function (replace with real API)
  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('userData', JSON.stringify(userData));
  };

  // Logout function
  const logout = () => {
    setUser(null);
    localStorage.removeItem('userData');
  };

  // Load from localStorage on first load
  React.useEffect(() => {
    const savedUser = localStorage.getItem('userData');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
