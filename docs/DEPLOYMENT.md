# 有伴：服务器部署与交接

本仓库是比赛演示应用，页面品牌为「有伴」。部署目标是让手机患者端与看护端访问同一台服务器。前端由 Node.js 服务提供，同时包含 HTTP API、SSE 同步、后台计时任务和加密文件存储。

## 交接信息

- 仓库：<https://github.com/Iceberg86-gb/youban-care>，默认分支 `main`。
- 私有仓库：部署者需要仓库读取权限。服务器建议使用只读 Deploy Key；不要把个人 GitHub Token 写进克隆地址、脚本或配置文件。
- 运行方式：Docker Compose，一个 `app` 实例；宿主机 Nginx 转发到 `127.0.0.1:4317`。
- 数据：Docker 命名卷 `care-data`，挂载到 `/app/data`。首次运行自动生成演示状态及加密密钥。
- 服务器配置：项目根目录 `.env`，自行填写，不在 Git 中。
- 不会迁移开发电脑上的已有运行记录、医疗上传、密钥或演示文稿构建缓存。

## 1. 准备服务器

需要 Linux 服务器、Git、Docker Engine 与 Docker Compose 插件。可以先用 2 核 / 2 GB 内存的小型服务器进行演示，构建时需预留额外内存和磁盘；这不是压力测试后的容量承诺。服务器需要能够下载 npm、Debian、PyPI 和 Docker 镜像依赖，启用百度服务时还需能访问其接口。

```sh
docker --version
docker compose version
git clone git@github.com:Iceberg86-gb/youban-care.git
cd youban-care
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，至少设置非空且难猜的 `APP_ACCESS_CODE`，可用 `openssl rand -hex 24` 生成。Compose 会拒绝使用空口令启动。口令需通过私下渠道交给演示参与者。

| 变量 | 部署时如何填写 |
| --- | --- |
| `APP_ACCESS_CODE` | 必填，患者端与看护端共用的家庭访问口令 |
| `QIANFAN_API_KEY` | 可选；为空时使用明确标识的本地模板 |
| `QIANFAN_MODEL` | 配置千帆时填写账号实际可用的模型 ID |
| `BAIDU_MAP_BROWSER_AK` | 可选；浏览器类型 AK，需要把部署域名加入白名单 |
| `BAIDU_TTS_API_KEY` / `BAIDU_TTS_SECRET_KEY` | Linux 上使用服务端中文语音时需要配置 |
| `BAIDU_TTS_SPEAKER` | 默认 4197；音库需已开通，可按账号权限改为 0 |

Docker 已设置容器内 `HOST=0.0.0.0`、`PORT=4317`、Python 路径和中文字体，`.env` 中对应本机配置不会覆盖这些容器设置。服务器与容器的默认演示时区使用 `Asia/Shanghai`，也请核对应用中的个人提醒时区。

## 2. 构建并运行

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
curl -I http://127.0.0.1:4317/
curl -i http://127.0.0.1:4317/api/state
```

首页应返回 HTTP 200，未登录的 `/api/state` 应返回 HTTP 401。镜像构建会执行 `npm run check`，运行镜像包含 Python PDF 依赖和文泉驿微米黑中文字体。容器健康检查验证首页可用；它不代表百度服务、PDF 和全部业务功能已经验收。

默认端口仅对服务器本机开放。没有域名时，可以在自己的电脑执行以下命令，通过 SSH 隧道先验收：

```sh
ssh -N -L 4317:127.0.0.1:4317 DEPLOY_USER@SERVER_IP
```

然后访问 `http://localhost:4317`。手机异地访问请继续配置域名与 HTTPS。

## 3. 域名、Nginx 与 HTTPS

将域名解析到服务器公网地址，安全组允许 TCP 80、443，并保留管理用 SSH 入口。不要额外开放 4317。下方命令以 Debian / Ubuntu、宿主机安装 Nginx 为例；已有网关时可由部署者合并模板。

```sh
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/yiban-care
sudo nano /etc/nginx/sites-available/yiban-care
```

把 `care.example.com` 改成实际域名后启用：

```sh
sudo ln -s /etc/nginx/sites-available/yiban-care /etc/nginx/sites-enabled/yiban-care
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN --redirect
sudo certbot renew --dry-run
```

