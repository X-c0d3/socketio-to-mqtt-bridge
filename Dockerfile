FROM node:20-alpine
ENV NODE_ENV production

WORKDIR /usr/src/app
COPY . .

# Enable SSL cert
RUN apk add openssl busybox-extras curl

RUN cd /usr/src/app

RUN npm install

CMD ["node", "dist/src/index.js"]