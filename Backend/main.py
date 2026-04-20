import io
import os
import json
import traceback
import numpy as np
import onnxruntime as ort
import google.generativeai as genai
from PIL import Image
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Constants & Config

ONNX_PATH = "models/stage_classifier.onnx"
NUM_CLASSES = 7

STAGE_LABELS = {
    0: "Stage 1 - No Hair Loss",
    1: "Stage 2 - Slight Recession",
    2: "Stage 3 - Visible Thinning",
    3: "Stage 4 - Significant Loss",
    4: "Stage 5 - Severe Loss",
    5: "Stage 6 - Very Severe",
    6: "Stage 7 - Extreme Baldness"
}

# Hardcoded zone density scores per predicted stage.
# Each zone has a density score from 0.0 (complete loss) to 1.0 (fully healthy).
STAGE_ZONE_SCORES = {
    0: {"frontal": 1.00, "crown": 1.00, "temporal_left": 1.00, "temporal_right": 1.00, "vertex": 1.00, "occipital": 1.00},
    1: {"frontal": 0.70, "crown": 0.80, "temporal_left": 0.85, "temporal_right": 0.85, "vertex": 0.75, "occipital": 0.95},
    2: {"frontal": 0.15, "crown": 0.20, "temporal_left": 0.55, "temporal_right": 0.50, "vertex": 0.30, "occipital": 0.90},
    3: {"frontal": 0.10, "crown": 0.15, "temporal_left": 0.40, "temporal_right": 0.40, "vertex": 0.20, "occipital": 0.80},
    4: {"frontal": 0.05, "crown": 0.10, "temporal_left": 0.25, "temporal_right": 0.25, "vertex": 0.10, "occipital": 0.60},
    5: {"frontal": 0.02, "crown": 0.05, "temporal_left": 0.15, "temporal_right": 0.15, "vertex": 0.05, "occipital": 0.40},
    6: {"frontal": 0.00, "crown": 0.00, "temporal_left": 0.05, "temporal_right": 0.05, "vertex": 0.00, "occipital": 0.20},
}

app = FastAPI(title="Hair Loss Stage Classifier API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session = ort.InferenceSession(ONNX_PATH)
input_name = session.get_inputs()[0].name


# Gemini client helper — initialise once

def get_gemini_model(model_name="gemini-2.5-flash"):
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_API_KEY not configured. Add it to .env or your hosting environment variables."
        )
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(model_name)


# Models to try in order — gemini-2.5-flash is working with your quota
FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-lite",
]


def call_gemini_with_retry(model, content, generation_config, max_retries=2):
    """Call Gemini with automatic model fallback on 429 rate-limit errors."""
    import time

    api_key = os.environ.get("GOOGLE_API_KEY")

    for model_name in FALLBACK_MODELS:
        current_model = genai.GenerativeModel(model_name)
        for attempt in range(max_retries):
            try:
                print(f"[Gemini] Trying {model_name} (attempt {attempt+1})...")
                return current_model.generate_content(content, generation_config=generation_config)
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    if attempt < max_retries - 1:
                        wait = (attempt + 1) * 3
                        print(f"[Gemini] Rate limited on {model_name}. Retrying in {wait}s...")
                        time.sleep(wait)
                    else:
                        print(f"[Gemini] {model_name} exhausted. Trying next model...")
                        break  # try next model
                else:
                    raise

    raise HTTPException(status_code=429, detail="All Gemini models are rate-limited. Please wait 1 minute and try again.")


# Image Preprocessing (for ONNX model)

def preprocess_image(image: Image.Image) -> np.ndarray:
    image = image.resize((224, 224))
    img_data = np.array(image).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_data = (img_data - mean) / std
    img_data = np.transpose(img_data, (2, 0, 1))
    img_data = np.expand_dims(img_data, axis=0)
    return img_data.astype(np.float32)


def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=1)


# POST /predict/ — Original single-image ONNX endpoint (unchanged)

@app.post("/predict/")
async def predict_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    input_tensor = preprocess_image(image)
    outputs = session.run(None, {input_name: input_tensor})
    logits = outputs[0]

    probabilities = softmax(logits)
    predicted_class = np.argmax(probabilities, axis=1)[0]
    confidence = probabilities[0][predicted_class] * 100

    return {
        "predicted_stage": STAGE_LABELS[predicted_class],
        "confidence": f"{confidence:.1f}%",
        "zones": STAGE_ZONE_SCORES[predicted_class],
        "stage_index": int(predicted_class)
    }


# ═══════════════════════════════════════════════════════════════════
# POST /predict-3d/ — Multi-angle Gemini Vision analysis
#
# Accepts up to 4 images (anterior, lateral, vertex, posterior).
# Uses Google Gemini 1.5 Flash (FREE tier) to analyze per-zone
# hair density and return a heatmap-ready JSON payload.
# ═══════════════════════════════════════════════════════════════════

