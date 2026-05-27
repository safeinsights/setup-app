FROM node:22-alpine

ARG USER=node
ENV HOME /home/$USER

USER $USER
WORKDIR $HOME/code

RUN corepack enable

COPY --chown=$USER:$USER package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY --chown=$USER:$USER . .

CMD ["pnpm", "exec", "tsx", "src/scripts/poll.ts"]
