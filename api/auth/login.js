import { getAdminPassword, issueSession, buildCookie } from "../_lib/auth.js";
import { readJsonBody, methodNotAllowed, serverError } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const body = await readJsonBody(req);
    const password = typeof body.password === "string" ? body.password : "";
    if (password !== getAdminPassword()) {
      // Small delay to deter brute force (not perfect, but better than nothing)
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: "Şifre hatalı" });
    }
    const token = await issueSession();
    res.setHeader("Set-Cookie", buildCookie(token));
    res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err);
  }
}
