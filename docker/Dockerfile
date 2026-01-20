# ComfyUI worker for Vast.ai using ai-dock base image
FROM ghcr.io/ai-dock/comfyui:latest

# Copy provisioning script to install models and custom nodes on startup
COPY provisioning.sh /opt/ai-dock/bin/provisioning.sh
RUN chmod +x /opt/ai-dock/bin/provisioning.sh

# Copy workflows
COPY workflows/ /opt/ComfyUI/user/default/workflows/

# Environment
ENV COMFYUI_PORT_HOST=8188
ENV AUTO_UPDATE=false

EXPOSE 8188
