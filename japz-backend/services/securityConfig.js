export function requireJwtSecret(environment = process.env) {
  const secret = environment.JWT_SECRET;
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    /^(?:your[-_ ]|change[-_ ]?me|xianfire-secret)/i.test(secret) ||
    /(.)\1{15}/.test(secret)
  ) {
    throw new Error(
      "Set JWT_SECRET to a unique random value of at least 32 bytes in the private backend environment.",
    );
  }
  return secret;
}

