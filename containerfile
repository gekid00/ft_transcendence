FROM docker.io/library/node:24-alpine3.24 AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM builder AS build-server
RUN pnpm --filter=server --prod deploy --legacy /prod/server
RUN cp -r apps/server/dist /prod/server/dist

FROM builder AS build-web
RUN pnpm --filter=web --prod deploy --legacy /prod/web
RUN cp -r apps/web/dist /prod/web/dist

FROM node:24-alpine3.24 AS prod-server
RUN apk add --no-cache dumb-init
WORKDIR /app/server
COPY --from=build-server /prod/server ./
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/src/index.js"]

FROM node:24-alpine3.24 AS prod-web
RUN apk add --no-cache dumb-init
WORKDIR /app/web
COPY --from=build-web /prod/web ./
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server/entry.mjs"]