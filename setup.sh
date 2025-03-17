#!/bin/bash

# Update the system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
echo "Installing dependencies..."
apt install -y ca-certificates curl gnupg build-essential git
