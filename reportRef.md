# Soft-KEBOT: AI-Based Hair Fall Stage Classifier

## A Software-Only Approach to Clinical Hair Loss Analysis

## Using Deep Learning and Mobile Application Deployment

## Final Year Project Report

```
Submitted in partial fulfillment of the requirements for the
Degree of Bachelor of Engineering
```
```
Submitted by:
```
## Abhay Rawat

```
Guide:
```
## [Name of Guide]

```
[Designation, Department]
```
```
Department of Computer Engineering
[Name of Institute]
[Affiliated University]
```
```
Academic Year: 2024–
```

## Abstract

Hair loss is a widespread clinical condition that affects millions of people globally. Accurate
and early-stage classification of hair fall is important because it helps determine whether a
person requires medical intervention or hair transplantation. Existing clinical systems that
perform such analysis rely on expensive robotic hardware, making them inaccessible in most
hospital and clinic settings.

This project proposes Soft-KEBOT, a software-only alternative to the KEBOT robotic hair
transplant analysis system. Instead of using a six-axis robotic arm costing over thirty thousand
US dollars, this system uses a standard scalp image (captured using a USB dermatoscope or
any camera) and classifies the hair fall stage using a deep learning model. The classification
follows the Norwood-Hamilton Scale, which categorises hair loss from Stage 1 (no hair loss)
through Stage 7 (extreme baldness).

The core model is a fine-tuned ResNet50 convolutional neural network, trained on approxi-
mately seven thousand labelled scalp images. The trained model is exported to the ONNX
format and served through a FastAPI backend. A React Native mobile application provides
the user interface, allowing any patient to upload a scalp photograph and receive an instant
classification result with a confidence percentage.

The system achieved a best validation accuracy of 87.55% across seven classes. Phase 2 of the
project plans to extend the system with YOLOv8-based follicle detection, U-Net scalp zone
segmentation, and edge deployment on a Raspberry Pi 4.


## Contents



## List of Figures

3.1 Block Diagram of the Soft-KEBOT System................... 16


## List of Tables

- Abstract
- 1 Introduction
   - 1.1 Overview
   - 1.2 Motivation
   - 1.3 Theory
      - 1.3.1 Norwood-Hamilton Scale
      - 1.3.2 Convolutional Neural Networks
      - 1.3.3 ResNet50 Architecture
      - 1.3.4 Transfer Learning
      - 1.3.5 ONNX Runtime
   - 1.4 Organisation of Report
- 2 Literature Survey
   - 2.1 Overview
   - 2.2 Literature Survey
      - 2.2.1 Early Automated Trichology Tools
      - 2.2.2 The KEBOT System
      - 2.2.3 Comparative Study: Manual vs. AI-Based Coverage Value Calculation
      - 2.2.4 Hair Follicle Classification and Severity Estimation Using Mask R-CNN
      - 2.2.5 YOLO-OHFD: Oriented Bounding Box Detection
      - 2.2.6 HFD-NET: Real-Time Detection for Surgical Robotics
      - 2.2.7 Hair-YOLO
      - 2.2.8 GAN-Based Postoperative Prediction
      - 2.2.9 PRECISE Scale and Mathematical Surgical Planning
      - 2.2.10 Robotic Platforms: ARTAS and HARRTS
      - 2.2.11 Summary of Related Works
   - 2.3 Research Gap and Summary of Literature Survey
   - 2.4 Objectives of the Project
- 3 Soft-KEBOT: System Design and Implementation
   - 3.1 Overview
   - 3.2 Model and System Explanation
      - 3.2.1 Block Diagram
      - 3.2.2 System Architecture Summary Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier
   - 3.3 Explanation Block-Wise
      - 3.3.1 Dataset
      - 3.3.2 Data Preprocessing and Augmentation
      - 3.3.3 Model Architecture
      - 3.3.4 Training Configuration
      - 3.3.5 ONNX Export and Inference
      - 3.3.6 FastAPI Backend
      - 3.3.7 Mobile Application
   - 3.4 Ablation Study
   - 3.5 Results
- 4 Summary and Future Work
   - 4.1 Summary of Work Done
   - 4.2 Future Plan (Phase 2)
- 2.1 Summary of Related Works
- 3.1 Dataset Split
- 3.2 Training Hyperparameters
- 3.3 Stage Labels Returned by the API
- 3.4 Ablation Study Summary
- 3.5 Final Model Performance
- 4.1 Phase 2 Component Summary


### Chapter 1

## Introduction

### 1.1 Overview

Hair loss, medically referred to as alopecia, is one of the most common dermatological prob-
lems encountered in clinical practice. The most prevalent form is Androgenetic Alopecia
(AGA), which affects both men and women, though it is especially common among men above
the age of thirty. The condition is characterised by progressive thinning of hair follicles, which
eventually leads to visible baldness in a patterned manner across the scalp.

