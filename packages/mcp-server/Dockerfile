FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install only production deps (MCP SDK)
RUN npm install --omit=dev

# Copy built dist
COPY dist/ ./dist/

# History stored at a path that can be volume-mounted
ENV ANGULAR_GRAB_HISTORY_PATH=/data/history.json
ENV ANGULAR_GRAB_PORT=3456

EXPOSE 3456

ENTRYPOINT ["node", "dist/index.js"]
