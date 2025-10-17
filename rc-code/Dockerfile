# Use the SafeInsights R 4.5.1 base image
FROM harbor.safeinsights.org/safeinsights-public/base-container:r4.5.1-2025-09-19-15-47-18

RUN apt-get update && apt-get install -y \
    nano \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY longRC.r ./code/longRC.r

CMD ["Rscript", "./code/longRC.r"]
