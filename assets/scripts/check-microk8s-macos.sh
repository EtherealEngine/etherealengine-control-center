#!/bin/bash

set -e

#===========
# Parameters
#===========

PASSWORD=$1
ASSETS_FOLDER=$2

#================
# Verify MicroK8s
#================

CONFIGURE_MICROK8S=false
if echo "$PASSWORD" | sudo -S microk8s version >/dev/null; then
    echo "microk8s is installed"
else
    echo "microk8s is not installed"

    # multipass is needed to package microk8s locally
    brew install --cask multipass

    brew install ubuntu/microk8s/microk8s
    microk8s install --channel=1.26

    echo "Installed multipass and microk8s"

    CONFIGURE_MICROK8S=true
fi
        
#==============================
# Ensure kubeconfig of microk8s
#==============================

# Check if .kube directory exists
if [[ ! -d ~/.kube ]]; then
    mkdir ~/.kube
fi

microk8sConfig=~/.kube/config-microk8s
eval microk8sConfig=$microk8sConfig

echo "$PASSWORD" | sudo -S microk8s config > $microk8sConfig

echo "Exported microk8s kubeconfig to: $microk8sConfig"

kubectl config rename-context microk8s etherealengine-microk8s --kubeconfig="$microk8sConfig"

# Check if .bashrc file exists
if [[ ! -f ~/.bashrc ]]; then
    touch ~/.bashrc
fi


if [[ -z $KUBECONFIG ]]; then
    KUBECONFIG=$HOME/.kube/config
fi

export KUBECONFIG=$KUBECONFIG:$microk8sConfig

# Append config-microk8s in $KUBECONFIG paths of .bashrc
if grep -F config-microk8s ~/.bashrc; then
    echo "config-microk8s exists in KUBECONFIG of ~/.bashrc"
else
    echo "config-microk8s does not exist in KUBECONFIG of ~/.bashrc"

    echo "export KUBECONFIG=$KUBECONFIG" >> ~/.bashrc
    source ~/.bashrc
    
    echo "config-microk8s entry added in KUBECONFIG of ~/.bashrc"
fi

kubectl config use-context etherealengine-microk8s

MICROK8S_VERSION=$(echo "$PASSWORD" | sudo -S microk8s version)
echo "microk8s version is $MICROK8S_VERSION"

MICROK8S_STATUS=$(echo "$PASSWORD" | sudo -S microk8s status)
echo "microk8s status is $MICROK8S_STATUS"

#=======================================================
# Ensure microk8s is running with correct configurations
#=======================================================


if microk8s status | grep 'microk8s is not running'; then
    CONFIGURE_MICROK8S=true
fi

if $CONFIGURE_MICROK8S; then
    echo "Microk8s not running, starting..."

    # Start microk8s
    echo "$PASSWORD" | sudo -S microk8s start

    echo "Microk8s started"

    # Enable Addons
    echo "$PASSWORD" | sudo -S microk8s enable dashboard
    echo "$PASSWORD" | sudo -S microk8s enable dns
    echo "$PASSWORD" | sudo -S microk8s enable registry
    # Since below command can cause terminal to exit.
    set +e
    echo "$PASSWORD" | sudo -S microk8s enable host-access
    set -e
    echo "$PASSWORD" | sudo -S microk8s enable ingress
    echo "$PASSWORD" | sudo -S microk8s enable rbac
    echo "$PASSWORD" | sudo -S microk8s enable hostpath-storage
    echo "$PASSWORD" | sudo -S microk8s enable helm3

    sleep 30

    # Inspect microk8s
    echo "$PASSWORD" | sudo -S microk8s inspect

    # Check microk8s status
    MICROK8S_STATUS=$(echo "$PASSWORD" | sudo -S microk8s status)
    echo "microk8s status is $MICROK8S_STATUS"

    if echo "$PASSWORD" | sudo -S microk8s status | grep 'microk8s is not running'; then
        echo "There is something wrong in your microk8s. Please fix all warnings in 'sudo microk8s inspect' and reboot. If you still face this issue then, try 'sudo snap remove microk8s --purge'"
        exit 4
    fi

    # Update kubernetes dashboard to allow skip login and update user role to have access to metrics.
    kubectl patch deployment kubernetes-dashboard -n kube-system --type 'json' -p '[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--enable-skip-login"}]'
    kubectl delete clusterrolebinding kubernetes-dashboard -n kube-system
    kubectl apply -f "$ASSETS_FOLDER/files/microk8s-dashboard.yaml"
fi
