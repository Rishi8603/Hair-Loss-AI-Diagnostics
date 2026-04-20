# 🧠 Soft-KEBOT — AI Hair Fall Stage Classifier

<div align="center">

![Python](https://img.shields.io/badge/Python-3.10-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-ResNet50-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-ONNX-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-Expo-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![CUDA](https://img.shields.io/badge/CUDA-11.8-76B900?style=for-the-badge&logo=nvidia&logoColor=white)

**A software-only AI system for clinical hair fall stage analysis — powered by deep learning, served via FastAPI, and delivered through a React Native mobile app.**

*Phase 1 Complete · Phase 2 In Development*

</div>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Demo](#-demo)
- [Project Architecture](#-project-architecture)
- [Tech Stack](#-tech-stack)
- [Dataset](#-dataset)
- [Model Details](#-model-details)
- [Results](#-results)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Reference](#-api-reference)
- [Roadmap — Phase 2](#-roadmap--phase-2)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔍 Overview

**Soft-KEBOT** is a software-only adaptation of the KEBOT robotic hair transplant analysis system. Instead of relying on a $30,000+ robotic arm, it uses a **USB dermatoscope** + **deep learning** to classify hair fall stages based on the **Norwood-Hamilton Scale**.

The system takes a scalp image as input and outputs a predicted hair fall stage (1–7) with a confidence percentage — accessible from any smartphone via a clean mobile app.

> 💡 **Key innovation:** Algorithm-based scale calibration instead of expensive hardware positioning.

---

## 🎬 Demo

```
📸  User selects scalp image
        ↓
🔬  Image sent to FastAPI backend (POST /predict/)
        ↓
⚙️  ResNet50 model runs ONNX inference
        ↓
📊  Returns: { "predicted_stage": "Stage 3 - Visible Thinning", "confidence": "91.4%" }
        ↓
📱  Result displayed on mobile screen
```

---

## 🏗️ Project Architecture

```
┌─────────────────────────────────────────────────────┐
│                  SOFT-KEBOT SYSTEM                  │
├────────────────────┬────────────────────────────────┤
│   MOBILE APP       │        BACKEND SERVER           │
│  React Native      │  FastAPI + ONNX Runtime         │
│  (Expo)            │  (Python 3.10)                  │
│                    │                                 │
│  expo-image-picker │  POST /predict/                 │
│  multipart/form    │  ↓ Preprocess image             │
│  → POST request    │  ↓ ONNX Inference               │
│  ← JSON response   │  ↓ Softmax → argmax             │
│                    │  ↓ Return stage + confidence    │
└────────────────────┴────────────────────────────────┘
              Deployed on: Render.com
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **ML Framework** | PyTorch 2.x + torchvision |
| **Model** | ResNet50 (fine-tuned, ImageNet pretrained) |
| **Inference** | ONNX Runtime (edge-optimized) |
| **Backend** | FastAPI + Uvicorn |
| **Frontend** | React Native (Expo SDK 55) |
| **Image Picker** | expo-image-picker |
| **Training Hardware** | NVIDIA RTX 3050 Laptop GPU (CUDA 11.8) |
| **Deployment** | Render.com (Backend) |

---

## 📦 Dataset

- **Source:** [Norwood-Hamilton Scale Dataset — Roboflow](https://roboflow.com)
- **Total Images:** ~7,000
- **Classes:** 7 (Stage 1 through Stage 7)
- **Split:**

| Split | Count |
|---|---|
| Train | ~6,000+ |
| Validation | ~700 |
| Test | ~300 |

**Data Augmentation** (training set only):

- Horizontal & Vertical Flip
- Random Rotation ±30°
- Color Jitter (Brightness, Contrast, Saturation = 0.4)
- Random Grayscale (p = 0.1)

**Normalization:** ImageNet statistics — `μ = [0.485, 0.456, 0.406]`, `σ = [0.229, 0.224, 0.225]`

---

## 🧬 Model Details

### Architecture

```
ResNet50 (ImageNet Pretrained)
    │
    ├── Early layers frozen (all params except last 20)
    │
    └── Custom FC Head:
          Dropout(0.5) → Linear(2048 → 7)
```

### Training Configuration

| Hyperparameter | Value |
|---|---|
| Optimizer | Adam (lr = 0.0001) |
| Loss Function | CrossEntropyLoss |
| Scheduler | ReduceLROnPlateau (patience=5, factor=0.5) |
| Batch Size | 32 |
| Epochs | 50 |
| Image Size | 224 × 224 px |

### Inference Pipeline

```python
image → resize(224×224) → normalize → transpose(H,W,C→C,H,W)
      → ONNX session → logits ∈ ℝ⁷ → Softmax → argmax → Stage Label
```

---

## 📊 Results

| Metric | Value |
|---|---|
| **Best Validation Accuracy** | **87.55%** |
| Train Accuracy | 98.51% |
| Classes | 7 (Stage 1 – Stage 7) |
| Model Format | `.pth` → exported to `.onnx` |

> The model is not included in this repository due to file size. Training scripts are provided — run `train_stage.py` to reproduce the weights.

---

## 📁 Project Structure

```
Hair-Loss-Stage-Classifier/
│
├── Backend/
│   ├── main.py               # FastAPI app — /predict/ endpoint
│   └── requirements.txt      # Python dependencies
│
├── Frontend/
│   └── HairLossApp/
│       ├── App.js            # Main React Native screen
│       ├── index.js          # Expo entry point
│       ├── app.json          # Expo config (Android/iOS)
│       ├── eas.json          # EAS Build config
│       └── package.json      # Node dependencies
│
├── src/                      # (local — not in repo)
│   ├── train_stage.py        # Model training script
│   └── test_stage.py         # Model evaluation script
│
└── models/                   # (local — not in repo)
    ├── stage_classifier.pth  # Saved PyTorch weights
    └── stage_classifier.onnx # ONNX export for deployment
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Expo CLI
- (Optional) NVIDIA GPU with CUDA 11.8 for training

---

### Backend Setup

```bash
# 1. Clone the repo
git clone https://github.com/abhay-rawat90/Hair-Loss-Stage-Classifier.git
cd Hair-Loss-Stage-Classifier/Backend

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your ONNX model
mkdir -p models
# Place stage_classifier.onnx inside models/

# 5. Start the server
uvicorn main:app --reload
```

The API will be live at `http://localhost:8000`

---

### Frontend Setup

```bash
# 1. Navigate to the app directory
cd Frontend/HairLossApp

# 2. Install dependencies
npm install

# 3. Update the API URL in App.js
# Change API_URL to point to your backend (local or deployed)
const API_URL = "http://YOUR_IP:8000/predict/";

# 4. Start Expo
npx expo start

# Scan the QR code with Expo Go app on your phone
```

---

### Training the Model (Optional)

```bash
# GPU setup (CUDA 11.8)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Run training
cd src/
python train_stage.py
# Saves best model to models/stage_classifier.pth

# Export to ONNX
python -c "
import torch
import torchvision.models as models

model = models.resnet50()
model.fc = torch.nn.Sequential(
    torch.nn.Dropout(0.5),
    torch.nn.Linear(2048, 7)
)
model.load_state_dict(torch.load('models/stage_classifier.pth'))
model.eval()

dummy = torch.randn(1, 3, 224, 224)
torch.onnx.export(model, dummy, 'models/stage_classifier.onnx')
print('Exported successfully.')
"
```

---

## 📡 API Reference

### `POST /predict/`

Accepts a scalp image and returns the predicted Norwood-Hamilton stage.

**Request:**

```http
POST /predict/
Content-Type: multipart/form-data

file: <image file>
```

**Response:**

```json
{
  "predicted_stage": "Stage 3 - Visible Thinning",
  "confidence": "91.4%"
}
```

**Stage Labels:**

| Class | Label |
|---|---|
| 0 | Stage 1 — No Hair Loss |
| 1 | Stage 2 — Slight Recession |
| 2 | Stage 3 — Visible Thinning |
| 3 | Stage 4 — Significant Loss |
| 4 | Stage 5 — Severe Loss |
| 5 | Stage 6 — Very Severe |
| 6 | Stage 7 — Extreme Baldness |

---

## 🗺️ Roadmap — Phase 2

Phase 2 will integrate with a **portable dermatoscope briefcase system** running AI on a **Raspberry Pi 4**.

```
Phase 2 Pipeline:
───────────────────────────────────────────────────
  YOLOv8        →  Follicle detection
                   (follicle_1, follicle_2, follicle_3)
                   + bounding boxes + confidence scores

  U-Net         →  Scalp zone segmentation
                   (Frontal, Mid-scalp, Vertex, Temporal)
                   + pixel-wise density heatmap

  CV Formula    →  Coverage Value calculation
                   CV = Density × Thickness(μm) × HPG
                   Output: 0.0 – 1.0 per zone

  PDF Report    →  Auto-generated clinical report
                   Stage + Zone Map + Follicle Count
                   Coverage Score + Recommendations
───────────────────────────────────────────────────
  Hardware: Raspberry Pi 4 (4GB RAM)
  Camera:   50× / 200× Dermatoscope Lens
  Runtime:  ONNX Runtime (Edge Inference)
  Display:  9" Built-in Screen + Mobile App
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get involved:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please open an issue first if you're planning a major change.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ as a Final Year Deep Learning Project**

*Soft-KEBOT — Bridging AI and Clinical Hair Analysis*

</div>
