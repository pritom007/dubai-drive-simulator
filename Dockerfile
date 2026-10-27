FROM node:20-alpine

WORKDIR /app

COPY . .

ENV HOST=0.0.0.0
ENV PORT=4177

EXPOSE 4177

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4177/healthz >/dev/null || exit 1

USER node

CMD ["npm", "start"]
