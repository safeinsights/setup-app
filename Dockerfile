FROM node:22-alpine

ARG USER=node
ENV HOME /home/$USER

USER $USER
WORKDIR $HOME/code

COPY --chown=$USER:$USER package.json .
COPY --chown=$USER:$USER package-lock.json .

RUN npm install

COPY --chown=$USER:$USER . .

CMD ["npx", "tsx", "src/scripts/poll.ts"]
