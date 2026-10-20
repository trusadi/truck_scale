FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN groupadd --system app && useradd --system --gid app --home /app app \
  && mkdir -p /app/data && chown -R app:app /app
USER app

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/app.db
EXPOSE 3001

CMD ["npm", "run", "start"]