Clinically, the extent of hair loss in male patients is described using the Norwood-Hamilton
Scale, a seven-stage classification system. Stage 1 represents a normal hairline with no visible
loss, while Stage 7 represents the most severe form where only a narrow band of hair remains
on the sides and back of the scalp. Correct identification of the stage is important because
it directly determines the course of treatment. For mild stages, medication or non-surgical
therapies may be sufficient. For advanced stages, Follicular Unit Extraction (FUE) based hair
transplantation is typically recommended.

The challenge in current clinical workflows is that accurate stage classification depends on
the subjective assessment of the dermatologist or trichologist. Different clinicians may assign
different stages to the same patient, leading to inconsistent treatment recommendations. This
inter-observer variability is a recognised problem in the medical literature.

Soft-KEBOT addresses this problem by introducing an objective, automated classification sys-
tem. The system takes a scalp photograph as input and uses a trained deep convolutional neural
network to assign one of the seven Norwood-Hamilton stages. The result is delivered to the
user through a simple mobile application within a few seconds.

### 1.2 Motivation

The primary motivation for this project comes from the high cost and limited accessibility of
existing AI-based hair analysis systems. The original KEBOT system, developed by Erdo-
gan, Acun, and colleagues in 2020, is one of the most advanced clinical hair analysis systems
available. It uses a six-axis collaborative robotic arm, a high-resolution RGB camera, and a


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

bi-telecentric lens to capture highly standardised scalp images. Deep learning models are then
applied to these images to detect follicular units, measure hair shaft thickness, and calculate the
Coverage Value for surgical planning.

While the KEBOT system produces extremely accurate results, the hardware alone costs over
thirty thousand US dollars. This makes it completely out of reach for small clinics, rural hos-
pitals, or patients in developing countries who need affordable diagnosis.

The second motivation comes from the observation that the classification task itself, separating
seven stages of hair loss from a scalp image, is well-suited to modern image classification
techniques. Convolutional neural networks have demonstrated excellent performance on far
more complex visual recognition problems, and a publicly available labelled dataset for the
Norwood-Hamilton Scale makes the training feasible.

The third motivation is practical deployment. There is currently no widely available mobile
application that provides reliable hair fall stage classification. Developing such an application
would make basic hair loss assessment available to any person with a smartphone, without
requiring a clinic visit.

### 1.3 Theory

#### 1.3.1 Norwood-Hamilton Scale

The Norwood-Hamilton Scale was introduced by James Hamilton in 1951 and later revised by
O’Tar Norwood in 1975. It remains the most widely used classification system for male pattern
baldness. The scale has seven primary stages:

- Stage 1: No significant hair loss or recession.
- Stage 2: Slight recession at the temples. Hair loss is barely noticeable.
- Stage 3: Deeper recession at both temples. This is generally considered the earliest stage of
    cosmetically significant hair loss.
- Stage 4: Severe temple recession and thinning on the top of the scalp. A band of hair still
    separates the front and top from the back.
- Stage 5: The band separating front and back becomes very narrow and sparse.
- Stage 6: The band completely disappears. The temple and crown regions merge into a single
    bald area.
- Stage 7: The most severe stage. Only a narrow horseshoe-shaped band of hair remains on
    the sides and back of the scalp.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

#### 1.3.2 Convolutional Neural Networks

A Convolutional Neural Network (CNN) is a type of deep learning model specifically designed
for image data. It applies a series of convolutional filters to extract spatial features such as
edges, textures, and shapes from the input image. These feature maps are progressively ab-
stracted through multiple layers, allowing the network to recognise complex visual patterns.

For image classification tasks, the final convolutional feature maps are flattened and passed
through fully connected layers, which produce a probability distribution over the possible out-
put classes. The class with the highest probability is chosen as the predicted label.

#### 1.3.3 ResNet50 Architecture

ResNet50 is a fifty-layer deep CNN introduced by He et al. in 2015. The key innovation in
ResNet is the residual connection, also known as a skip connection. In a standard CNN, the
output of each layer is simply the result of applying a convolution, batch normalisation, and
activation to the previous layer’s output. In a ResNet block, the input to the block is added
directly to its output before the final activation.

This residual connection solves the vanishing gradient problem that typically prevents very
deep networks from training effectively. With skip connections, gradients can flow directly
backward through the network during training, enabling the model to learn from very deep
architectures without degradation.

ResNet50 pre-trained on the ImageNet dataset provides a strong feature extraction backbone.
When fine-tuned on a domain-specific dataset such as scalp images, the model adapts its learned
representations to the new classification task while retaining the general visual knowledge ac-
quired during pretraining.

#### 1.3.4 Transfer Learning

