FROM python:3.10-slim

# Set working directory
WORKDIR /code

# System libs needed by OpenCV / MediaPipe on slim images
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for Docker caching
COPY ./Backend/requirements.txt /code/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the backend files
COPY ./Backend /code/Backend

# Phase II: bake the MediaPipe hair-segmentation model into the image
# (if this download fails the API still runs, using the threshold fallback)
RUN python -c "import urllib.request as u; u.urlretrieve('https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite', '/code/Backend/models/hair_segmenter.tflite')" || echo "hair model download failed - fallback mode"

# Expose the mandatory Hugging Face port 7860
EXPOSE 7860

# Run the FastAPI server
CMD ["uvicorn", "Backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
