FROM node:24-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY . .

EXPOSE 8000

CMD ["node", "src/index.js"]