Transfer learning is the practice of taking a model trained on one large dataset and reusing its
learned weights as the starting point for training on a smaller, different dataset. In this project,
the ResNet50 model was initialised with weights from ImageNet training. The early and middle
layers of the network, which extract general features like edges and textures, were frozen. Only
the last twenty parameters and a newly added fully connected head were trained on the hair loss
dataset. This approach reduces the amount of data required for training and generally leads to
faster convergence and better performance.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

#### 1.3.5 ONNX Runtime

Open Neural Network Exchange (ONNX) is an open standard format for representing trained
machine learning models. Once a PyTorch model is trained and exported to ONNX format, it
can be run using ONNX Runtime, a cross-platform inference engine that is significantly more
efficient than loading the full PyTorch framework. This is especially beneficial for deployment
on servers where inference speed and resource consumption are important.

### 1.4 Organisation of Report

The remainder of this report is organised as follows:

Chapter 2 presents a review of existing literature related to hair fall classification, deep learning
methods applied to scalp analysis, and clinical AI systems for hair transplantation. The chapter
also identifies the research gap that motivated this project and states the specific objectives.

Chapter 3 describes the complete system developed in this project. It includes a block diagram
of the overall architecture, a detailed explanation of each component, ablation study results, and
final performance results.

Chapter 4 summarises the work completed so far and outlines the planned future work for
Phase 2 of the project.


### Chapter 2

## Literature Survey

### 2.1 Overview

The problem of automated hair and scalp analysis using image processing and machine learning
has been studied from multiple angles over the past two decades. The body of work spans
from early image-processing-based tools used in trichology clinics, to modern deep learning
systems capable of detecting individual follicular units with sub-millimeter precision. This
chapter reviews the most relevant work across these areas, summarises the key gaps in the
existing literature, and then states the specific objectives this project aims to address.

### 2.2 Literature Survey

#### 2.2.1 Early Automated Trichology Tools

Before the advent of deep learning, trichologists used specialised hardware-software combi-
nations to analyse the scalp. TrichoScan was one of the earliest such tools. It required the
clinician to shave a small patch of scalp, dye the hair with a contrast agent, and capture an
epiluminescence microscopy image. Computer vision algorithms then counted the hairs and
estimated the ratio of hairs in the anagen (growth) phase to those in the telogen (resting) phase.

Later systems such as Folliscope and Hairmetrix improved on TrichoScan by removing the
need for shaving and dyeing. These tools used proprietary algorithms to directly analyse im-
ages of untrimmed hair, estimating density, hair shaft calibre, and the terminal-to-vellus ratio.
However, all of these tools only analysed a small, isolated patch of the scalp. They were not
capable of mapping the entire donor or recipient region, which is necessary for pre-operative
surgical planning.

#### 2.2.2 The KEBOT System

The most significant reference work for this project is the KEBOT system, introduced by Er-
dogan, Acun, and colleagues in 2020. KEBOT is the first system to automate comprehensive
whole-scalp mapping for FUE hair transplantation. The system hardware consists of a six-axis


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

collaborative robotic arm, an active infrared depth camera, an 18-megapixel RGB sensor, and
a bi-telecentric lens.

The robotic arm first sweeps the patient’s head using the depth camera to build a 3D coordinate
map of the cranial surface. It then generates a path that positions the RGB camera exactly 10
cm away from and perpendicular to the scalp surface at each image capture point, eliminating
perspective distortion. Hundreds of high-resolution images are automatically captured across
the entire scalp.

On the software side, KEBOT uses a RetinaNet object detection model with a ResNet-
backbone to detect and classify follicular units by the number of hairs they contain. A SegNet
encoder-decoder network with a VGG16 backbone performs pixel-wise segmentation of hair
shafts to measure their thickness. The measured thickness is converted to physical dimensions
using the Camera Pixel Physical Resolution constant derived from the telecentric lens prop-
erties. Validation against Scanning Electron Microscopy measurements showed a maximum
deviation of less than five percent.

Using these measurements, KEBOT computes the Coverage Value (CV) as:

##### CV =

##### 

##### FU

```
cm^2
```
##### 

```
× Calculated Density× Average Diameter (2.1)
```
This Coverage Value is used to determine the maximum number of grafts that can be safely
harvested from the donor area without causing visible cosmetic damage.

## 2.2.3 Comparative Study: Manual vs. AI-Based Coverage Value Calcu-

## lation

Garg and Garg (2024) conducted a clinical comparative study involving ten patients. The study
compared manually calculated Coverage Values with values calculated by the KEBOT AI sys-
tem across five anatomical zones of the Safe Donor Area. The AI system computed coverage
values that were, on average, 1.68 times higher than manual estimates. Correspondingly, the
safe excision density was revised from 33 grafts per square centimetre (manual) to 38 grafts
per square centimetre (AI), enabling a 13.3 percent increase in the total number of harvestable
grafts. This study established that AI-based analysis not only matches but surpasses the accu-
racy of experienced clinicians in donor area assessment.

