import { client, getAccessToken } from "./client";
import type { User } from "../types";
export const authApi = {
  login: async (username: string, password: string) =>
    (
      await client.post<{ accessToken: string; user: User }>("/auth/login", {
        username,
        password,
      })
    ).data,
  // Capture before the UI clears its session; Axios interceptors run asynchronously.
  logout: () => client.post("/auth/logout", {}, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  }),
};
