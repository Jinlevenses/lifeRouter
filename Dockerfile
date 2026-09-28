FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --no-optional && pnpm build
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
