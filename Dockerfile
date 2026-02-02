FROM node:18.2.0-alpine
ENV NODE_ENV production

WORKDIR /usr/src/app
COPY [".env", "/usr/src/app"]
COPY ["bridge.js", "/usr/src/app"]
COPY . .

# Enable SSL cert
RUN apk add openssl busybox-extras curl

RUN cd /usr/src/app

RUN npm install

CMD [ "node", "bridge.js" ]