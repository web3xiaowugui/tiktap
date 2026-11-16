/**
 * Minimal OKX Wallet adapter for the EVM injected provider.
 *
 * OKX documents `window.okxwallet` as the extension entry point and exposes
 * `isOkxWallet` for detection:
 * https://web3.okx.com/zh-hans/onchainos/dev-docs/wallet/dapp-connect/web-detect-okx-wallet
 */

export interface Eip1193Provider {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface OkxInjectedProvider extends Eip1193Provider {
  isOkxWallet?: boolean;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

type WalletWindow = Window & {
  okxwallet?: OkxInjectedProvider;
  ethereum?: OkxInjectedProvider;
};

let announcedOkxProvider: Eip1193Provider | null = null;
let announcementListenerAttached = false;

/** EIP-6963 gives us a second chance when the provider is injected late. */
function listenForAnnouncedProviders() {
  if (announcementListenerAttached || typeof window === "undefined") return;
  announcementListenerAttached = true;

  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.provider?.request || !detail.info) return;

    const { name, rdns } = detail.info;
    if (/okx/i.test(name) || /okx/i.test(rdns)) {
      announcedOkxProvider = detail.provider;
    }
  });

  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getOkxProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;

  listenForAnnouncedProviders();

  const injected = window as WalletWindow;
  if (injected.okxwallet) return injected.okxwallet;
  if (injected.ethereum?.isOkxWallet) return injected.ethereum;

  return announcedOkxProvider;
}

export function isOkxWalletInstalled(): boolean {
  return Boolean(getOkxProvider());
}

export type WalletConnectErrorCode =
  | "not-installed"
  | "rejected"
  | "pending"
  | "no-account"
  | "unknown";

export class WalletConnectError extends Error {
  readonly code: WalletConnectErrorCode;

  constructor(code: WalletConnectErrorCode, message: string) {
    super(message);
    this.name = "WalletConnectError";
    this.code = code;
  }
}

export interface WalletAccount {
  address: string;
  chainId?: string;
}

function errorCode(error: unknown): number | string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return (error as { code?: number | string }).code;
}

export async function connectOkxWallet(): Promise<WalletAccount> {
  const provider = getOkxProvider();
  if (!provider) {
    throw new WalletConnectError(
      "not-installed",
      "未检测到 OKX Wallet 浏览器插件，请先安装并刷新页面。",
    );
  }

  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (error) {
    const code = errorCode(error);
    if (code === 4001 || code === "4001") {
      throw new WalletConnectError("rejected", "你取消了 OKX Wallet 连接。");
    }
    if (code === -32002 || code === "-32002") {
      throw new WalletConnectError(
        "pending",
        "OKX Wallet 里还有待处理的请求，请先在插件中确认。",
      );
    }
    throw new WalletConnectError(
      "unknown",
      "连接 OKX Wallet 失败，请解锁钱包后重试。",
    );
  }

  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new WalletConnectError(
      "no-account",
      "OKX Wallet 没有返回可用账户，请解锁钱包后重试。",
    );
  }

  const address = accounts[0];
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new WalletConnectError(
      "no-account",
      "OKX Wallet 返回的账户地址格式不正确。",
    );
  }

  let chainId: string | undefined;
  try {
    const result = await provider.request({ method: "eth_chainId" });
    if (typeof result === "string") chainId = result;
  } catch {
    // chain id is optional for the demo session
  }

  return { address, chainId };
}
