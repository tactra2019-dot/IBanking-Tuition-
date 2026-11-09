import { useRef } from "react";
export function OTPInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");
  const update = (i: number, text: string) => {
    const digits = text.replace(/\D/g, "");
    if (!digits) {
      const next = [...chars];
      next[i] = " ";
      onChange(
        next
          .map((c) => c || " ")
          .join("")
          .trimEnd(),
      );
      return;
    }
    const next = [...chars];
    digits
      .slice(0, 6 - i)
      .split("")
      .forEach((c, j) => (next[i + j] = c));
    onChange(
      next
        .map((c) => c || " ")
        .join("")
        .trimEnd(),
    );
    refs.current[Math.min(i + digits.length, 5)]?.focus();
  };
  return (
    <div className="otp-input" role="group" aria-label="Mã OTP 6 chữ số">
      {chars.map((char, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Chữ số OTP ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          value={char.trim()}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => update(i, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            update(i, e.clipboardData.getData("text"));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const next = [...chars];
              next[i] = " ";
              onChange(
                next
                  .map((c) => c || " ")
                  .join("")
                  .trimEnd(),
              );
              if (i > 0) refs.current[i - 1]?.focus();
            }
            if (e.key === "ArrowLeft")
              refs.current[Math.max(0, i - 1)]?.focus();
            if (e.key === "ArrowRight")
              refs.current[Math.min(5, i + 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
