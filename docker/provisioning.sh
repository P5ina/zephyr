#!/bin/bash
set -e

# Provisioning script for vastai/comfy
# Set as PROVISIONING_SCRIPT env var (URL to this file)
# Required env: HF_TOKEN (Hugging Face token for FLUX download)

COMFYUI_DIR="${WORKSPACE:-/workspace}/ComfyUI"
MODELS_DIR="${COMFYUI_DIR}/models"
CUSTOM_NODES_DIR="${COMFYUI_DIR}/custom_nodes"

echo "=== Starting provisioning ==="
echo "ComfyUI directory: ${COMFYUI_DIR}"

# Wait for ComfyUI directory to exist (vastai/comfy creates it)
for i in {1..30}; do
    if [ -d "${COMFYUI_DIR}" ]; then
        break
    fi
    echo "Waiting for ComfyUI directory..."
    sleep 2
done

if [ ! -d "${COMFYUI_DIR}" ]; then
    echo "ERROR: ComfyUI directory not found at ${COMFYUI_DIR}"
    exit 1
fi

# Install custom nodes
echo "Installing custom nodes..."

if [ ! -d "${CUSTOM_NODES_DIR}/ComfyUI-RMBG" ]; then
    echo "Installing ComfyUI-RMBG..."
    cd "${CUSTOM_NODES_DIR}"
    git clone https://github.com/1038lab/ComfyUI-RMBG.git
    cd ComfyUI-RMBG
    pip install -r requirements.txt || true
fi

# Download models
echo "Checking models..."

# HF auth header if token is set
HF_AUTH=""
if [ -n "${HF_TOKEN}" ]; then
    HF_AUTH="--header=Authorization: Bearer ${HF_TOKEN}"
    echo "Using Hugging Face token for authenticated downloads"
else
    echo "WARNING: HF_TOKEN not set, FLUX download may fail"
fi

# FLUX.1 Schnell (~23GB)
FLUX_DIR="${MODELS_DIR}/diffusion_models"
FLUX_FILE="${FLUX_DIR}/flux1-schnell.safetensors"
if [ ! -f "${FLUX_FILE}" ] || [ ! -s "${FLUX_FILE}" ]; then
    echo "Downloading FLUX.1 Schnell (~23GB)..."
    mkdir -p "${FLUX_DIR}"
    rm -f "${FLUX_FILE}"
    wget -q --show-progress ${HF_AUTH} -O "${FLUX_FILE}" \
        "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors"
fi

# FLUX VAE (~335MB)
VAE_DIR="${MODELS_DIR}/vae"
VAE_FILE="${VAE_DIR}/ae.safetensors"
if [ ! -f "${VAE_FILE}" ] || [ ! -s "${VAE_FILE}" ]; then
    echo "Downloading FLUX VAE (~335MB)..."
    mkdir -p "${VAE_DIR}"
    rm -f "${VAE_FILE}"
    wget -q --show-progress ${HF_AUTH} -O "${VAE_FILE}" \
        "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors"
fi

# CLIP L (~235MB)
TEXT_ENC_DIR="${MODELS_DIR}/text_encoders"
CLIP_FILE="${TEXT_ENC_DIR}/clip_l.safetensors"
if [ ! -f "${CLIP_FILE}" ] || [ ! -s "${CLIP_FILE}" ]; then
    echo "Downloading CLIP L (~235MB)..."
    mkdir -p "${TEXT_ENC_DIR}"
    rm -f "${CLIP_FILE}"
    wget -q --show-progress -O "${CLIP_FILE}" \
        "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors"
fi

# T5 XXL (~4.6GB)
T5_FILE="${TEXT_ENC_DIR}/t5xxl_fp8_e4m3fn.safetensors"
if [ ! -f "${T5_FILE}" ] || [ ! -s "${T5_FILE}" ]; then
    echo "Downloading T5 XXL (~4.6GB)..."
    rm -f "${T5_FILE}"
    wget -q --show-progress -O "${T5_FILE}" \
        "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors"
fi

# BiRefNet for background removal (~900MB)
RMBG_DIR="${MODELS_DIR}/rmbg"
RMBG_FILE="${RMBG_DIR}/BiRefNet.safetensors"
if [ ! -f "${RMBG_FILE}" ] || [ ! -s "${RMBG_FILE}" ]; then
    echo "Downloading BiRefNet (~900MB)..."
    mkdir -p "${RMBG_DIR}"
    rm -f "${RMBG_FILE}"
    wget -q --show-progress -O "${RMBG_FILE}" \
        "https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/model.safetensors"
fi

echo "=== Provisioning complete ==="
echo "Models downloaded to: ${MODELS_DIR}"
ls -lh "${MODELS_DIR}/diffusion_models/" 2>/dev/null || true
ls -lh "${MODELS_DIR}/vae/" 2>/dev/null || true
ls -lh "${MODELS_DIR}/text_encoders/" 2>/dev/null || true
ls -lh "${MODELS_DIR}/rmbg/" 2>/dev/null || true
