FROM node:22-alpine

WORKDIR /app

# Create an unprivileged user and pre-create the data volume with correct ownership.
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /data \
    && chown -R app:app /app /data

# Copy package files (lockfile-first when available keeps installs reproducible)
COPY --chown=app:app package.json ./
COPY --chown=app:app package-lock.json* ./

# Install only production deps (MCP SDK). `npm ci` when a lockfile exists,
# fall back to `npm install` otherwise.
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --omit=dev --ignore-scripts; \
    fi

# Copy built dist
COPY --chown=app:app dist/ ./dist/

# History stored at a path that can be volume-mounted
ENV ANGULAR_GRAB_HISTORY_PATH=/data/history.json
ENV ANGULAR_GRAB_PORT=3456
# Inside the container we must bind to all interfaces; host deployments stay on loopback.
ENV ANGULAR_GRAB_HOST=0.0.0.0

EXPOSE 3456

USER app

ENTRYPOINT ["node", "dist/index.js"]
