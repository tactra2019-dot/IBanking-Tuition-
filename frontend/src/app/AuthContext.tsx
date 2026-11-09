import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../services/authApi";
import { setAccessToken } from "../services/client";
import type { User } from "../types";
const Context = createContext<{
  user: User | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const query = useQueryClient();
  const clear = () => {
    setAccessToken(null);
    setUser(null);
    query.clear();
  };
  useEffect(() => {
    window.addEventListener("session-expired", clear);
    return () => window.removeEventListener("session-expired", clear);
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        login: async (u, p) => {
          const result = await authApi.login(u, p);
          setAccessToken(result.accessToken);
          setUser(result.user);
        },
        logout: () => {
          void authApi.logout().catch(() => {});
          clear();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing AuthProvider");
  return context;
}
