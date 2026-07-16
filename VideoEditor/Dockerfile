# Ad Assembler (video editor pipeline + intake form)
# ffmpeg for all media work; fonts-liberation + fontconfig so the karaoke .ass burn
# (which asks for Arial) resolves to the metric-compatible Liberation Sans on Linux.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-liberation fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# pre-download the whisper model into the image so the first job never waits on HuggingFace
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"

COPY app.py .
COPY scripts/ scripts/
COPY docs/ docs/

ENV PYTHONUNBUFFERED=1
EXPOSE 5000
CMD ["python", "app.py"]
