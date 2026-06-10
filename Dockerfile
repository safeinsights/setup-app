FROM node:22-alpine

RUN corepack enable

ARG USER=node
ENV HOME=/home/$USER

USER $USER
WORKDIR $HOME/code

COPY --chown=$USER:$USER package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY --chown=$USER:$USER . .

CMD ["pnpm", "exec", "tsx", "src/scripts/poll.ts"]
