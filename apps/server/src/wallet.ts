import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readConfig } from "./config.ts";

/**
 * 用户身份已经全局化（不按环境拆账号），私钥密文也必须跨环境能解：
 * 加密固定用第一把可用的 key（默认 dev 的 WALLET_ENC_KEY），
 * 解密依次尝试 dev / testnet / mainnet 的 key，兼容各环境写入的老数据。
 * 线上部署建议保留一个共享的 WALLET_ENC_KEY，各环境 key 留空即可。
 */
function encryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  for (const env of ["dev", "testnet", "mainnet"] as const) {
    const raw = readConfig(env).walletEncKey;
    if (!raw) continue;
    if (raw.length !== 64) {
      throw new Error(`WALLET_ENC_KEY 必须是 64 位 hex（生成：openssl rand -hex 32）`);
    }
    const key = Buffer.from(raw, "hex");
    if (!keys.some((item) => item.equals(key))) keys.push(key);
  }
  if (keys.length === 0) {
    throw new Error("WALLET_ENC_KEY 未配置：请在 .env 里填 64 位 hex（openssl rand -hex 32）");
  }
  return keys;
}

/** iv.tag.密文，三段 base64。 */
export function encryptPrivateKey(privateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0], iv);
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
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const data = Buffer.from(dataPart, "base64");

  let lastError: unknown;
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);
      return decrypted.toString("utf8") as `0x${string}`;
    } catch (error) {
      // GCM tag 不匹配说明不是这把 key 加密的，换下一把再试。
      lastError = error;
    }
  }
  throw lastError;
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
