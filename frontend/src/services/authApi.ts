import { client, getAccessToken, isDemo, setAccessToken } from "./client";
import type { User } from "../types";
export const authApi = {
  login: async (username: string, password: string) => {
    const response = await client.post("/auth/login", { username, password });
    if (isDemo) return response.data;
    const { accessToken } = response.data.data;
    setAccessToken(accessToken);
    const profile = (await client.get("/auth/me")).data.data;
    return { accessToken, user: { ...profile, id: profile.userId } as User };
  },
  logout: async () => {
    const token = getAccessToken();
    setAccessToken(null);
    if (isDemo) await client.post("/auth/logout", {}, { headers: { Authorization: "Bearer " + token } });
  },
};

