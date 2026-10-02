# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build -- --base=/frontend/

FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev \
        libonig-dev \
        libsqlite3-dev \
        libzip-dev \
    && docker-php-ext-install intl mbstring pdo_mysql pdo_sqlite zip \
    && a2enmod rewrite \
    && sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:8080>/' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html/public>\n    AllowOverride All\n    Require all granted\n</Directory>\n' \
        > /etc/apache2/conf-available/laravel.conf \
    && a2enconf laravel \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY backend/ ./
RUN --mount=type=secret,id=composer_auth,target=/root/.composer/auth.json,required=false \
    composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && touch database/database.sqlite \
    && chown -R www-data:www-data storage bootstrap/cache database/database.sqlite

COPY --from=frontend-build /app/dist/ public/frontend/

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr

EXPOSE 8080

CMD ["sh", "-c", "php artisan migrate --force && exec apache2-foreground"]
