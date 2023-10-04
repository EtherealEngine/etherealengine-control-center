#!/bin/bash

set -e

#===========
# Parameters
#===========

PASSWORD=$1

#============
# Verify Helm
#============

if helm version >/dev/null; then
    echo "helm is installed"
else
    echo "helm is not installed"

    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    echo "$PASSWORD" | sudo -S chmod 700 get_helm.sh
    echo "$PASSWORD" | sudo -S bash get_helm.sh
    rm -f get_helm.sh
fi

HELM_VERSION=$(helm version)
echo "helm version is $HELM_VERSION"