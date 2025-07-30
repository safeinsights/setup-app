# Use the official R image from the Rocker project
FROM r-base:4.5.1 as base



ARG USER=docker
ENV HOME=/home/$USER

# Install system dependencies required for R packages
RUN apt-get update && apt-get install  --no-install-recommends -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libpq-dev \
    && apt-get clean


# Install required R packages
# This step took 15mins to build...
RUN R -e "install.packages(c('httr', 'jsonlite', 'future', 'RPostgres', 'readr',  'arrow', 'paws', 'furrr', 'dplyr'), repos='https://cran.rstudio.com/')"


RUN mkdir $HOME/project

WORKDIR $HOME/project

FROM base as research-container

USER $USER
COPY --chown=$USER:$USER ./main.r $HOME/project

CMD ["Rscript", "main.r"]
