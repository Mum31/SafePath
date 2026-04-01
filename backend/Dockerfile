FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    postgis \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

RUN pip install gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "safe_path_api.wsgi:application"]
