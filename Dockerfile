FROM python:3.10-slim

# Set working directory
WORKDIR /code

# Copy requirements first for Docker caching
COPY ./Backend/requirements.txt /code/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the backend files
COPY ./Backend /code/Backend

# Expose the mandatory Hugging Face port 7860
EXPOSE 7860

# Run the FastAPI server
CMD ["uvicorn", "Backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
