FROM node:20-alpine

WORKDIR /code

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

CMD ["npx", "tsx", "src/scripts/poll.ts"]
