/**
 * Validation middleware factory using Zod schemas.
 * @param {import("zod").ZodSchema} schema - The Zod schema to validate against.
 * @param {"body"|"query"|"params"} source - Which part of the request to validate.
 * @returns {Function} Express middleware
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(result.error);
    }
    // Replace with parsed (stripped/transformed) data
    req[source] = result.data;
    next();
  };
}