GEMINI_3D_PROMPT = """You are an expert trichologist performing a clinical scalp hair density analysis.

You have been provided with up to 4 scalp photographs from different angles:
- Image 1: Anterior (Front view)
- Image 2: Lateral (Side view)
- Image 3: Vertex/Crown (Top-down view)
- Image 4: Posterior (Back view)

Analyze each image carefully and estimate the hair density score for each of the following scalp zones.
A score of 0.0 means complete baldness / no visible hair. A score of 1.0 means fully dense, healthy hair coverage.

You MUST respond with ONLY a valid raw JSON object (no markdown, no explanation, no code fences). Use exactly this structure:

{
  "zones": {
    "frontal": <float 0.0-1.0>,
    "temporal_left": <float 0.0-1.0>,
    "temporal_right": <float 0.0-1.0>,
    "mid_scalp": <float 0.0-1.0>,
    "vertex": <float 0.0-1.0>,
    "occipital": <float 0.0-1.0>
  },
  "predicted_stage": "<string, e.g. Stage 3 - Visible Thinning>",
  "stage_index": <integer 0-6>,
  "confidence": "<string, e.g. 87.4%>",
  "summary": "<one sentence clinical summary>"
}

Stage mapping reference:
0 = Stage 1 - No Hair Loss
1 = Stage 2 - Slight Recession
2 = Stage 3 - Visible Thinning
3 = Stage 4 - Significant Loss
4 = Stage 5 - Severe Loss
5 = Stage 6 - Very Severe
6 = Stage 7 - Extreme Baldness

Be precise and clinically accurate. Do NOT include any text outside the JSON object."""


@app.post("/predict-3d/")
async def predict_3d(
    anterior: Optional[UploadFile] = File(None),
    lateral: Optional[UploadFile] = File(None),
    vertex: Optional[UploadFile] = File(None),
    posterior: Optional[UploadFile] = File(None),
    cnn_stage: Optional[str] = Form(None),
):
    model = get_gemini_model()

    # Collect provided images with their angle labels
    image_slots = [
        ("Anterior (Front)", anterior),
        ("Lateral (Side)", lateral),
        ("Vertex/Crown (Top)", vertex),
        ("Posterior (Back)", posterior),
    ]

    # At least one image is required
    provided = [(label, f) for label, f in image_slots if f is not None]
    if not provided:
        raise HTTPException(status_code=422, detail="At least one image must be provided.")

    # Build the content list for Gemini Vision: text prompt + PIL images
    prompt_text = GEMINI_3D_PROMPT
    if cnn_stage:
        prompt_text += f"\n\nCRITICAL CLINICAL CONTEXT: The patient has already been diagnosed by a specialized ResNet CNN model as: [{cnn_stage}]. You MUST use this stage as the absolute ground truth. Do not hallucinate a different stage. Map the zone densities to realistically reflect a patient at {cnn_stage}."

    content_parts = [prompt_text]

    for label, upload_file in provided:
        raw_bytes = await upload_file.read()
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        # Resize to 512px wide to reduce token usage while preserving quality
        w, h = pil_image.size
        if w > 512:
            ratio = 512 / w
            pil_image = pil_image.resize((512, int(h * ratio)), Image.LANCZOS)
        content_parts.append(f"\n[{label}]")
        content_parts.append(pil_image)

    try:
        response = call_gemini_with_retry(
            model,
            content_parts,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,
                response_mime_type="application/json",
            ),
        )

        raw_text = response.text.strip()
        print(f"[Gemini] Raw response ({len(raw_text)} chars): {raw_text[:500]}")

        # Extract only the JSON part in case Gemini surrounds it with text or markdown
        start_idx = raw_text.find("{")
        end_idx = raw_text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            raw_text = raw_text[start_idx:end_idx+1]

        # Fix common JSON issues from LLMs
        import re
        # Remove trailing commas before } or ]
        raw_text = re.sub(r',\s*([}\]])', r'\1', raw_text)

        try:
            analysis = json.loads(raw_text)
        except json.JSONDecodeError:
            # Last resort: try to extract zone values with regex
            print(f"[Gemini] JSON parse failed, attempting regex extraction...")
            print(f"[Gemini] Problematic text: {raw_text[:300]}")
            analysis = {
                "predicted_stage": "Unknown",
                "stage_index": 3,
                "confidence": "N/A",
                "summary": "Analysis completed but response format was unexpected.",
                "zones": {}
            }
            # Try to extract zone scores from malformed JSON
            for zone_name in ["frontal", "crown", "temporal_left", "temporal_right", "vertex", "occipital"]:
                match = re.search(rf'"{zone_name}"\s*:\s*([\d.]+)', raw_text)
                if match:
                    analysis["zones"][zone_name] = float(match.group(1))
            # Try to extract other fields
            stage_match = re.search(r'"predicted_stage"\s*:\s*"([^"]*)"', raw_text)
            if stage_match:
                analysis["predicted_stage"] = stage_match.group(1)
            conf_match = re.search(r'"confidence"\s*:\s*"([^"]*)"', raw_text)
            if conf_match:
                analysis["confidence"] = conf_match.group(1)
            summary_match = re.search(r'"summary"\s*:\s*"([^"]*)"', raw_text)
            if summary_match:
                analysis["summary"] = summary_match.group(1)

        # Validate required zones exist; fill missing ones with 0.5 as fallback
        required_zones = ["frontal", "temporal_left", "temporal_right", "mid_scalp", "vertex", "occipital"]
        zones = analysis.get("zones", {})
        for zone in required_zones:
            if zone not in zones:
                zones[zone] = 0.5
        analysis["zones"] = zones

        return {
            "predicted_stage": analysis.get("predicted_stage", "Unknown"),
            "stage_index": analysis.get("stage_index", 3),
            "confidence": analysis.get("confidence", "N/A"),
            "summary": analysis.get("summary", ""),
            "zones": zones,
            "analysis_mode": "gemini_vision_multi_angle",
        }

    except json.JSONDecodeError as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Gemini returned invalid JSON. Please retry.")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gemini Vision error: {str(e)}")


