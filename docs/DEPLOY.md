# 🚀 部署 FloorPlan Studio

[← 功能介绍](../README.md) · [操作指南](USAGE.md)

这是纯静态应用，不需要数据库、业务后端或 API Key。下载时请完整保留目录结构。

## 💻 本地：适合自己使用

1. 在仓库点 **Code → Download ZIP**，解压到固定目录。
2. 安装 Python 3；Windows 安装时勾选加入 PATH。
3. 双击 `local/start.bat`，保持终端开启，浏览器访问 `http://localhost:8080/`。

也可在仓库根目录运行：

```bash
python -m http.server 8080 --directory site
```

浏览器访问 `http://127.0.0.1:8080/`，按 `Ctrl+C` 停止。不要混用多个地址寻找同一份自动保存数据；不同来源的浏览器存储相互独立。

## 🌍 VPS：已有网站面板

1. 下载仓库，将 `site/` 里的全部文件上传到网站根目录。
2. 网站默认首页设置为 `index.html`。
3. 绑定域名，将域名解析到 VPS，再申请 HTTPS 证书。
4. 打开页面，确认墙体、家具与导出功能正常。

不需要上传 `local/server.py`，也不需要额外配置 Python 或 Node.js。

### 使用 Docker 托管

服务器已有 Git 与 Docker 时运行：

```bash
git clone https://github.com/xiazheteng8/floorplan-studio.git
cd floorplan-studio
docker run -d --name floorplan-studio --restart unless-stopped -p 8089:80 -v "$PWD/site:/usr/share/nginx/html:ro" nginx:alpine
```

打开 `http://服务器IP:8089/`。上面是 Linux shell 命令。

如需 Nginx Proxy Manager：添加 Proxy Host，填写域名，转发 `http` 到服务器可达地址的 `8089` 端口，申请 SSL。若 NPM 自己在容器中，`127.0.0.1` 指向 NPM 容器，不能直接当作应用地址。

## 🐙 GitHub Pages

1. Fork 仓库到自己的账号。
2. 进入 **Settings → Pages**，Source 选 **GitHub Actions**。
3. 进入 **Actions**，启用并运行 **Deploy GitHub Pages demo**。
4. 工作流发布 `site/`，成功后到 Pages 设置打开站点。

不需要构建命令，也不用手动移动前端到仓库根目录。之后推送 `main` 会再次触发部署。

## ☁️ Cloudflare Pages

### 连接 Git 仓库

1. 在 Cloudflare 创建 Pages 项目，连接自己 Fork 的仓库。
2. 分支填 `main`，根目录填 `site`，框架选 **None**。
3. 构建命令留空，输出目录填 `.`。
4. 部署成功后打开 `pages.dev` 地址，可继续绑定自己的域名。

### 手动上传

创建 Pages 直接上传项目，上传 `site/` 内的完整静态文件；确保发布根目录直接存在 `index.html`，不能再多套一层 `site/` 文件夹。

## 💾 更新与数据保存

更新网页前导出 JSON 项目备份，再替换站点静态文件。项目自动保存位于访问者浏览器，不会因为服务器备份了网页文件就被备份；换域名、电脑或清理浏览器前尤其要导出。

## 🔎 常见问题

| 现象 | 处理方式 |
| --- | --- |
| 页面没有样式或家具不显示 | 检查是否仅上传 HTML、资源路径是否完整 |
| 本地打开部分功能异常 | 改用 HTTP 服务访问，不要直接 `file://` 打开 |
| 端口占用 | 将命令中的 8080 / 8089 换成未占用端口 |
| 多层图只下载一张 | 允许浏览器对本站下载多个文件 |
| 换电脑图纸不见 | 当前没有通用 JSON 导入入口，请保留原浏览器数据并留存 JSON 备份 |

部署验收：新建 → 画封闭房间 → 放门窗与家具 → 导出 JSON → 导出图片（当前自动快照尚未接通刷新恢复）。
