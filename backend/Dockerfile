FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Приложение работает не от root: при взломе процесса злоумышленник не получит права на контейнер.
# Entrypoint выставляет владельца папок данных и сразу сбрасывает права до пользователя app
RUN useradd --uid 1000 --create-home --shell /usr/sbin/nologin app \
    && mkdir -p logs data \
    && chown -R app:app /app \
    && sed -i 's/\r$//' docker-entrypoint.sh \
    && chmod 755 docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:8000/ || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# --proxy-headers: настоящий IP клиента берётся из заголовков nginx (нужно для защиты от подбора пароля).
# Порт 8000 наружу не публикуется — до бэкенда можно достучаться только через nginx
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