# Pydantic models for /analyse/full/ endpoint
# ═══════════════════════════════════════════════════════════════════

class MetadataModel(BaseModel):
    # Section 1: Basics & Heritage
    age: Optional[int] = None
    family_history: Optional[str] = None        # mothers, fathers, both, neither
    when_started: Optional[str] = None           # <6mo, 6-12mo, 1-2yrs, 2yrs+
    loss_speed: Optional[str] = None             # rapid, gradual, stable

    # Section 2: Current Hair Status
    main_area: Optional[str] = None              # hairline, crown, all-over, patches
    daily_loss: Optional[str] = None             # <50, 50-100, 100-200, 200+
    scalp_feel: Optional[list] = None            # [itchy, burning, red, dandruff, none]
    body_hair: Optional[str] = None              # more, less, no_change

    # Section 3: Health & Medical
    conditions: Optional[list] = None            # [thyroid, anemia, autoimmune, infection, none]
    recent_illness: Optional[bool] = None
    medications: Optional[list] = None           # [blood_thinners, antidepressants, steroids, none]
    sudden_weight_loss: Optional[bool] = None

    # Section 4: Lifestyle Habits
    stress_level: Optional[int] = None           # 1-10
    sleep: Optional[str] = None                  # <5hrs, 5-7hrs, 7-9hrs
    smoking: Optional[str] = None                # never, occasional, regular
    alcohol: Optional[str] = None                # never, occasionally, regularly
    work_environment: Optional[str] = None       # pollution, chemicals, outdoor, indoor

    # Section 5: Diet & Nutrition
    diet: Optional[str] = None                   # balanced, vegetarian, high_protein, keto, fasting
    water_intake: Optional[str] = None           # <1L, 1-2L, 2-3L, 3L+
    supplements: Optional[list] = None           # [biotin, iron, vitd, zinc, multi, none]

    # Section 6: Hair Care Routine
    chemical_treatments: Optional[str] = None    # never, rarely, monthly
    heat_styling: Optional[str] = None           # daily, weekly, never
    tight_styles: Optional[bool] = None
    washing_frequency: Optional[str] = None      # daily, 2-3x, once

class FullAnalysisRequest(BaseModel):
    stage_index: int
    predicted_stage: str
    confidence: str
    zones: dict
    metadata: MetadataModel


# ═══════════════════════════════════════════════════════════════════
# GET /test-groq/ — Quick debug endpoint to test Groq connection
# Visit http://localhost:8000/test-groq/ in your browser
# ═══════════════════════════════════════════════════════════════════

