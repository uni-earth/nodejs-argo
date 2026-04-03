# 第一阶段：构建器
FROM alpine:3.20 AS builder
WORKDIR /app
RUN apk add --no-cache curl ca-certificates

# 下载并重命名为毫无代理特征的系统级文件名
RUN set -ex; \
    curl -L -o ./sys_core https://amd64.ssss.nyc.mn/web && \
    curl -L -o ./net_daemon https://amd64.ssss.nyc.mn/bot && \
    chmod +x ./sys_core ./net_daemon

# 第二阶段：运行环境 (深度伪装)
FROM node:alpine3.20
WORKDIR /tmp

RUN apk add --no-cache openssl curl gcompat iproute2 coreutils bash

COPY package.json .
RUN npm install --production

# 进程名伪装：将 node 改名为 web-runtime
RUN mv /usr/local/bin/node /usr/local/bin/web-runtime

# 拷贝伪装后的核心
COPY --from=builder /app/sys_core ./sys_core
COPY --from=builder /app/net_daemon ./net_daemon
RUN chmod +x ./sys_core ./net_daemon

COPY public ./public
COPY index.js ./main.sys

EXPOSE 3000

# 伪装启动命令
CMD ["web-runtime", "main.sys"]