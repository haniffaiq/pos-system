import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const PAYLOAD_PARTS = 3;

const parseKey = (base64Key: string): Buffer => {
  const key = Buffer.from(base64Key, "base64");

  if (key.length !== KEY_BYTES || key.toString("base64") !== base64Key) {
    throw new Error("MFA crypto key must be a 32-byte base64 value");
  }

  return key;
};

const decodePayloadPart = (value: string, label: string): Buffer => {
  if (!value) {
    throw new Error(`Invalid encrypted payload: missing ${label}`);
  }

  return Buffer.from(value, "base64");
};

export const getMfaKmsKey = (): string => {
  const key = process.env.MFA_KMS_KEY;

  if (!key) {
    throw new Error("MFA_KMS_KEY is required to encrypt MFA secrets");
  }

  parseKey(key);
  return key;
};

export const encrypt = (plain: string, base64Key: string = getMfaKmsKey()): string => {
  const key = parseKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64")).join(".");
};

export const decrypt = (payload: string, base64Key: string = getMfaKmsKey()): string => {
  const key = parseKey(base64Key);
  const parts = payload.split(".");

  if (parts.length !== PAYLOAD_PARTS) {
    throw new Error("Invalid encrypted payload: expected iv.tag.ciphertext");
  }

  const iv = decodePayloadPart(parts[0], "iv");
  const tag = decodePayloadPart(parts[1], "auth tag");
  const encrypted = decodePayloadPart(parts[2], "ciphertext");

  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted payload: malformed IV or auth tag");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    throw new Error("Failed to decrypt MFA secret", { cause: error });
  }
};
