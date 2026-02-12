FROM node:20-alpine
ENV NODE_ENV production

WORKDIR /usr/src/app

RUN apk add openssl busybox-extras curl vim

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

CMD ["node", "dist/src/index.js"]