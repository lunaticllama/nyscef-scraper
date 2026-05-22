FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY . .

ENV RENDER=true

CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--timeout", "60", "app:app"]
