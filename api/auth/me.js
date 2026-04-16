import { getSessionFromReq } from "../_lib/auth.js";
import { methodNotAllowed, serverError } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const session = await getSessionFromReq(req);
    res.status(200).json({ admin: !!(session && session.role === "admin") });
  } catch (err) {
    return serverError(res, err);
  }
}