#### 2.2.4 Hair Follicle Classification and Severity Estimation Using Mask R-CNN

Researchers in 2022 presented a framework using Mask R-CNN for classifying individual fol-
licular regions and estimating hair loss severity. The model classified each detected follicle into


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

one of three clinical states: healthy, normal, or severe. A Local Hair Loss Severity Index was
computed per region as:

```
Pk= normalize
```
(^3)
X
i=
nki(αi+ β)

##### !

##### (2.2)

where αitakes values 1.5, 1.0, and 0.5 for healthy, normal, and severe follicles respectively,
and β accounts for regional density. The scalp was divided into 12 sub-regions, and the local
indices were aggregated into a global severity score visualised as a heatmap. This approach
improved classification accuracy by 15 percent compared to using ResNet-101 alone, which
achieved only 79.3 percent accuracy on the test set.

#### 2.2.5 YOLO-OHFD: Oriented Bounding Box Detection

Standard object detection models use horizontal bounding boxes aligned with the image axes.
When applied to hair follicles, which are elongated, diagonal structures, these bounding boxes
enclose large regions of irrelevant background pixels. In dense scalp images, this causes errors
in Non-Maximum Suppression, where valid detections are incorrectly discarded.

YOLO-OHFD, introduced in March 2025, addresses this by using Oriented Bounding Boxes
(OBB) with an additional angle parameter. Three key innovations distinguish this model: the
ECA-Res2Block for channel-wise feature attention, a Feature Alignment Module that adjusts
convolution sampling points based on follicle orientation, and angle classification using an En-
hanced Intersection over Union loss. By providing the precise angle of each hair shaft relative
to the scalp surface, YOLO-OHFD directly supplies trajectory data to robotic extraction tools,
reducing transection rates during automated surgery.

#### 2.2.6 HFD-NET: Real-Time Detection for Surgical Robotics

Zhang, Tong, and colleagues released HFD-NET in 2025, targeting the latency constraints
of live robotic systems. The model achieves 67.1% mAP@0.5, outperforming YOLOv11 by
5.5 percentage points, while adding only 0.1 million additional parameters. Three architectural
components drive this: the CSRFConv module for spatial-channel feature fusion, the C3k2IBC
inverted bottleneck for small-object detection, and ADown downsampling that preserves fine
edge gradients during spatial reduction. HFD-NET is designed for scalp environments with
weak visual features such as miniaturised vellus hairs or intraoperative bleeding.

#### 2.2.7 Hair-YOLO

Hair-YOLO, based on the YOLOv8 architecture, was developed specifically for hair follicle
detection in robotic transplantation. It demonstrated a 14.26 percent improvement in mAP over


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

standard YOLOv8 through customised neck and head modifications tuned for the micro-scale
features of follicular structures.

#### 2.2.8 GAN-Based Postoperative Prediction

Hwang, Choi, and Shin (2021) introduced a GAN-based Region of Interest image transla-
tion model for visualising predicted postoperative results in hair transplantation. Standard
CycleGAN-based models processed the entire image globally and frequently generated arte-
facts outside the target area. The proposed method decoupled segmentation from generation:
an ensemble of U-Net, Linknet, and Feature Pyramid Networks masked the surgical region,
while a CycleGAN generated hair growth only within this mask. The result had a Structural
Similarity Index of 0.998 and a Frechet Inception Distance of 1.011, producing visualisations ́
nearly indistinguishable from actual postoperative photographs.

#### 2.2.9 PRECISE Scale and Mathematical Surgical Planning

The PRECISE (Precise Scalp Area Count Scale) system was developed to replace the Norwood-
Hamilton qualitative scale with a quantitative framework for surgical planning. The classifica-
tion is computed as:

```
PRECISE Classification =
```
##### 

```
Relative Bald Area
30
```
##### 

```
+ Temple Score (2.3)
```
For every one point on this scale, 1500 follicular units are recommended for transplantation,
at a standard density of 50 follicular units per square centimetre. This purely metric-based
approach eliminates the ambiguity that arises from using qualitative stage labels to estimate
graft requirements.

#### 2.2.10 Robotic Platforms: ARTAS and HARRTS

The ARTAS robotic system uses a seven-axis KUKA arm with a stereoscopic vision array
for automated follicular extraction. An AI-driven graft selection algorithm in the 9x plat-
form preferentially targets multi-hair follicular units, increasing the average hairs per extraction
from 2.22 to 2.60 in clinical trials on 24 patients. The HARRTS FUEsion X 5.0 represents a
newer hybrid paradigm: a five-degree-of-freedom robotic arm combined with augmented re-
ality glasses that overlay real-time analytical data into the surgeon’s field of view, preserving
human judgement while eliminating the ergonomic strain of extended microscopy.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

