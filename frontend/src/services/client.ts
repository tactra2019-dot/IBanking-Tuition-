import axios from "axios";
export const isDemo = import.meta.env.VITE_DEMO_MODE !== "false";
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const client = axios.create({
  baseURL: isDemo ? "/demo-api" : import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});
client.interceptors.request.use((config) => {
  if (
    !isDemo &&
    (import.meta.env.VITE_API_CONTRACT_CONFIRMED !== "true" ||
      !import.meta.env.VITE_API_BASE_URL)
  )
    throw new Error(
      "API contract chưa được xác nhận. Xem docs/API-CONTRACT.md để cấu hình kết nối.",
    );
  if (accessToken && !config.headers.Authorization)
    config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
client.interceptors.response.use(
  (r) => r,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.endsWith("/auth/login") &&
      !error.config?.url?.endsWith("/auth/logout")
    )
      window.dispatchEvent(new Event("session-expired"));
    return Promise.reject(error);
  },
);
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.message ||
      (error.code === "ECONNABORTED"
        ? "Kết nối quá thời gian chờ. Kiểm tra lịch sử trước khi thử lại giao dịch."
        : "Không thể kết nối máy chủ. Vui lòng thử lại.")
    );
  return error instanceof Error
    ? error.message
    : "Có lỗi xảy ra. Vui lòng thử lại.";
}
