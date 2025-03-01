FROM node:18
WORKDIR /app/src
VOLUME /app/nwotdata

COPY package.json ./
RUN npm i

COPY . .
RUN node runserver.js

RUN chown -R node:node /app

EXPOSE 8080
USER node
CMD ["npm", "start"]
