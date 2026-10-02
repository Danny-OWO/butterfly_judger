FROM python:3.13-slim

RUN useradd --create-home --uid 10001 runner

USER runner
WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONUNBUFFERED=1

CMD ["python", "-I", "/workspace/main.py"]
