<div align="center">

# 🏡 FloorPlan Studio · 户型设计工作台

### 从第一面墙，到一张清晰、完整的户型图。

墙体绘制 · 门窗布置 · 家具摆放 · 多层管理 · 高清导出

[🌐 在线体验](https://hxt.xiazheteng.fun/) · [📐 GitHub Pages](https://xiazheteng8.github.io/floorplan-studio/) · [📖 部署教程](docs/DEPLOY.md) · [⌨️ 操作与快捷键](docs/USAGE.md)

![Frontend](https://img.shields.io/badge/Frontend-HTML%20%2F%20CSS%20%2F%20JavaScript-2563eb?style=flat-square)
![Backend](https://img.shields.io/badge/Backend-Not%20Required-059669?style=flat-square)
![Deploy](https://img.shields.io/badge/Deploy-Local%20%7C%20VPS%20%7C%20Pages-7c3aed?style=flat-square)

</div>

---

一个在浏览器中工作的二维户型设计器。无需准备点云或 VR 源文件，就能绘制墙体、划分房间、摆放家具，并输出独立楼层图与多层总览。适合户型整理、房源展示、布局沟通和日常设计记录。

**纯静态运行，无需数据库、账号系统或第三方 API 密钥。** 图纸精度取决于输入尺寸和校准结果，实际施工请以专业测绘与审核图纸为准。

## ✨ 从绘制到交付

| 能力 | 功能说明 |
| --- | --- |
| 🧱 墙体与房间 | 直线墙体、矩形房间、端点吸附、正交对齐，闭合空间识别 |
| 🚪 门窗与洞口 | 单开门、双开门、推拉门、窗户与垭口，支持调整与翻转 |
| 🛋️ 家具布置 | 摆件放置、拖动、缩放、旋转、方向键微调和快捷贴墙 |
| 📏 比例与面积 | 标尺、尺寸显示、房间名称与面积，按目标总面积等比缩放 |
| 🖼️ 底图临摹 | 导入参考底图，结合校准与绘制工具还原已有户型 |
| 🏢 多楼层 | 添加地上 / 地下楼层，将当前楼层复制至指定楼层 |
| 📝 房源信息 | 小区名称、户型格局、朝向与建筑面积，配合导出图纸展示 |
| ↩️ 编辑与保存 | 撤销 / 重做、浏览器自动保存与 JSON 项目数据导出 |
| 📤 图纸输出 | PNG / JPG 图片、SVG 矢量图、JSON 项目；多层独立图与合并总览 |
| 💡 新手引导 | 内置分步演示，随时从顶部“试用引导”重新进入 |

### 🖱️ 画墙、放家具，都在同一张画布上

使用吸附与正交辅助确定结构，再放置门窗和家具。摆件主体用于移动，边缘控制点用于缩放，独立旋转手柄用于调整朝向，减少操作时的误触。

### 🏢 一套项目，整理多个楼层

支持向上、向下增加楼层，以及楼层之间复制布局。导出多层项目时，可生成各层独立图纸与合并总览；SVG 可继续用于矢量编辑，JSON 用于保留项目结构数据。

## 🚀 第一次使用

1. 打开 [在线工作台](https://hxt.xiazheteng.fun/)，点击新建户型。
2. 按需填写小区、格局与面积，资料后续仍可修改。
3. 用墙体或矩形房间工具绘制轮廓，再添加门窗。
4. 为房间命名、摆放家具，调整尺寸与比例。
5. 多层户型先切换并检查每个楼层，再预览导出。
6. **保留一份 JSON 项目文件**，用于保留项目结构数据。

> 当前代码会向浏览器写入自动保存快照，但启动仍载入示例，尚未接通自动恢复与通用 JSON 导入；重要项目请及时导出 JSON 和图片留存，不要仅依赖刷新恢复。

## ⌨️ 常用快捷键

| 按键 | 用途 |
| --- | --- |
| `Q` / `W` | 直线墙体 / 矩形房间 |
| `E` 或 `V` | 选择工具 |
| `A` / `S` / `D` | 单开门 / 双开门 / 推拉门 |
| `F` / `Z` | 窗户 / 垭口；选中对象时注意当前工具提示 |
| `M` / `Space` | 整体移动 / 居中复位 |
| `Delete` | 删除选中对象 |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |
| 方向键 / `Ctrl + 方向键` | 摆件精细 / 快速移动 |
| `Shift + 方向键` | 摆件向对应方向贴墙 |

更多说明见 [操作指南](docs/USAGE.md)。输入文字时请先退出输入框，再使用画布快捷键。

## 🧭 部署到哪里都很轻

| 场景 | 推荐方式 | 是否需要后端 |
| --- | --- | --- |
| 自己电脑使用 | `local/start.bat` 或本地 HTTP 服务 | 不需要业务后端 |
| 免费公开访问 | GitHub Pages / Cloudflare Pages | 不需要 |
| 自己的服务器 | Nginx / Docker 托管 `site/` | 不需要 |

👉 **[小白部署教程：本地启动、VPS、域名 HTTPS、GitHub Pages、Cloudflare Pages](docs/DEPLOY.md)**

## 📦 仓库结构

```text
site/                    静态网站，适合 VPS 与 Pages
local/                   本地版、Windows 启动脚本与 Python 静态服务
.github/workflows/       GitHub Pages 自动部署，发布 site/
docs/                    部署教程、操作指南
```

无需 `npm install` 或前端构建。发布时请完整保留 CSS、JavaScript、图片等资源，不能只上传 `index.html`。

## 💬 常见问题

**是否需要 API？** 不需要，本仓库没有必须申请的地图、AI 或云数据库 API。

**能多人实时协作吗？** 当前为浏览器本地编辑工具，没有服务端多人协作系统。可导出 JSON 留存结构数据，当前界面未提供通用 JSON 文件导入入口。

**为什么连续下载被拦截？** 多楼层可能触发多文件下载，请在浏览器中允许本站下载多个文件。

**能离线使用吗？** 完整保留资源后可本地运行；推荐通过附带的本地服务打开，避免浏览器对本地文件访问的限制。

## 🤝 一起完善

[提交问题](https://github.com/xiazheteng8/floorplan-studio/issues) 时，请附浏览器版本、操作步骤和可公开的示例 JSON，便于定位。

[📺 YouTube](https://www.youtube.com/@xiazheteng8) · [💬 Telegram](https://t.me/xiazheteng8) · [🏠 博客](https://xiazheteng.fun/)
