import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=anonymous, object=user
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data?.token) localStorage.setItem("edu_token", data.token);
      setUser({ _id: data._id, email: data.email, name: data.name, role: data.role });
      return true;
    } catch (e) {
      setError(formatApiError(e));
      return false;
    }
  };

  const register = async (email, password, name) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", { email, password, name });
      if (data?.token) localStorage.setItem("edu_token", data.token);
      setUser({ _id: data._id, email: data.email, name: data.name, role: data.role });
      return true;
    } catch (e) {
      setError(formatApiError(e));
      return false;
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (_err) { /* ignore */ }
    localStorage.removeItem("edu_token");
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, error, setError, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
