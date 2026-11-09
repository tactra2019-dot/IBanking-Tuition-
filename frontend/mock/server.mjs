import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createBank, ApiError } from "./domain.mjs";
export function createMockServer(bank = createBank()) {
  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, data) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      let data = {};
      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) throw new ApiError(413, "Yêu cầu quá lớn.");
        }
        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          throw new ApiError(400, "JSON không hợp lệ.");
        }
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new ApiError(400, "Dữ liệu không hợp lệ.");
      }
      if (url.pathname === "/auth/login" && req.method === "POST")
        return send(200, bank.login(data.username, data.password));
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      bank.authorize(token);
      if (url.pathname === "/auth/logout" && req.method === "POST") {
        bank.logout(token);
        return send(200, {});
      }
      if (url.pathname === "/auth/me" && req.method === "GET")
        return send(200, bank.user());
      if (url.pathname === "/accounts/me" && req.method === "GET")
        return send(200, bank.account());
      const s = url.pathname.match(/^\/students\/([a-zA-Z0-9]+)\/tuition$/);
      if (s && req.method === "GET") return send(200, bank.student(s[1]));
      if (url.pathname === "/payments" && req.method === "GET") {
        const page = Number(url.searchParams.get("page") || 1);
        if (!Number.isInteger(page) || page < 1)
          throw new ApiError(400, "Trang không hợp lệ.");
        return send(
          200,
          bank.list({ status: url.searchParams.get("status"), page }),
        );
      }
      if (url.pathname === "/payments" && req.method === "POST")
        return send(
          201,
          bank.create(data.studentId, req.headers["idempotency-key"]),
        );
      const p = url.pathname.match(
        /^\/payments\/([a-zA-Z0-9-]+)(?:\/(verify-otp|resend-otp))?$/,
      );
      if (p && req.method === "GET" && !p[2]) return send(200, bank.get(p[1]));
      if (p && req.method === "POST" && p[2] === "verify-otp")
        return send(200, bank.verify(p[1], data.otp));
      if (p && req.method === "POST" && p[2] === "resend-otp")
        return send(200, bank.resend(p[1]));
      send(404, { message: "Endpoint không tồn tại." });
    } catch (e) {
      send(e instanceof ApiError ? e.status : 500, {
        code: e instanceof ApiError ? e.code : "INTERNAL_ERROR",
        message: e instanceof ApiError ? e.message : "Lỗi mock server.",
      });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  createMockServer().listen(3001, "127.0.0.1", () =>
    console.info(
      "Demo API: http://127.0.0.1:3001 — simulated data only; no email or money transfer.",
    ),
  );
