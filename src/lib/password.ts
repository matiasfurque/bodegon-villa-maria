import crypto from "crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";
const BLOCKED_PASSWORDS = new Set(["admin123", "empleado123", "password", "password123", "12345678", "qwerty123"]);

export function validatePasswordStrength(password: string) {
  const value = password.trim();
  if (value.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres";
  }
  if (BLOCKED_PASSWORDS.has(value.toLowerCase())) {
    return "Elegí una contraseña menos predecible";
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "La contraseña debe incluir letras y numeros";
  }
  return null;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [iterationsRaw, salt, originalHash] = storedHash.split(":");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}
