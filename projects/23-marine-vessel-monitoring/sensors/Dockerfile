FROM python:3.12-slim

WORKDIR /app

COPY sensor.py .

STOPSIGNAL SIGTERM

CMD ["python", "sensor.py"]