```
Table 2.1: Summary of Related Works
```
```
Paper / System Year Approach Key Result
KEBOT (Erdo-
gan et al.)
```
```
2020 RetinaNet + SegNet +
6-axis robot
```
```
Sub-5% thickness
error vs SEM
Garg & Garg 2024 AI vs manual CV calcu-
lation
```
```
1.68× higher cover-
age value
Mask R-CNN
Severity
```
```
2022 Instance segmentation
+ severity index
```
```
15% accuracy gain
over ResNet
YOLO-OHFD 2025 Oriented bounding
boxes
```
```
Precise follicle angle
for robotics
HFD-NET 2025 Lightweight real-time
detector
```
```
67.1% mAP@0.5,
outperforms
YOLOv
Hair-YOLO 2024 YOLOv8 modification +14.26% mAP vs
baseline
GAN-ROI
(Hwang et al.)
```
```
2021 CycleGAN with
masked ROI
```
##### SSIM = 0.998, FID

##### = 1.

```
ARTAS 9x 2022 7-axis robot + AI selec-
tion
```
```
2.22 to 2.60 hairs per
attempt
```
#### 2.2.11 Summary of Related Works

### 2.3 Research Gap and Summary of Literature Survey

The review of existing literature reveals that most advanced AI systems for hair analysis are
tightly coupled with expensive hardware. The KEBOT system, while clinically excellent, re-
quires a robotic arm and specialised optics. The ARTAS and HARRTS platforms are equally
inaccessible for everyday clinical use. At the lower end, tools like TrichoScan and Folliscope
require physical sample preparation and do not classify hair loss stage automatically.

From a software perspective, most deep learning models in this domain are designed for specific
sub-tasks: object detection of follicular units, segmentation of scalp zones, or postoperative
visualisation. There is no lightweight, end-to-end system that takes a raw scalp photograph and
directly outputs a clinical stage classification through a mobile interface.

The specific gaps identified are:

1. There is no affordable, hardware-independent clinical tool for Norwood-Hamilton stage
    classification.
2. Existing classification studies (such as the Mask R-CNN severity framework) focus on


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

```
follicle-level analysis, not stage-level classification from a full scalp image.
```
3. No publicly available mobile application exists that provides stage classification with
    confidence scoring.
4. The use of ResNet-based transfer learning for direct seven-class hair fall stage classifica-
    tion has not been systematically studied with ONNX deployment for mobile use.

### 2.4 Objectives of the Project

Based on the identified research gaps, the following objectives were set for this project:

1. To build a deep learning model capable of classifying scalp images into seven Norwood-
    Hamilton stages with high accuracy.
2. To fine-tune a pre-trained ResNet50 model on a publicly available labelled scalp image
    dataset using appropriate data augmentation.
3. To export the trained model to the ONNX format for efficient inference deployment.
4. To develop a FastAPI-based backend that accepts scalp images and returns stage predic-
    tions with confidence scores.
5. To develop a React Native mobile application that connects to the backend and provides
    a simple user interface for capturing or uploading scalp images.
6. To validate the system end-to-end and report performance metrics including classification
    accuracy.
7. To design a Phase 2 roadmap that extends the system with follicle detection, scalp zone
    segmentation, and edge AI deployment.


### Chapter 3

## Soft-KEBOT: System Design and Implementation

### 3.1 Overview

This chapter describes the complete system developed as part of this project. The system,
named Soft-KEBOT, is a software-only pipeline for hair fall stage classification. It consists of
three main components: a deep learning model trained offline, a server-side inference backend,
and a mobile application for end users. The chapter first presents a block diagram of the entire
system, then explains each component in detail, followed by an ablation study and final results.

### 3.2 Model and System Explanation

#### 3.2.1 Block Diagram

Figure 3.1 presents the block diagram of the Soft-KEBOT system, showing the flow from image
input to final stage prediction displayed on the mobile screen.

```
Mobile Client Backend Server (Render.com)
```
```
Inference & Response
```
```
Scalp Image(Camera / Gallery)
```
```
React NativeMobile App
```
```
HTTP POST(multipart/form-data)
```
```
FastAPI(/predict/)
```
```
PreprocessingResize→ Normalize
```
```
ONNX Runtime(ResNet50) SoftmaxLogits→ Probabilities
```
```
ArgmaxStage Label
```
```
JSON ResponseStage + Confidence
```
```
Display Resulton Mobile Screen
```
```
Figure 3.1: Block Diagram of the Soft-KEBOT System
```
## 3.2.2 System Architecture Summary

The system is divided into two logical sides. On the client side, the mobile application allows
the user to either capture a scalp photograph using the phone camera or select an existing


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

image from the gallery. The image is then sent to the backend server as a multipart HTTP
POST request.

