/**
 * Centralized error handling middleware.
 * Catches all errors and returns a consistent JSON response.
 * Handles Zod validation errors and Prisma errors specially.
 */
export default function errorHandler(err, req, res, next) {
  console.error(`[${req.method} ${req.originalUrl}] Error:`, err);

  // Zod validation errors (v3 uses err.errors, v4 uses err.issues)
  if (err.name === "ZodError") {
    const issues = err.issues || err.errors || [];
    const messages = issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    return res.status(400).json({ success: false, error: messages || "Invalid request data." });
  }

  // Prisma errors (identified by the PXXXX error code pattern)
  if (err.code && /^P\d{4}$/.test(err.code)) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({ success: false, error: "Resource already exists." });
      case "P2025":
        return res.status(404).json({ success: false, error: "Resource not found." });
      default:
        return res.status(400).json({ success: false, error: "Database error." });
    }
  }

  // Errors with an explicit status code (e.g. from express APIs)
  const statusCode = err.statusCode || err.status || 500;

  // In production, don't leak internal error details
  const message =
    process.env.NODE_ENV === "production" && statusCode === 500
      ? "Internal server error."
      : err.message || "Internal server error.";

  return res.status(statusCode).json({ success: false, error: message });
}
