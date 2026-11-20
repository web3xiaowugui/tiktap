# 线上安全加固说明（当前生效状态）

> 记录服务器上已经落地的防护，方便重建/迁移时照着做。日期：2026-11-20

## 1. 源站只接受 Cloudflare 回源（mTLS）

- Cloudflare 面板：**SSL/TLS → Origin Server → Authenticated Origin Pulls → Global 开关 On**
- 服务器：

```bash
curl -fsSL -o /etc/nginx/certs/origin-pull-ca.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

`/etc/nginx/sites-enabled/tiktap.conf` 的 443 server 块：

```nginx
ssl_client_certificate /etc/nginx/certs/origin-pull-ca.pem;
ssl_verify_client on;
```

效果：直连源站（不带 Cloudflare 客户端证书）在 TLS 握手阶段被拒（400），
不再依赖维护 Cloudflare IP 网段列表；CF 新增网段也不会误伤。

## 2. 防火墙（ufw）

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH（仅公钥登录）
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

`80/443` 对公网开放是安全的，因为真正的门禁是上面的 mTLS。

## 3. SSH 防护

- `/etc/ssh/sshd_config`（或 `sshd_config.d/`）：
  - `PasswordAuthentication no`
  - `PermitRootLogin prohibit-password`
  - `MaxAuthTries 6`
- fail2ban：见 `deploy/fail2ban-sshd.local`（10 分钟内失败 5 次封 1 小时，`backend=systemd`）

## 4. nginx 应用层限流（`/etc/nginx/conf.d/00-cloudflare.conf`）

```nginx
set_real_ip_from <Cloudflare 网段...>;   # 需与 CF 最新列表同步（只影响真实 IP 还原）
real_ip_header CF-Connecting-IP;
limit_req_zone $binary_remote_addr zone=faucet_rl:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=users_rl:10m  rate=2r/m;
limit_req_zone $binary_remote_addr zone=api_rl:10m    rate=30r/s;
```

## 5. 其它

- `server_tokens off`，HSTS / nosniff / X-Frame-Options / Referrer-Policy 已加
- 后端 `8787` 只监听 `127.0.0.1`
- 配置改动前备份：`/root/config-backup-*`（含 nginx、ufw）

## 6. 已废弃 / 备用

- `deploy/cf-origin-guard.conf`：基于 Cloudflare IP 网段的 nginx `geo` 白名单，
  在没开 mTLS 时可用；开 mTLS 后已停用（服务器上改名为 `.disabled`）。
- `deploy/ufw-cf.sh`：同样按网段放行 80/443 的旧方案，仅作备用。