On the server side, FastAPI receives the image and passes it through a preprocessing pipeline
before running inference using the ONNX model. The output logits are converted to probabil-
ities using Softmax, and the class with the highest probability is mapped to the corresponding
Norwood-Hamilton stage label. The response is returned as a JSON object containing the stage
name and confidence percentage, which the mobile application then displays.

### 3.3 Explanation Block-Wise

#### 3.3.1 Dataset

The dataset used for this project is the Norwood-Hamilton Scale Dataset sourced from Roboflow.
It contains approximately 7,000 scalp images labelled across seven classes, corresponding to
Stage 1 through Stage 7 of the Norwood-Hamilton Scale. The data was split into training (ap-
proximately 6,000 images), validation (approximately 700 images), and test (approximately
300 images) sets.

```
Table 3.1: Dataset Split
```
```
Split Number of Images
Training ∼6,
Validation ∼ 700
Test ∼ 300
Total ∼7,
```
#### 3.3.2 Data Preprocessing and Augmentation

All images were resized to 224×224 pixels before being fed to the model. Normalisation was
applied using the ImageNet channel statistics: mean μ = [0. 485 , 0. 456 , 0 .406] and standard
deviation σ = [0. 229 , 0. 224 , 0 .225] for the RGB channels respectively.

Data augmentation was applied only to the training set to improve generalisation and reduce
overfitting. The augmentation transforms included:

- Horizontal and vertical flipping
- Random rotation within± 30 ◦
- Colour jitter with brightness, contrast, and saturation factors of 0.
- Random grayscale conversion with probability 0.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

No augmentation was applied to the validation or test sets. This ensures that validation accuracy
reflects real-world inference conditions.

#### 3.3.3 Model Architecture

The base model used is ResNet50, a fifty-layer deep residual network pre-trained on the Ima-
geNet dataset. The key component of a ResNet block is the skip connection, which adds the
input directly to the output of the convolutional layers:

```
y =F(x, {Wi}) +x (3.1)
```
wherex is the input to the block, F(x,{Wi}) represents the residual mapping learned by the
stacked convolutional layers, andy is the output. This formulation ensures that gradients can
flow directly through the skip path during backpropagation, enabling training of very deep
networks without degradation.

For this project, all parameters of ResNet50 except the last twenty were frozen. The original
classification head (1000-class output) was replaced with a custom head:

```
Head: Dropout(0.5) → Linear(2048→ 7) (3.2)
```
The Dropout layer with a probability of 0.5 was added to prevent overfitting during fine-tuning.
The final Linear layer produces seven output logits, one for each Norwood-Hamilton stage.

#### 3.3.4 Training Configuration

The model was trained on an NVIDIA RTX 3050 Laptop GPU using CUDA 11.8. The training
hyperparameters are listed in Table 3.2.

```
Table 3.2: Training Hyperparameters
```
```
Hyperparameter Value
Optimizer Adam
Learning Rate 0.
Loss Function Cross-Entropy Loss
LR Scheduler ReduceLROnPlateau (patience=5, factor=0.5)
Batch Size 32
Number of Epochs 50
Input Image Size 224 × 224 pixels
```
The Adam optimiser was chosen for its adaptive learning rate properties, which generally leads
to faster convergence on image classification tasks. Cross-Entropy Loss is the standard loss


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

function for multi-class classification. The ReduceLROnPlateau scheduler reduces the learning
rate by a factor of 0.5 when the validation loss fails to improve for five consecutive epochs,
helping the model converge to a better optimum.

#### 3.3.5 ONNX Export and Inference

After training, the best model checkpoint (saved based on validation accuracy) was exported to
the ONNX format. ONNX export requires passing a dummy input tensor of the correct shape
through the model and tracing the computation graph:

dummy = torch.randn(1, 3, 224, 224)
torch.onnx.export(model, dummy, ’stage_classifier.onnx’)

During inference, the ONNX Runtime session loads the model file once at server startup. For
each incoming image, the preprocessing pipeline performs the following operations in order:

```
Input Image→ Resize(224× 224)→ Normalize→ Transpose(H,W,C → C,H,W) (3.3)
```
The transposed array is passed to the ONNX session, which returns seven raw logit values.
Softmax is applied to convert these to probabilities, and Argmax selects the predicted class
index:

```
Pi= e
```
```
zi
P 7
j=1ezj
```
```
, ˆ = arg maxy i Pi (3.4)
```
#### 3.3.6 FastAPI Backend

The backend is a single FastAPI application with one endpoint: POST /predict/. The
endpoint accepts a multipart form-data request containing the image file. The image is read
into memory using Python’s io.BytesIO, processed through the preprocessing pipeline, and
passed to the ONNX inference function. The response is a JSON object:

{
"predicted_stage": "Stage 3 - Visible Thinning",
"confidence": "91.4%"
}

