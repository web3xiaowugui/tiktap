import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export interface HandlerContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
}

/** 返回普通对象会被自动序列化成 JSON；返回 undefined 表示自己写响应。 */
export type Handler = (ctx: HandlerContext) => unknown | Promise<unknown>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/** 带状态码的业务错误，由 startServer 转成 JSON 响应。 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    this.routes.push({
      method,
      segments: path.split("/").filter(Boolean),
      handler,
    });
  }

  get(path: string, handler: Handler): void {
    this.add("GET", path, handler);
  }

  post(path: string, handler: Handler): void {
    this.add("POST", path, handler);
  }

  put(path: string, handler: Handler): void {
    this.add("PUT", path, handler);
  }

  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        const segment = route.segments[i];
        if (segment.startsWith(":")) {
          params[segment.slice(1)] = decodeURIComponent(parts[i]);
        } else if (segment !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "请求体不是合法 JSON");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

export function startServer(router: Router, port: number, host = "127.0.0.1"): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const found = router.match(req.method ?? "GET", url.pathname);

    if (!found) {
      sendJson(res, 404, { error: "not_found", path: url.pathname });
      return;
    }

    try {
      const result = await found.handler({
        req,
        res,
        params: found.params,
        query: url.searchParams,
      });
      if (result !== undefined) sendJson(res, 200, result);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      if (status >= 500) console.error(`[api] ${req.method} ${url.pathname} failed:`, message);
      if (!res.headersSent) {
        sendJson(res, status, {
          error: status >= 500 ? "internal" : "bad_request",
          message,
        });
      }
    }
  });

  server.listen(port, host, () => {
    console.log(`[api] listening on http://${host}:${port}`);
  });
}
