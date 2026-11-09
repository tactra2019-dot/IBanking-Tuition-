import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OtpPage } from "./OtpPage";
import { usePayment } from "../hooks/queries";
import { paymentApi } from "../services/paymentApi";
vi.mock("../hooks/queries", () => ({ usePayment: vi.fn() }));
vi.mock("../services/paymentApi", () => ({ paymentApi: { verify: vi.fn(), resend: vi.fn() } }));
afterEach(cleanup);
function renderOtp(expired = false) {
  vi.mocked(usePayment).mockReturnValue({ isPending: false, isError: false, data: {
    id: "P1", studentId: "52200001", studentName: "Demo", amount: 7500000,
    status: "PENDING", createdAt: new Date().toISOString(), description: "Học phí",
    expiresAt: new Date(Date.now() + (expired ? -1000 : 300000)).toISOString(),
    resendAvailableAt: new Date(Date.now()+30000).toISOString(), canResend: true,
  } } as never);
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={["/payment/P1/otp"]}><Routes><Route path="/payment/:paymentId/otp" element={<OtpPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
}
test("two immediate submit events issue one OTP verification request", async () => {
  vi.mocked(paymentApi.verify).mockImplementation(() => new Promise(() => {}));
  renderOtp();
  fireEvent.change(screen.getByLabelText("Chữ số OTP 1"), {target:{value:"123456"}});
  const form=screen.getByRole("button",{name:"Xác nhận OTP"}).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  await vi.waitFor(() => expect(paymentApi.verify).toHaveBeenCalledTimes(1));
});
test("expired OTP disables verification and does not resend automatically", () => {
  renderOtp(true);
  expect((screen.getByRole("button",{name:"Xác nhận OTP"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("OTP đã hết hạn. Vui lòng gửi lại mã.")).toBeTruthy();
  expect(paymentApi.resend).not.toHaveBeenCalled();
});
