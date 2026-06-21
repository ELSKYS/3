# RED DMA Main Server Bot

Discord 总群机器人：新人欢迎、规则发布、账户验证、一键设置。

## 环境变量

在 Railway 或本地 `.env` 中配置：

```
TOKEN=你的Discord机器人Token
CLIENT_ID=你的Application Client ID
```

## 本地运行

```bash
npm install
npm start
```

## Railway 部署

1. 推送本仓库到 GitHub
2. 在 [Railway](https://railway.com/dashboard) 新建项目 → Deploy from GitHub repo
3. 选择本仓库
4. 在 Variables 中添加 `TOKEN` 和 `CLIENT_ID`
5. 部署完成后在 Discord 运行 `/一键设置`

## 斜杠命令

- `/一键设置` — 自动创建频道、角色和权限
- `/发布频道规则` — 发布或更新规则
- `/发布验证面板` — 发布或更新验证按钮