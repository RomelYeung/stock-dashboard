import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT for the given user.
 * @param {{ id: string, email: string, role?: string }} user
 * @returns {string}
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || "USER" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ id: string, email: string, iat: number, exp: number } | null}
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}
