import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { requireJwtSecret } from "../services/securityConfig.js";

const JWT_SECRET = requireJwtSecret();

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!/^Bearer \S+$/i.test(header))
      return res.status(401).json({ error: "Sign in to continue." });
    const token = jwt.verify(
      header.slice(7),
      JWT_SECRET,
    );
    const user = await User.findByPk(token.id, {
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "status",
        "assignedCategories",
      ],
    });
    if (!user || user.status !== "approved")
      return res
        .status(401)
        .json({ error: "This account no longer has access. Sign in again." });
    req.user = user.toJSON();
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    )
      return res
        .status(401)
        .json({ error: "Your session has expired. Sign in again." });
    next(error);
  }
}

export const allowRoles =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res
        .status(403)
        .json({ error: "Your role cannot perform this action." });
    next();
  };
