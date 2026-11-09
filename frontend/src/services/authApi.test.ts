import { afterEach, expect, test } from "vitest";
import { client, setAccessToken } from "./client";
import { authApi } from "./authApi";
const originalAdapter = client.defaults.adapter;
afterEach(() => { client.defaults.adapter = originalAdapter; setAccessToken(null); });
test("logout retains authorization after local session is immediately cleared", async () => {
  let authorization: unknown;
  client.defaults.adapter = async config => {
    authorization = config.headers.Authorization;
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  setAccessToken("demo-session-for-test");
  const request = authApi.logout();
  setAccessToken(null);
  await request;
  expect(authorization).toBe("Bearer demo-session-for-test");
});
