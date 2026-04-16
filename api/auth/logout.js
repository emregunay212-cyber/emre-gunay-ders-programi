import { buildCookie } from "../_lib/auth.js";
import { methodNotAllowed } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  res.setHeader("Set-Cookie", buildCookie("", { clear: true }));
  res.status(200).json({ ok: true });
}
