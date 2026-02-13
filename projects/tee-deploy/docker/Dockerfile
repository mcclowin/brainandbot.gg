FROM node:22-slim

# Install openclaw + pnpm once at build time
RUN npm install -g openclaw@latest pnpm && \
    npm cache clean --force

# Create openclaw directory structure
RUN mkdir -p /app/.openclaw/agents/main/agent /app/.openclaw/workspace

# Set working directory
WORKDIR /app

# Environment
ENV OPENCLAW_HOME=/app/.openclaw
ENV NODE_ENV=production

# Init script copies configs and starts gateway
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