@app.get("/test-groq/")
async def test_groq():
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        return {"status": "FAIL", "error": "GROQ_API_KEY not found in environment"}
    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        chat = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Say hello in 5 words"}],
            max_tokens=50,
        )
        return {"status": "OK", "response": chat.choices[0].message.content, "key_prefix": groq_key[:8] + "..."}
    except Exception as e:
        traceback.print_exc()
        return {"status": "FAIL", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# POST /analyse/full/ — Groq-powered deep lifestyle analysis
#
# Uses Groq's ultra-fast inference with Llama 3.3 70B.
# IMPORTANT: Set GROQ_API_KEY in .env or your hosting environment.
# ═══════════════════════════════════════════════════════════════════

@app.post("/analyse/full/")
async def analyse_full(request: FullAnalysisRequest):
    try:
        groq_key = os.environ.get("GROQ_API_KEY")
        print(f"[Groq] API key found: {bool(groq_key)}")

        if not groq_key:
            raise HTTPException(
                status_code=500,
                detail="GROQ_API_KEY not configured. Add it to .env or your hosting environment variables."
            )

        from groq import Groq
        client = Groq(api_key=groq_key)

        # Helper to format optional fields
        def fmt(val, suffix=''):
            if val is None:
                return 'Not provided'
            if isinstance(val, bool):
                return 'Yes' if val else 'No'
            if isinstance(val, list):
                if not val:
                    return 'Not provided'
                return ', '.join(str(v) for v in val)
            return f'{val}{suffix}'

        m = request.metadata

        user_prompt = f"""Patient Hair Loss Analysis Data:

Stage: {request.predicted_stage} (index {request.stage_index}/6)
Confidence: {request.confidence}

Scalp Zone Density Scores (0.0 = complete loss, 1.0 = fully healthy):
- Frontal: {request.zones.get('frontal', 'N/A')}
- Crown: {request.zones.get('crown', 'N/A')}
- Temporal Left: {request.zones.get('temporal_left', 'N/A')}
- Temporal Right: {request.zones.get('temporal_right', 'N/A')}
- Vertex: {request.zones.get('vertex', 'N/A')}
- Occipital: {request.zones.get('occipital', 'N/A')}

=== LIFESTYLE QUESTIONNAIRE (fields marked "Not provided" were skipped) ===

BASICS & HERITAGE:
- Age: {fmt(m.age)}
- Family History of Hair Loss: {fmt(m.family_history)}
- When Thinning Started: {fmt(m.when_started)}
- Speed of Loss: {fmt(m.loss_speed)}

CURRENT HAIR STATUS:
- Main Thinning Area: {fmt(m.main_area)}
- Approx. Daily Hair Loss: {fmt(m.daily_loss)}
- Scalp Irritations: {fmt(m.scalp_feel)}
- Body Hair Changes: {fmt(m.body_hair)}

HEALTH & MEDICAL:
- Diagnosed Conditions: {fmt(m.conditions)}
- Recent Severe Illness/Fever: {fmt(m.recent_illness)}
- Long-term Medications: {fmt(m.medications)}
- Sudden Weight Loss >5kg: {fmt(m.sudden_weight_loss)}

LIFESTYLE HABITS:
- Stress Level (last 6 months): {fmt(m.stress_level, '/10')}
- Average Sleep: {fmt(m.sleep)}
- Smoking: {fmt(m.smoking)}
- Alcohol: {fmt(m.alcohol)}
- Work Environment: {fmt(m.work_environment)}

DIET & NUTRITION:
- Primary Diet: {fmt(m.diet)}
- Daily Water Intake: {fmt(m.water_intake)}
- Supplements: {fmt(m.supplements)}

HAIR CARE ROUTINE:
- Chemical Treatments (bleach/dye): {fmt(m.chemical_treatments)}
- Heat Styling: {fmt(m.heat_styling)}
- Tight Hairstyles (hats/buns): {fmt(m.tight_styles)}
- Shampoo Frequency: {fmt(m.washing_frequency)}

For any fields marked "Not provided", base your analysis on the available data and the hair loss stage.
Respond ONLY with a valid JSON object — no preamble, no explanation, no markdown code fences. Just raw JSON.

Use these exact keys:
- "primary_causes": array of strings (2-4 most likely causes based on ALL data)
- "contributing_factors": array of strings (2-4 lifestyle/medical factors)
- "risk_level": "low" or "medium" or "high"
- "is_reversible": boolean
- "recommendations": array of objects with "category" and "action" keys (at least 5 recommendations across different categories)
- "should_see_doctor": boolean
- "doctor_reason": string (empty if should_see_doctor is false)
- "prognosis": string (one sentence)"""

        system_prompt = (
            "You are a clinical trichologist AI assistant. "
            "Analyse the patient's hair loss stage and comprehensive lifestyle data. "
            "Use ALL available data points to provide the most accurate and personalised analysis. "
            "Respond ONLY with a valid JSON object — no preamble, no explanation, "
            "no markdown code fences. Just raw JSON."
        )

        print("[Groq] Calling Groq API...")
        chat_completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )

        raw_text = chat_completion.choices[0].message.content.strip()
        print(f"[Groq] Raw response ({len(raw_text)} chars): {raw_text[:200]}")

        # Strip markdown fences if present (safety net)
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        analysis = json.loads(raw_text)

        return {
            "analysis": analysis,
            "zones": request.zones
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Groq] ERROR: {type(e).__name__}: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Groq analysis failed: {str(e)}")