import { afterEach, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaymentResultPage } from "./PaymentResultPage";
import { usePayment } from "../hooks/queries";
vi.mock("../hooks/queries", () => ({ usePayment: vi.fn() }));
afterEach(cleanup);
const renderStatus = (status: string) => {
  vi.mocked(usePayment).mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      id: "TEST-1",
      studentId: "52200001",
      studentName: "Sinh viên demo",
      amount: 7500000,
      status,
      description: "Học phí",
      createdAt: "2026-01-01T00:00:00Z",
    },
    refetch: vi.fn(),
  } as never);
  render(
    <MemoryRouter initialEntries={["/payment/TEST-1/result"]}>
      <Routes>
        <Route
          path="/payment/:paymentId/result"
          element={<PaymentResultPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
};
test.each(["PENDING", "PROCESSING"])(
  "%s is never displayed as payment success",
  (status) => {
    renderStatus(status);
    expect(
      screen.queryByRole("heading", { name: "Thanh toán học phí thành công" }),
    ).toBeNull();
    expect(
      screen.getByText(/Chưa có xác nhận thanh toán thành công/),
    ).toBeTruthy();
  },
);
test("SUCCESS alone shows confirmed success", () => {
  renderStatus("SUCCESS");
  expect(
    screen.getByRole("heading", { name: "Thanh toán học phí thành công" }),
  ).toBeTruthy();
});
test("FAILED shows an unsuccessful result", () => {
  renderStatus("FAILED");
  expect(
    screen.getByRole("heading", { name: "Giao dịch chưa thành công" }),
  ).toBeTruthy();
});
