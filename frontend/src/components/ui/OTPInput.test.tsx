import { afterEach, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { OTPInput } from "./OTPInput";
afterEach(cleanup);
function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <OTPInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}
test("six digits can be pasted and focus moves to the final box", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByLabelText("Chữ số OTP 1"));
  await user.paste("123456");
  expect(screen.getByTestId("value").textContent).toBe("123456");
  expect(document.activeElement).toBe(screen.getByLabelText("Chữ số OTP 6"));
});
test("backspace clears a middle digit without shifting other OTP digits", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByLabelText("Chữ số OTP 1"));
  await user.paste("123456");
  await user.click(screen.getByLabelText("Chữ số OTP 3"));
  await user.keyboard("{Backspace}");
  expect(screen.getByTestId("value").textContent).toBe("12 456");
  expect(
    (screen.getByLabelText("Chữ số OTP 4") as HTMLInputElement).value,
  ).toBe("4");
  await user.click(screen.getByLabelText("Chữ số OTP 3"));
  await user.keyboard("9");
  expect(screen.getByTestId("value").textContent).toBe("129456");
});
test("letters are ignored and disabled inputs cannot accept OTP", async () => {
  const user = userEvent.setup();
  const change = () => {
    throw Error("Should not change");
  };
  render(<OTPInput value="" onChange={change} disabled />);
  await user.type(screen.getByLabelText("Chữ số OTP 1"), "123456");
  expect(
    (screen.getByLabelText("Chữ số OTP 1") as HTMLInputElement).value,
  ).toBe("");
});
