# 移动端 Docker 部署（构建模式）

本目录用于在开发 / 测试机上用 Docker Compose **从源码构建并运行**移动端
`fruits_ana_mobile`（单 Nginx 容器）：`http://127.0.0.1:54001`。

移动端是纯静态前端，无后端、无数据库、无环境变量；接口通过容器内 Nginx 把
`/api/` 反向代理到宿主机 `127.0.0.1:8000` 的**用户端后端**（`fruits_ana` 仓库
`deploy/docker/` 部署，见 ADR-052 桌面 / 移动分流）。

面向最终用户的离线镜像部署包见 `images/`（`部署手册-移动端.md`）。

## 前置条件

- Linux 宿主机已安装 Docker Engine 与 Compose v2。
- **用户端 `fruits_ana` 后端已在宿主机 8000 端口运行**（移动端登录、看板等接口
  全部来自它；未启动时页面可打开但接口 502/超时）。
- 宿主机端口 `54001` 未被占用。

## 构建并启动

```bash
cd deploy/docker
docker compose build
docker compose up -d
```

构建走 npmmirror npm 源，适配境内网络。

## 验证

```bash
curl -I http://127.0.0.1:54001/
curl http://127.0.0.1:54001/api/auth/me   # 未登录应返回后端 401 JSON，证明代理链路通
docker compose ps
```

## 常用运维

```bash
docker compose logs -f
docker compose restart
docker compose down
```

无数据持久化目录：容器不含任何业务数据，`down` 后重建即可。
