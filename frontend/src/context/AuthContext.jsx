import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUser(json.user);
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    let res;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      throw new Error("Connection failed. Please check if the server is running.");
    }

    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw new Error("Unable to parse server response. The server may be experiencing issues.");
    }

    if (!json.success) throw new Error(json.error || "Login failed");
    setUser(json.user);
    return json;
  };

  const register = async (email, password) => {
    let res;
    try {
      res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      throw new Error("Connection failed. Please check if the server is running.");
    }

    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw new Error("Unable to parse server response. The server may be experiencing issues.");
    }

    if (!json.success) throw new Error(json.error || "Registration failed");
    setUser(json.user);
    return json;
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // swallow errors on logout
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