访问 `https://YOUR_DOMAIN`，输入家庭访问口令。患者独立入口为 `https://YOUR_DOMAIN/?view=elder`，原工作台为 `https://YOUR_DOMAIN/?view=dashboard`。

模板保留原始 Host（接口会检查同源）、关闭 SSE 缓冲并延长连接超时。若前面还有 CDN 或其他代理，也需放行 `/api/stream` 的事件流，禁止缓存 `/api/`，允许上传约 8 MB 的 JSON 请求。不要只部署 `dist/` 或使用多实例负载均衡。

## 4. 部署验收

1. 未登录访问家庭 API 返回 401；正确口令可进入应用。
2. 两个浏览器分别打开患者端和看护端，操作后实时同步，不需要手动刷新。
3. 创建一条演示记录，执行 `docker compose restart app`，确认记录仍在。重启会清除内存登录会话，需重新输入口令。
4. 生成就医摘要 PDF，确认中文正常；测试分享链接的只读访问和撤销。
5. 启用百度服务时，分别核对地图域名白名单、千帆响应及语音实际播放。
6. 核对 HTTPS、手机访问和提醒时区。

Linux 没有 macOS 的 `say` 本地语音。未配置可用的百度 TTS 时，不能期待服务器合成语音；文字交互仍可用。浏览器音频播放可能需要用户先点击开启。

当前版本是共用家庭口令、模拟角色和模拟照护数据的受控 demo，没有正式多家庭权限隔离。此次交接不代表完成真实照护系统的生产部署。

## 5. 更新与备份

先停止写入并复制完整数据目录，然后启动原服务。以下命令在仓库目录使用 Bash 执行，备份目录按时间新建：

```bash
umask 077
backup_dir="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
docker compose stop app
docker compose cp app:/app/data "$backup_dir/"
docker compose start app
cp .env "$backup_dir/.env"
```

确认复制成功，并将备份安全保存到另一台机器。数据文件和对应 `.key` 必须一起保存；只备份 `state.json` 无法恢复。`.env` 可能含 API 密钥，同样需要保密。`backups/` 已加入 Git 忽略。

完成备份后更新：

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

普通 `docker compose down` 会保留命名卷；不要执行 `docker compose down -v`，它会删除运行数据。不要同时运行 `npm start` 和容器，也不要横向扩容。

恢复时先停止应用，在已创建的应用容器中将完整备份目录复制回 `/app/data`（例如 `docker compose cp backups/时间/data/. app:/app/data/`），再用 `docker compose run --rm --no-deps --user root app chown -R node:node /app/data` 修正属主。恢复配套 `.env`，最后 `docker compose up -d app`。跨版本回退应同时使用相匹配的代码和备份，避免旧版本读取不兼容状态。

## 6. 常见问题

| 现象 | 检查项 |
| --- | --- |
| Compose 提示家庭访问口令为空 | 在仓库根目录 `.env` 填写 `APP_ACCESS_CODE` |
| Nginx 502 | 容器日志、容器状态、服务器本机 4317 是否可访问 |
| 页面可开但 API 报 403 | 代理是否保留浏览器请求的 Host，页面和 API 是否同源 |
| 两端状态延迟 | SSE 缓冲、CDN 缓存和连接超时 |
| PDF 失败 | 使用完整 Docker 镜像，检查 Python 依赖、中文字体及日志 |
| Linux 无语音 | 百度 TTS 凭证、对应音库权限、浏览器播放授权 |
| 数据写入失败 | 卷权限、磁盘空间；应用容器以 UID 1000 的 node 用户运行 |
| 重启后要重新登录 | 正常：会话保存在内存中 |

## 本次交接验证

2026-09-12 本地执行结果：`npm run check` 的 148 项测试全部通过，Vite 生产构建通过；`node scripts/smoke-access.mjs` 的家庭登录、未登录拦截、医生分享范围、PDF 下载和撤销验证通过；Docker Compose 配置校验通过。生产构建提示主 JS 包超过 500 kB，属于体积提示，不影响构建成功。

开发电脑未运行 Docker daemon，因此 Docker 镜像构建和 Linux/Nginx/HTTPS 实机验收仍需部署者完成；不要把本地测试结果视为服务器已部署。
