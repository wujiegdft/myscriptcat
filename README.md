# myscriptcat

[ScriptCat](https://scriptcat.org/) 用户脚本合集。浏览器装好 ScriptCat（或 Tampermonkey）后，点下面的「安装」即可。

## 脚本

| 脚本 | 版本 | 做什么 | 安装 |
| --- | --- | --- | --- |
| [YouTube 快捷播放速度控制器](youtube-speed-controller.user.js) | 1.1.1 | 播放器上快捷切换 0.5x–2x，并记住倍速 | [安装](https://raw.githubusercontent.com/wujiegdft/myscriptcat/main/youtube-speed-controller.user.js) |
| [Reddit to DeepSeek](reddit-deepseek-summarizer.user.js) | 1.5.0 | 从 Reddit 帖子复制 Prompt，或一键发到 DeepSeek | [安装](https://raw.githubusercontent.com/wujiegdft/myscriptcat/main/reddit-deepseek-summarizer.user.js) |
| [闲鱼搜索按想要人数排序](xianyu-sort-by-wants.user.js) | 1.2.0 | 闲鱼搜索页按「想要」人数排序 | [安装](https://raw.githubusercontent.com/wujiegdft/myscriptcat/main/xianyu-sort-by-wants.user.js) |

## 开发

改动走 GitHub PR，不要直接推 `main`。每个脚本一个 `.user.js` 文件，头部 `@name` / `@version` / `@match` 保持完整。
