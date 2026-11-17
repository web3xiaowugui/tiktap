import { useState } from "react";
import { ChevronDown, Database } from "lucide-react";
import {
  ENVIRONMENT_LABELS,
  readEnvironment,
  switchEnvironment,
  type AppEnvironment,
} from "@/lib/environment";
import { cn } from "@/lib/cn";

/**
 * 顶栏环境切换：X Layer Testnet / 开发环境（本地 Anvil）。
 * 一个后端、一个 SQLite，请求带 env 参数隔离数据。
 */
export function EnvironmentSelect() {
  const [environment, setEnvironment] = useState<AppEnvironment>(readEnvironment);

  return (
    <div
      className={cn(
        "relative flex h-7 shrink-0 items-center rounded-md border bg-panel transition",
        environment === "testnet" ? "border-brand/60" : "border-line",
      )}
      title="切换运行环境"
    >
      <Database className="pointer-events-none absolute left-2 h-3 w-3 text-muted2" />
      <select
        aria-label="切换运行环境"
        value={environment}
        onChange={(event) => {
          const next = event.target.value as AppEnvironment;
          setEnvironment(next);
          switchEnvironment(next);
        }}
        className={cn(
          "h-full cursor-pointer appearance-none rounded-md bg-transparent pl-6 pr-5 text-[10px] font-medium outline-none",
          environment === "testnet" ? "text-brand2" : "text-white",
        )}
      >
        <option value="testnet" className="bg-[#101014] text-white">
          {ENVIRONMENT_LABELS.testnet}
        </option>
        <option value="dev" className="bg-[#101014] text-white">
          {ENVIRONMENT_LABELS.dev}
        </option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted2" />
    </div>
  );
}
