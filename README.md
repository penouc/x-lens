<p align="center"><img src="icons/icon128.png" width="80" alt="X Lens icon"></p>

# X Lens · 推文透镜

**给 X 时间线加一层轻量提示。** 独立标记疑似 AI、slop 和广告 / 软广，不替你屏蔽或隐藏内容。

![X Lens](docs/assets/blog-cover.png)

## 功能

- 紫色 **AI**、红色 **slop**、蓝色 **广告**：独立判断，可同时出现。
- 检测当前可见推文和详情页文字评论，滚动时继续处理。
- 小标签放在 Grok 左侧；点击后在右上角查看本条评分。
- 默认阈值 65%，设置中可调。不是经过评测的准确率。
- 不访问作者主页，不创建后台标签页，不自动弹窗或屏蔽。

## 安装

1. 从 [Releases](https://github.com/penouc/x-lens/releases) 下载插件 ZIP 并解压；也可下载源码。
2. 打开 chrome://extensions，启用“开发者模式”。
3. 选择“加载已解压的扩展程序”，选中包含 manifest.json 的文件夹。
4. 在扩展设置中填写 [TypeSafe API Key](https://console.typesafe.ai)，勾选自动检测，保存。
5. 刷新 X 页面。可先使用“测试 Jev 连接”检查密钥。

未上架 Chrome 应用商店。更新时替换文件、重新加载扩展并刷新 X 页面。

## 数据与权限

正文发送至 https://api.typesafe.ai/v1/systemone，三个维度在一次请求中判断，可能产生 API 费用。密钥仅保存在本机 chrome.storage.local，不使用同步存储，对页面内容脚本隐藏。X 登录 Cookie 不发送给 Jev。

内容脚本仅运行于 x.com 和 twitter.com。额外网络权限仅授予 TypeSafe API。最多 500 条正文评分缓存在后台内存中，后台重启后清空。详见 [隐私说明](PRIVACY.md)。

## 限制

文本模型可能误判；不能证明作者真实创作方式，也不能证明广告已获付费。只分析已显示的文字，不分析图片、视频和外链。依赖 X 的页面结构；纯媒体或无法识别的内容会跳过。尚未进行系统准确率评测或完整的登录账号在线验收。

本项目独立开发，与 X / Twitter 没有隶属或背书关系。

## 开发

运行依赖：无。测试需要 Node.js 20 或更高版本。

    npm test

- classifier.js：Jev 问题定义、响应验证与阈值判定。
- background.js：密钥访问、API 请求、串行队列和内存缓存。
- content.js / content.css：推文识别、标签和检测状态。
- settings.*：设置与连接测试。
- icons/：Chrome 图标，16 / 32 / 48 / 128 像素。
- docs/blog.zh-CN.md：中文介绍文章，预留两处真实截图。
- docs/assets/：两张 AI 生成的概念配图，不是界面截图。

## License

[MIT](LICENSE)
