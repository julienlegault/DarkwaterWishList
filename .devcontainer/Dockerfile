FROM node:22-bookworm AS node
FROM composer:2 AS composer
FROM php:8.5-cli-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git libicu-dev libonig-dev libsqlite3-dev libzip-dev unzip \
    && docker-php-ext-install intl mbstring pdo_sqlite zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=composer /usr/bin/composer /usr/local/bin/composer

RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && useradd --create-home --shell /bin/bash vscode
USER vscode