The server is run using Uvicorn and deployed on Render.com, which provides a free-tier hosting
service for Python web applications.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

#### 3.3.7 Mobile Application

The frontend is a React Native application built with Expo SDK 55. The main screen presents
two options to the user: take a photo using the device camera or choose an image from the
gallery. Both are handled through the expo-image-picker library.

Once an image is selected, the application sends it to the backend using a multipart HTTP POST
request via the fetch API. The response JSON is parsed and the predicted stage name and
confidence percentage are displayed on screen. The API base URL is configurable in App.js
to support both local development and deployed server environments.

```
Table 3.3: Stage Labels Returned by the API
```
```
Class Index Stage Label
0 Stage 1 — No Hair Loss
1 Stage 2 — Slight Recession
2 Stage 3 — Visible Thinning
3 Stage 4 — Significant Loss
4 Stage 5 — Severe Loss
5 Stage 6 — Very Severe
6 Stage 7 — Extreme Baldness
```
### 3.4 Ablation Study

To understand the contribution of different design choices, the following variations were stud-
ied during development:

Experiment 1 — No Frozen Layers (Full Fine-Tuning): Training all layers of ResNet50
from scratch on the hair loss dataset resulted in significant overfitting. Validation accuracy
reached only 71% while training accuracy exceeded 99%. This confirmed that freezing early
layers is necessary given the limited dataset size.

Experiment 2 — No Dropout: Removing the Dropout(0.5) layer from the classification head
increased overfitting, reducing the validation accuracy by approximately 3 to 4 percentage
points. This showed that Dropout plays an important role in regularisation for this task.

Experiment 3 — No Data Augmentation: Training without augmentation resulted in a drop
of approximately 5 percentage points in validation accuracy, confirming that the augmentation
pipeline helps the model generalise across different lighting conditions and camera angles.

Experiment 4 — Different Base Models: A brief comparison with MobileNetV2 was made.
While MobileNetV2 was faster in inference, its validation accuracy was approximately 6 points
lower than ResNet50. Given that accuracy was the primary concern for a medical application,
ResNet50 was retained.


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

Experiment 5 — Chosen Configuration (ResNet50 + Frozen Layers + Dropout + Augmen-
tation): This configuration produced the best validation accuracy of 87.55% and was selected
as the final model.

```
Table 3.4: Ablation Study Summary
```
```
Configuration Validation Accuracy (%)
Full fine-tuning, no frozen layers ∼71.0
Frozen layers, no Dropout ∼83.5
Frozen layers, no Augmentation ∼82.3
MobileNetV2 (full config) ∼81.4
ResNet50 (final config) 87.55
```
### 3.5 Results

The final trained model achieved the results summarised in Table 3.5. The training accuracy of
98.51% and validation accuracy of 87.55% show that while there is some degree of overfitting,
the model generalises well across the seven-class problem. The gap between training and
validation accuracy is expected given the relatively small dataset size and the visual similarity
between adjacent stages on the Norwood-Hamilton Scale.

```
Table 3.5: Final Model Performance
```
```
Metric Value
Training Accuracy 98.51%
Best Validation Accuracy 87.55%
Number of Classes 7
Model Format (Deployment) ONNX
Inference Endpoint POST /predict/
Average Inference Time (server) < 200 ms
```
The end-to-end system was tested manually on multiple scalp images. The mobile application
correctly returned stage predictions with confidence scores above 85% for images with good
lighting and clear scalp visibility. For images with poor lighting or motion blur, confidence
scores were lower, indicating that image quality is an important factor.


### Chapter 4

## Summary and Future Work

### 4.1 Summary of Work Done

This project set out to build an affordable, software-based alternative to expensive clinical hair
loss analysis systems. The following work was completed during Phase 1:

A labelled dataset of approximately 7,000 scalp images was collected from Roboflow and or-
ganised into training, validation, and test splits. A comprehensive data augmentation pipeline
was designed to improve model generalisation.

A ResNet50 convolutional neural network, pre-trained on ImageNet, was fine-tuned on the
hair loss dataset. The final twenty layers were made trainable while the earlier layers were
frozen. A custom classification head with Dropout regularisation was added to produce seven-
class output. The model was trained for 50 epochs using the Adam optimiser with a reducing
learning rate schedule, achieving a best validation accuracy of 87.55%.

The trained model was exported to the ONNX format for efficient deployment. A FastAPI-
based REST API was developed that accepts scalp images as multipart form uploads and returns
the predicted Norwood-Hamilton stage along with a confidence score. The server was deployed
on Render.com.

A React Native mobile application was developed using Expo SDK 55. The application allows
users to select or capture a scalp image and sends it to the backend API. The prediction result is
displayed on the screen. The application was tested on both Android and iOS using Expo Go.

An ablation study was conducted to validate the importance of transfer learning, dropout regu-
larisation, and data augmentation to the final model performance.

