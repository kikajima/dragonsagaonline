FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm test && npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache git

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev\nRUN npm audit --omit=dev --audit-level=high

COPY --from=build /app/dist ./dist

EXPOSE 2567

CMD ["npm", "start"]
