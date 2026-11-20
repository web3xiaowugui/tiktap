import { useEffect, useState } from "react";
import { ChevronDown, Database } from "lucide-react";
import { getEnvironments } from "@/api";
import {
  applyEnvironmentOptions,
  environmentLabel,
  getEnvironmentOptions,
  switchEnvironment,
  useEnvironment,
  type AppEnvironment,
  type EnvironmentOption,
} from "@/lib/environment";
import { cn } from "@/lib/cn";

/**
 * 顶栏环境切换：可选环境由后端 APP_ENVS 配置
 * （开发默认 dev,testnet；线上可只配 testnet,mainnet）。
 * 一个后端、一个 SQLite，请求带 env 参数隔离数据。
 */
export function EnvironmentSelect() {
  const environment = useEnvironment();
  const [options, setOptions] = useState<EnvironmentOption[]>(getEnvironmentOptions);

  useEffect(() => {
    let alive = true;
    getEnvironments()
      .then((result) => {
        if (!alive) return;
        applyEnvironmentOptions(result.environments);
        setOptions(getEnvironmentOptions());
      })
      .catch(() => {
        // 接口不可用时保留兜底选项，不影响其他功能
      });
    return () => {
      alive = false;
    };
  }, []);

  const highlight = environment !== "dev";
  // 只配了一个环境时不显示下拉，但仍保留当前环境的图标和名字
  const single = options.length <= 1;

  return (
    <div
      className={cn(
        "relative flex h-7 shrink-0 items-center rounded-md border bg-panel transition",
        highlight ? "border-brand/60" : "border-line",
      )}
      title={single ? "当前运行环境" : "切换运行环境"}
    >
      <Database className="pointer-events-none absolute left-2 h-3 w-3 text-muted2" />
      {single ? (
        <span
          className={cn(
            "pl-6 pr-2.5 text-[10px] font-medium",
            highlight ? "text-brand2" : "text-white",
          )}
        >
          {environmentLabel(environment)}
        </span>
      ) : (
        <>
          <select
            aria-label="切换运行环境"
            value={environment}
            onChange={(event) => {
              switchEnvironment(event.target.value as AppEnvironment);
            }}
            className={cn(
              "h-full cursor-pointer appearance-none rounded-md bg-transparent pl-6 pr-5 text-[10px] font-medium outline-none",
              highlight ? "text-brand2" : "text-white",
            )}
          >
            {options.map((option) => (
              <option
                key={option.id}
                value={option.id}
                className="bg-[#101014] text-white"
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted2" />
        </>
      )}
    </div>
  );
}