### 4.2 Future Plan (Phase 2)

Phase 2 of the project aims to move from stage classification to a more comprehensive clinical
analysis system, deployable on portable hardware. The planned work is as follows:

Follicle Detection using YOLOv8: A YOLOv8 object detection model will be trained to
detect individual hair follicles within a dermatoscope image. Each detected follicle will be


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

categorised into groups of one, two, or three hairs, similar to the approach used in the KEBOT
system. Bounding boxes and confidence scores will be provided for each detected follicular
unit.

Scalp Zone Segmentation using U-Net: A U-Net semantic segmentation model will be trained
to divide the scalp image into anatomical zones: frontal, mid-scalp, vertex, and temporal
regions. This will allow per-zone analysis of hair density and provide a pixel-wise density
heatmap.

Coverage Value Calculation: Using the follicle count from YOLOv8 and the zone areas from
U-Net, the Coverage Value formula will be implemented:

```
CV = Density× Thickness(μm)× Hair Per Group (4.1)
```
A score between 0.0 and 1.0 will be calculated per zone, giving the clinician a quantitative
estimate of donor capacity.

PDF Report Generation: An automated clinical report will be generated for each patient
session. The report will include the classified stage, the scalp zone map, follicle count per
zone, the computed Coverage Value, and personalised treatment recommendations.

Edge Deployment on Raspberry Pi 4: The complete inference pipeline will be optimised and
deployed on a Raspberry Pi 4 (4 GB RAM) using ONNX Runtime for edge inference. The
device will be housed in a portable briefcase along with a 50× / 200× USB dermatoscope, a
9-inch display, and a battery pack. This will create a self-contained, portable clinical device
that requires no internet connection, making it suitable for remote clinics.

Integration of PRECISE Scale: The Phase 2 system will incorporate the PRECISE classifi-
cation formula to estimate surgical graft requirements from the computed bald area and zone
analysis. This will provide pre-operative planning information alongside the diagnostic output.

The Phase 2 pipeline is summarised below:


Final Year Project Report Soft-KEBOT: AI Hair Fall Stage Classifier

```
Table 4.1: Phase 2 Component Summary
```
```
Component Model / Tool Output
Follicle Detec-
tion
```
```
YOLOv8 Bounding boxes, follicle
count per zone
Zone Segmenta-
tion
```
```
U-Net Pixel-wise scalp zone map,
density heatmap
Coverage Value CV Formula Score 0.0–1.0 per anatomical
zone
Report Genera-
tion
```
```
Python (ReportLab) Auto-generated PDF clinical
report
Hardware Plat-
form
```
```
Raspberry Pi 4 Edge inference, no internet
required
```

## Bibliography

```
[1] Erdogan, K., Acun, C., et al. (2020). KEBOT: An Artificial Intelligence Based Compre-
hensive Analysis System for FUE Based Hair Transplantation. ResearchGate / ISHRS.
[2] Garg, A. K., and Garg, S. (2024). Comparative Study: Manual vs. AI-Based KE-Bot
System for Hair Coverage Value Calculation to Prevent Overharvesting. Hair Transplant
Forum International, ISHRS.
[3] Anonymous (2022). Hair Follicle Classification and Hair Loss Severity Estimation Using
Mask R-CNN. MDPI Applied Sciences.
[4] (2025). YOLO-OHFD: A YOLO-Based Oriented Hair Follicle Detection Method for
Robotic Hair Transplantation. MDPI Applied Sciences, Vol. 15, Issue 6.
[5] Zhang, Y., Tong, X., et al. (2025). HFD-NET: A real-time deep learning-based visual
algorithm with weak feature enhancement for hair follicle detection. ResearchGate.
[6] (2024). Hair-YOLO: A hair follicle detection model based on YOLOv8. R Discovery /
ResearchGate.
[7] Hwang, S., Choi, J., Shin, H., et al. (2021). GAN-Based ROI Image Translation Method
for Predicting Image after Hair Transplantation. MDPI.
[8] (n.d.). PRECISE Scale: A Quantitative Classification for Androgenetic Alopecia. PubMed
Central.
[9] He, K., Zhang, X., Ren, S., and Sun, J. (2015). Deep Residual Learning for Image Recog-
nition. arXiv:1512.03385.
```
[10] Lin, T.Y., Goyal, P., Girshick, R., He, K., and Dollar, P. (2017). ́ Focal Loss for Dense
Object Detection. Proceedings of the IEEE International Conference on Computer Vision
(ICCV).

[11] (2022). Follicular Unit Extraction with the ARTAS Robotic Hair Transplant System: An
Evaluation of FUE Yield. ResearchGate.

[12] (2025). What is the Latest Technology in Hair Transplant 2025? FUEsion X Stands Out.
iBrain Robotics.


