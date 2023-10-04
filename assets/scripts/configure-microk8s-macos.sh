#!/bin/bash

#==========
# Functions
#==========

checkExitCode() {
    exit_status=$?
    if [ $exit_status -ne 0 ]; then
        exit $exit_status
    fi
}

#===========
# Parameters
#===========

while getopts a:c:d:f:i:o:p:r: flag; do
    case "${flag}" in
    a) ASSETS_FOLDER=${OPTARG} ;;
    c) CONFIGS_FOLDER=${OPTARG} ;;
    d) FORCE_DB_REFRESH=${OPTARG} ;;
    f) ENGINE_FOLDER=${OPTARG} ;;
    i) CLUSTER_ID=${OPTARG} ;;
    o) OPS_FOLDER=${OPTARG} ;;
    p) PASSWORD=${OPTARG} ;;
    r) ENABLE_RIPPLE_STACK=${OPTARG} ;;
    *)
        echo "Invalid argument passed" >&2
        exit 1
        ;;
    esac
done

if [[ -z $ASSETS_FOLDER || -z $CONFIGS_FOLDER || -z $FORCE_DB_REFRESH || -z $ENGINE_FOLDER || -z $CLUSTER_ID || -z $OPS_FOLDER || -z $PASSWORD || -z $ENABLE_RIPPLE_STACK ]]; then
    echo "Missing arguments"
    exit 1
fi

#================================
# Set script directory as current
# Ref: https://stackoverflow.com/a/64168461/2077741
#================================

SCRIPTS_FOLDER="$(dirname "${BASH_SOURCE[0]}")"

#======
# Login
#======

bash "$SCRIPTS_FOLDER/check-login.sh" "$PASSWORD"

checkExitCode

set -e

#=============
# Verify Node
#=============

INSTALL_NODE=false
if node --version >/dev/null; then
    echo "node is installed"

    NODE_VERSION=$(node --version)

    # Ensure version is greater than 16
    NODE_MAJOR=${NODE_VERSION:1:2}
    if [[ $NODE_MAJOR -lt 16 ]]; then
        echo "node version is outdated $NODE_VERSION"
        INSTALL_NODE=true
    fi
else
    echo "node is not installed"
    INSTALL_NODE=true
fi

if $INSTALL_NODE; then
    # Ensure NVM is installed
    if nvm --version >/dev/null; then
        echo "nvm is installed"
    else
        echo "nvm is not installed"

        echo "$PASSWORD" | sudo -S apt update -y
        echo "$PASSWORD" | sudo -S apt install curl -y
        curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash
        source ~/.profile

        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"                   # This loads nvm
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion
    fi

    NVM_VERSION=$(nvm --version)
    echo "nvm version is $NVM_VERSION"

    nvm install node
    echo "node is installed"
fi

NODE_VERSION=$(node --version)
echo "node version is $NODE_VERSION"

#=============
# Verify Npm
#=============

bash "$SCRIPTS_FOLDER/check-npm.sh"

checkExitCode

#================
# Verify Python 3
#================

bash "$SCRIPTS_FOLDER/check-python.sh" "$PASSWORD"

checkExitCode

#=============
# Verify Make
#=============

bash "$SCRIPTS_FOLDER/check-make.sh" "$PASSWORD"

checkExitCode

#=============
# Verify Git
#=============

bash "$SCRIPTS_FOLDER/check-git.sh" "$PASSWORD"

checkExitCode

#=============
# Get Engine
#=============

bash "$SCRIPTS_FOLDER/check-engine-repo.sh" "$ENGINE_FOLDER" "$OPS_FOLDER"

checkExitCode

#==============
# Verify Docker
#==============

bash "$SCRIPTS_FOLDER/check-docker.sh" "$PASSWORD"

open -a Docker
while [[ -z "$(! docker ps 2> /dev/null)" ]];
    do printf "Waiting for docker to start...";
    sleep 5
done

checkExitCode

#======================
# Verify Docker Compose
#======================

bash "$SCRIPTS_FOLDER/check-docker-compose.sh" "$PASSWORD"

checkExitCode

#============================
# Ensure DB and Redis Running
#============================

bash "$SCRIPTS_FOLDER/check-mysql.sh" "$PASSWORD" "$ENGINE_FOLDER"

checkExitCode

#===============
# Verify Kubectl
#===============

bash "$SCRIPTS_FOLDER/check-kubectl.sh" "$PASSWORD"

checkExitCode

#============
# Verify Helm
#============

