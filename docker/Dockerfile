# ComfyUI worker for Vast.ai
# No RunPod dependency - runs ComfyUI directly with HTTP API

FROM comfyanonymous/comfyui:latest

# BiRefNet dependencies
RUN pip install --no-cache-dir transformers>=4.36.0 timm>=0.9.12 kornia>=0.7.0

# ComfyUI nodes
WORKDIR /comfyui/custom_nodes
RUN git clone https://github.com/1038lab/ComfyUI-RMBG.git && \
    cd ComfyUI-RMBG && pip install -r requirements.txt

# Models
WORKDIR /comfyui/models

# FLUX.1 Schnell (Apache 2.0)
RUN mkdir -p checkpoints/flux && \
    huggingface-cli download black-forest-labs/FLUX.1-schnell --local-dir checkpoints/flux/schnell

# BiRefNet (MIT)
RUN mkdir -p RMBG/BiRefNet && \
    huggingface-cli download ZhengPeng7/BiRefNet --local-dir RMBG/BiRefNet

# Copy workflows
COPY workflows/ /comfyui/workflows/

WORKDIR /comfyui

# Expose ComfyUI API port
EXPOSE 8188

# Start ComfyUI listening on all interfaces
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
