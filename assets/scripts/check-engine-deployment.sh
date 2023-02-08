#!/bin/bash

set -e

#===========
# Parameters
#===========

ENGINE_FOLDER=$1
FORCE_DB_REFRESH=$2
CONFIGS_FOLDER=$3
CLUSTER_ID=$4
CLUSTER_TYPE=$5

#=======================
# Verify Ethereal Engine
#=======================

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"                   # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion

cd "$ENGINE_FOLDER" || exit

PROJECTS_PATH="$ENGINE_FOLDER/packages/projects/projects/"

if [[ -d $PROJECTS_PATH ]]; then
    echo "ethereal engine projects exists at $PROJECTS_PATH"
else
    echo "ethereal engine projects does not exists at $PROJECTS_PATH"

    export MYSQL_HOST=localhost
    npm run dev-docker
    npm run install-projects
fi

echo "Ethereal Engine docker images build starting"
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

if [[ $CLUSTER_TYPE == 'microk8s' ]]; then
    bash ./scripts/build_microk8s.sh
elif [[ $CLUSTER_TYPE == 'microk8sWindows' ]]; then
    export REGISTRY_HOST=microk8s.registry;
    export MYSQL_HOST=kubernetes.docker.internal;
    bash ./scripts/build_minikube.sh
elif [[ $CLUSTER_TYPE == 'minikube' ]]; then
    bash ./scripts/build_minikube.sh
fi

ENGINE_INSTALLED=false
if helm status local >/dev/null; then
    ENGINE_INSTALLED=true
    echo "Ethereal Engine is installed"
else
    echo "Ethereal Engine is not installed"
fi

export MYSQL_PORT=3304
DB_STATUS=$(npm run check-db-exists-only)
DB_EXISTS=false
if [[ $DB_STATUS == *"database found"* ]]; then
    DB_EXISTS=true
    echo "Existing database populated"
elif [[ $DB_STATUS == *"database not found"* ]]; then
    echo "Existing database not populated"
fi

echo "Force DB refresh is $FORCE_DB_REFRESH"

if [[ $ENGINE_INSTALLED == true ]] && [[ $DB_EXISTS == false || $FORCE_DB_REFRESH == 'true' ]]; then
    echo "Updating Ethereal Engine deployment to configure database"
    helm upgrade --reuse-values -f "./packages/ops/configs/db-refresh-true.values.yaml" local xrengine/xrengine
    sleep 35
    helm upgrade --reuse-values -f "./packages/ops/configs/db-refresh-false.values.yaml" local xrengine/xrengine
elif [[ $ENGINE_INSTALLED == false ]] && [[ $DB_EXISTS == false || $FORCE_DB_REFRESH == 'true' ]]; then
    echo "Installing Ethereal Engine deployment with populating database"
    helm install -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" -f "./packages/ops/configs/db-refresh-true.values.yaml" local xrengine/xrengine
    sleep 35
    helm upgrade --reuse-values -f "./packages/ops/configs/db-refresh-false.values.yaml" local xrengine/xrengine
elif [[ $ENGINE_INSTALLED == false ]] && [[ $DB_EXISTS == true ]]; then
    echo "Installing Ethereal Engine deployment without populating database"
    helm install -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" local xrengine/xrengine
fi

export RELEASE_NAME=local
bash ./scripts/check-engine.sh

ENGINE_STATUS=$(helm status local)
echo "Ethereal Engine status is $ENGINE_STATUS"