bash "$SCRIPTS_FOLDER/check-helm.sh" "$PASSWORD"

checkExitCode

#================================
# Docker MicroK8s Registry access
#================================

if [[ -f "/etc/docker/daemon.json" ]]; then
    echo "daemon.json file exists at /etc/docker/daemon.json"
else
    if [[ ! -d "/etc/docker" ]]; then
        echo "$PASSWORD" | sudo -S mkdir "/etc/docker"
    fi

    echo "$PASSWORD" | sudo -S -- sh -c "echo '{\"insecure-registries\" : [\"127.0.0.1:32000\"]}' >>/etc/docker/daemon.json"
    echo "daemon.json file created at /etc/docker/daemon.json"

    # close docker desktop
    killall Docker
    # https://stackoverflow.com/questions/16931244/checking-if-output-of-a-command-contains-a-certain-string-in-a-shell-script/57102498#57102498
    while [[ ! "$(docker ps 2>&1)" =~ "Is the docker daemon running?" ]];
        do printf "Waiting for docker to stop...";
        sleep 5
    done
    echo "Stopped docker"
    open -a Docker
    while [[ -z "$(! docker ps 2> /dev/null)" ]];
        do printf "Waiting for docker to start...";
        sleep 5
    done
    echo "Restarted docker"
fi

#================
# Verify MicroK8s
#================

bash "$SCRIPTS_FOLDER/check-microk8s-macos.sh" "$PASSWORD" "$ASSETS_FOLDER"

checkExitCode

# This is to ensure updated KUBECONFIG after microk8s being configured.
microk8sConfig=~/.kube/config-microk8s
eval microk8sConfig=$microk8sConfig

if [[ ! $KUBECONFIG == *"$microk8sConfig"* ]]; then
    export KUBECONFIG=$KUBECONFIG:$microk8sConfig
    source ~/.bashrc
fi

echo "KUBECONFIG is $KUBECONFIG"

#================
# Verify hostfile
# Reference:
# https://stackoverflow.com/a/29082739/2077741
# https://stackoverflow.com/a/18744367/2077741
#================

ADD_DOMAIN=false
if grep "local.etherealengine.org" /etc/hosts; then
    if grep "127.0.0.1 local.etherealengine.org" /etc/hosts; then
        echo "*.etherealengine.org entries exists"
    else
        echo "*.etherealengine.org entries outdated"
        grep -v 'local.etherealengine.org' /etc/hosts >/tmp/hosts.tmp
        echo "$PASSWORD" | sudo -S cp /tmp/hosts.tmp /etc/hosts
        ADD_DOMAIN=true
    fi
else
    ADD_DOMAIN=true
fi

if $ADD_DOMAIN; then
    echo "$PASSWORD" | sudo -S -- sh -c "echo '127.0.0.1 local.etherealengine.org api-local.etherealengine.org instanceserver-local.etherealengine.org 00000.instanceserver-local.etherealengine.org 00001.instanceserver-local.etherealengine.org 00002.instanceserver-local.etherealengine.org 00003.instanceserver-local.etherealengine.org' >>/etc/hosts"
    echo "*.etherealengine.org entries added"
fi

#==================
# Verify Helm Repos
#==================

bash "$SCRIPTS_FOLDER/check-helm-repos.sh"

checkExitCode

#======================
# Verify agones & redis
#======================

bash "$SCRIPTS_FOLDER/check-agones-redis.sh" "$OPS_FOLDER"

checkExitCode

#====================
# Verify ripple stack
#====================

bash "$SCRIPTS_FOLDER/check-ripple.sh" "$ENABLE_RIPPLE_STACK" "$OPS_FOLDER" "$CONFIGS_FOLDER" "$CLUSTER_ID"

checkExitCode

#=====================
# Get Docker Image Tag
#=====================

echo "$PASSWORD" | sudo -S apt install jq -y

TAG="$(jq -r .version "$ENGINE_FOLDER/packages/server-core/package.json")_$(cd "$ENGINE_FOLDER" && git rev-parse HEAD)__$(date +"%d-%m-%yT%H-%M-%S")"

echo "Tag is $TAG"

checkExitCode

#=======================
# Verify Ethereal Engine
#=======================

bash "$SCRIPTS_FOLDER/check-engine-deployment.sh" "$ENGINE_FOLDER" "$FORCE_DB_REFRESH" "$CONFIGS_FOLDER" "$CLUSTER_ID" "microk8s" "$OPS_FOLDER" "$TAG"

checkExitCode

echo "All Done"

exit 0
