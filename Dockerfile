FROM node:18
WORKDIR /app/src

COPY package.json ./
RUN npm i

COPY . .
RUN node runserver.js

EXPOSE 8080
CMD ["npm", "start"]