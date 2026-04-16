// Consolidated auth endpoint.
//   GET  /api/auth?action=me      → session check
//   POST /api/auth?action=login   → body {password}, sets cookie
//   POST /api/auth?action=logout  → clears cookie
import { getAdminPassword, issueSession, buildCookie, getSessionFromReq } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, serverError } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    const action = (req.query && req.query.action) || "";
    if (req.method === "GET" && action === "me") {
      const session = await getSessionFromReq(req);
      return res.status(200).json({ admin: !!(session && session.role === "admin") });
    }
    if (req.method === "POST" && action === "login") {
      const body = await readJsonBody(req);
      const password = typeof body.password === "string" ? body.password : "";
      if (password !== getAdminPassword()) {
        await new Promise(r => setTimeout(r, 400));
        return res.status(401).json({ error: "Şifre hatalı" });
      }
      const token = await issueSession();
      res.setHeader("Set-Cookie", buildCookie(token));
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && action === "logout") {
      res.setHeader("Set-Cookie", buildCookie("", { clear: true }));
      return res.status(200).json({ ok: true });
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
