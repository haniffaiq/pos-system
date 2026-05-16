import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, getMfaKmsKey } from "./crypto";

const key = Buffer.alloc(32, 1).toString("base64");

const withMfaKmsKey = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.MFA_KMS_KEY;
    return;
  }

  process.env.MFA_KMS_KEY = value;
};

describe("crypto", () => {
  afterEach(() => {
    delete process.env.MFA_KMS_KEY;
  });

  it("roundtrips plaintext with AES-256-GCM", () => {
    const cipher = encrypt("hello", key);

    expect(decrypt(cipher, key)).toBe("hello");
  });

  it("produces different ciphertext for the same plaintext because IVs are random", () => {
    const a = encrypt("mfa-secret", key);
    const b = encrypt("mfa-secret", key);

    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encrypt("mfa-secret", key);
    const parts = cipher.split(".");
    parts[2] = Buffer.from("tampered", "utf8").toString("base64");

    expect(() => decrypt(parts.join("."), key)).toThrow(/decrypt/i);
  });

  it("requires a 32-byte base64 key", () => {
    expect(() => encrypt("hello", Buffer.alloc(31, 1).toString("base64"))).toThrow(/32-byte base64/i);
    expect(() => decrypt(encrypt("hello", key), "not-base64")).toThrow(/32-byte base64/i);
  });

  it("loads MFA_KMS_KEY from the environment", () => {
    withMfaKmsKey(key);

    expect(getMfaKmsKey()).toBe(key);
  });

  it("throws a helpful error when MFA_KMS_KEY is missing or invalid", () => {
    withMfaKmsKey(undefined);
    expect(() => getMfaKmsKey()).toThrow(/MFA_KMS_KEY/);

    withMfaKmsKey(Buffer.alloc(16, 1).toString("base64"));
    expect(() => getMfaKmsKey()).toThrow(/32-byte base64/);
  });
});
