# Facial Emotion Detector 中文说明

## 项目简介

Facial Emotion Detector 是一个基于 Web 的人脸情绪识别应用。它会调用摄像头，在浏览器中使用 AI 检测你的面部表情，并用对应的 emoji 展示识别结果。

项目特点：

- 使用 ReactJS 和 face-api.js 构建。
- face-api.js 是一个基于 TensorFlow.js Core API 实现的浏览器端 JavaScript 人脸检测与人脸识别 API。
- 当前项目版本：2.0。
- 所有识别过程都在你自己的浏览器中完成，不会录制或上传视频。

## 在线演示

原项目提供的在线演示地址：

[louiejancevski.github.io/FacialEmotionDetector](https://louiejancevski.github.io/FacialEmotionDetector/)

## 项目目标

这个项目的目标很简单：根据用户在摄像头前做出的面部表情，实时显示匹配的 emoji。

当应用检测到你的人脸后，它会做两件事：

1. 改变页面背景颜色。
2. 将默认 emoji 替换成它认为最匹配当前表情的 emoji。

项目使用 face-api.js 完成检测流程。你可以在这里查看 face-api.js 文档：

[https://justadudewhohacks.github.io/face-api.js/docs/](https://justadudewhohacks.github.io/face-api.js/docs/)

**注意：应用不会在任何时候录制你的视频，所有识别都发生在本机浏览器中。**

## 效果说明

原 README 以 Dwayne Johnson，也就是 The Rock，作为示例展示应用效果。

当他微笑时，emoji 会变成笑脸，背景颜色会变成绿色。

![App demo image](https://github.com/louiejancevski/FacialEmotionDetector/blob/master/public/demo.png)

当他看起来生气时，应用也会捕捉到这种表情，并显示对应的 emoji 和背景颜色。

![App demo image](https://github.com/louiejancevski/FacialEmotionDetector/blob/master/public/demo1.png)

当他的表情比较中性时，应用同样会更新 emoji 和背景颜色。

![App demo image](https://github.com/louiejancevski/FacialEmotionDetector/blob/master/public/demo2.png)

## 可识别的表情

- 默认：😐
- 中性 Neutral：😐
- 开心 Happy：😀
- 伤心 Sad：😥
- 生气 Angry：😠
- 害怕 Fearful：😨
- 厌恶 Disgusted：🤢
- 惊讶 Surprised：😲

## 浏览器支持

推荐使用最新版浏览器：

| Firefox | Chrome | Safari |
| --- | --- | --- |
| 最新版本 | 最新版本 | 最新版本 |

为了正常调用摄像头，浏览器需要允许摄像头权限。`localhost` 属于浏览器认可的安全上下文，因此本地开发地址可以直接使用摄像头。

## 其它注意事项

为了让识别效果更稳定，请确保：

- 房间光线充足。
- 脸部距离摄像头足够近。
- 摄像头加载完成后等待几秒，让模型有时间稳定检测人脸。
- 浏览器弹出摄像头权限请求时选择允许。

## 本地运行方法

### 1. 进入项目目录

从当前仓库根目录执行：

```bash
cd FacialEmotionDetector
```

### 2. 安装依赖

推荐优先使用锁文件安装：

```bash
npm ci
```

如果 `npm ci` 因为本机 npm 版本或锁文件兼容问题失败，可以改用：

```bash
npm install
```

如果遇到旧版 React 依赖解析冲突，可以尝试：

```bash
npm install --legacy-peer-deps
```

### 3. 启动开发服务器

```bash
npm start
```

本仓库已经在 `package.json` 中为 Windows 环境加入了：

```text
NODE_OPTIONS=--openssl-legacy-provider
```

这是为了兼容当前项目使用的旧版 `react-scripts@3.4.2` 和新版 Node.js。你现在不需要再手动设置该环境变量。

启动成功后，浏览器会自动打开。由于原项目设置了 GitHub Pages 的 `homepage`，开发服务器会把应用挂在 `/FacialEmotionDetector` 路径下，推荐访问：

```text
http://localhost:3000/FacialEmotionDetector
```

如果根路径也能正常跳转或显示，也可以使用：

```text
http://localhost:3000
```

请尽量使用 `localhost` 或 `127.0.0.1` 访问，不要使用开发服务器日志中可能出现的 `192.168.x.x` 地址。浏览器通常只允许 HTTPS、`localhost` 或 `127.0.0.1` 调用摄像头，局域网 IP 可能会导致摄像头无法启动。

### 4. 授权摄像头

页面打开后，浏览器会请求摄像头权限。点击“允许”后，应用会加载 `public/models/` 下的 face-api 模型，并开始实时检测面部表情。

## 可用脚本

在 `FacialEmotionDetector` 项目目录中，可以运行以下命令。

### `npm start`

以开发模式运行应用。

访问地址：

```text
http://localhost:3000
```

当你修改源码后，页面会自动刷新。如果有 lint 错误，也会显示在控制台中。

### `npm test`

以交互式 watch 模式启动测试运行器。

更多信息可参考 Create React App 测试文档：

[https://facebook.github.io/create-react-app/docs/running-tests](https://facebook.github.io/create-react-app/docs/running-tests)

### `npm run build`

构建生产版本，输出到 `build` 文件夹。

该命令会以生产模式打包 React，并优化构建结果。构建后的文件会被压缩，文件名中包含 hash，可以用于部署。

更多信息可参考 Create React App 部署文档：

[https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run deploy`

项目 `package.json` 中还定义了部署脚本：

```bash
npm run deploy
```

它会先运行 `npm run build`，然后使用 `gh-pages` 将 `build` 目录发布到 GitHub Pages。这个命令主要用于原作者的 GitHub Pages 部署，本地测试通常不需要执行。

## 常见问题

### 1. 摄像头无法打开

请检查：

- 浏览器是否允许了摄像头权限。
- 摄像头是否被其它软件占用。
- 是否通过 `http://localhost:3000/FacialEmotionDetector` 或 `http://localhost:3000` 访问，而不是直接打开 HTML 文件。
- 是否误用了 `http://192.168.x.x` 这类局域网地址；请改用 `localhost` 或 `127.0.0.1`。
- 浏览器控制台是否出现 `getUserMedia` 相关错误。

### 2. 页面能打开，但没有识别结果

请检查：

- `public/models/` 目录是否完整存在。
- 浏览器 Network 面板中模型文件是否正常加载。
- 摄像头画面中是否能清楚看到完整脸部。
- 当前环境光线是否过暗。

### 3. Node.js 版本导致启动失败

该项目使用的是较旧版本的 `react-scripts@3.4.2`。如果你使用较新的 Node.js，可能会遇到 OpenSSL 或 Webpack 兼容问题。

本项目的 `package.json` 已经在 `npm start`、`npm run build` 和 `npm test` 中加入了 `NODE_OPTIONS=--openssl-legacy-provider`，用于规避新版 Node.js 下的 `ERR_OSSL_EVP_UNSUPPORTED` 问题。

如果仍然启动失败，更稳妥的做法是使用 Node.js 14 或 16 运行该项目。

如果你不想修改 `package.json`，也可以在 PowerShell 中临时设置：

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm start
```

## 了解更多

这个项目由 Create React App 创建。

Create React App 文档：

[https://facebook.github.io/create-react-app/docs/getting-started](https://facebook.github.io/create-react-app/docs/getting-started)

React 文档：

[https://reactjs.org/](https://reactjs.org/)
