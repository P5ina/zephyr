#!/bin/bash
set -e

# Provisioning script for ComfyUI worker
# This runs on container startup

# Vast.ai mounts disk at /workspace
WORKSPACE="${WORKSPACE:-/workspace}"
COMFYUI_DIR="${COMFYUI_DIR:-/opt/ComfyUI}"

# Store models in workspace (persistent disk), symlink to ComfyUI
MODELS_DIR="${WORKSPACE}/models"
CUSTOM_NODES_DIR="${COMFYUI_DIR}/custom_nodes"

# Create workspace models directory and symlink
mkdir -p "${MODELS_DIR}"
if [ -d "${COMFYUI_DIR}/models" ] && [ ! -L "${COMFYUI_DIR}/models" ]; then
    # Move existing models to workspace if any
    cp -rn "${COMFYUI_DIR}/models/"* "${MODELS_DIR}/" 2>/dev/null || true
    rm -rf "${COMFYUI_DIR}/models"
fi
ln -sfn "${MODELS_DIR}" "${COMFYUI_DIR}/models"

echo "=== Starting provisioning ==="

# Install custom nodes
echo "Installing custom nodes..."

# ComfyUI-RMBG for background removal (BiRefNet)
if [ ! -d "${CUSTOM_NODES_DIR}/ComfyUI-RMBG" ]; then
    echo "Installing ComfyUI-RMBG..."
    cd "${CUSTOM_NODES_DIR}"
    git clone https://github.com/1038lab/ComfyUI-RMBG.git
    cd ComfyUI-RMBG
    pip install -r requirements.txt || true
fi

# Download models if not present
echo "Checking models..."

# FLUX.1 Schnell (fast version, Apache 2.0 license)
FLUX_DIR="${MODELS_DIR}/unet"
if [ ! -f "${FLUX_DIR}/flux1-schnell.safetensors" ]; then
    echo "Downloading FLUX.1 Schnell..."
    mkdir -p "${FLUX_DIR}"
    wget -q --show-progress -O "${FLUX_DIR}/flux1-schnell.safetensors" \
        "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors" || true
fi

# FLUX VAE
VAE_DIR="${MODELS_DIR}/vae"
if [ ! -f "${VAE_DIR}/ae.safetensors" ]; then
    echo "Downloading FLUX VAE..."
    mkdir -p "${VAE_DIR}"
    wget -q --show-progress -O "${VAE_DIR}/ae.safetensors" \
        "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" || true
fi

# CLIP models for FLUX
CLIP_DIR="${MODELS_DIR}/clip"
if [ ! -f "${CLIP_DIR}/clip_l.safetensors" ]; then
    echo "Downloading CLIP L..."
    mkdir -p "${CLIP_DIR}"
    wget -q --show-progress -O "${CLIP_DIR}/clip_l.safetensors" \
        "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" || true
fi

if [ ! -f "${CLIP_DIR}/t5xxl_fp8_e4m3fn.safetensors" ]; then
    echo "Downloading T5 XXL..."
    wget -q --show-progress -O "${CLIP_DIR}/t5xxl_fp8_e4m3fn.safetensors" \
        "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" || true
fi

# BiRefNet for background removal
RMBG_DIR="${MODELS_DIR}/RMBG"
if [ ! -d "${RMBG_DIR}/BiRefNet" ]; then
    echo "Downloading BiRefNet..."
    mkdir -p "${RMBG_DIR}/BiRefNet"
    cd "${RMBG_DIR}/BiRefNet"
    wget -q --show-progress -O "model.safetensors" \
        "https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/model.safetensors" || true
fi

echo "=== Provisioning complete ==="
