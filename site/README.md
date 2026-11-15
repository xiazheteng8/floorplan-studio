# FloorPlan Studio 户型设计大师 (Web版)

[VPS 示范站点](https://hxt.xiazheteng.fun/) · [YouTube @xiazheteng8](https://www.youtube.com/@xiazheteng8) · [Telegram @xiazheteng8](https://t.me/xiazheteng8)

第一次部署？先按 [本地 / VPS 新手教程](../README.md) 或 [GitHub / Cloudflare Pages 新手教程](../README-PAGES.md) 操作。下面是本目录的功能和配置参考。

纯静态无后端户型设计器，支持直接托管于 **Cloudflare Pages** 或 **GitHub Pages**。

## 部署说明

### 方式 1：Cloudflare Pages 部署 (推荐，秒级部署)
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 进入 **Workers & Pages**。
2. 点击 **Create application** ➔ **Pages** ➔ **Upload assets**。
3. 将解压后的文件夹（或本目录所有文件）直接拖拽上传。
4. 点击 **Deploy site** 即可完成全球 CDN 加速部署！

### 方式 2：GitHub Pages 部署
1. 将本目录所有文件推送至您的 GitHub 仓库（例如 `main` 或 `gh-pages` 分支）。
2. 在仓库设置中：**Settings** ➔ **Pages** ➔ **Build and deployment**。
3. Source 选择 **Deploy from a branch**，Branch 选择对应分支与 `/ (root)` 目录。
4. 保存后约 1 分钟即可通过 `https://<username>.github.io/<repo-name>/` 访问！

### 方式 3：本地单机双击运行
直接在浏览器中双击 `index.html`，或使用任意本地静态服务器预览：
```bash
# Python
python -m http.server 8080

# 或 Node.js npx
npx serve .
```
