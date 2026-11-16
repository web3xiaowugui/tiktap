import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const KEY_ENV = "WALLET_ENC_KEY";

function encryptionKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw || raw.length !== 64) {
    throw new Error(`${KEY_ENV} 必须是 64 位 hex（生成：openssl rand -hex 32）`);
  }
  return Buffer.from(raw, "hex");
}

/** iv.tag.密文，三段 base64。 */
export function encryptPrivateKey(privateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64")).join(".");
}

export function decryptPrivateKey(payload: string): `0x${string}` {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("私钥密文格式错误");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8") as `0x${string}`;
}

/** 新建一个托管钱包：地址给用户看，私钥加密后入库。 */
export function createCustodialWallet(): {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  encPkey: string;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey,
    encPkey: encryptPrivateKey(privateKey),
  };
}
