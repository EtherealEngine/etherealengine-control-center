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
OPS_FOLDER=$6
TAG=$7
RUN_IN_DEVELOPMENT=$8

#=======================
# Verify Ethereal Engine
#=======================
 if [[ "$RUN_IN_DEVELOPMENT" == 'true' ]]; then
         APP_ENV=development
    else
         APP_ENV=production
   fi

cd "$ENGINE_FOLDER" || exit

RE_INIT=false

export MYSQL_HOST=localhost
export MYSQL_PORT=3304
DB_STATUS=$(npx cross-env ts-node --swc scripts/check-db-exists-only.ts)
DB_EXISTS=false
if [[ $DB_STATUS == *"database found"* ]]; then
    DB_EXISTS=true
    echo "Existing database populated"
elif [[ $DB_STATUS == *"database not found"* ]]; then
    echo "Existing database not populated"
fi

PROJECTS_PATH="$ENGINE_FOLDER/packages/projects/projects/"

if [[ -d $PROJECTS_PATH ]]; then
    echo "ethereal engine projects exists at $PROJECTS_PATH"
else
    echo "ethereal engine projects does not exists at $PROJECTS_PATH"

    RE_INIT=true
fi

export MYSQL_HOST=localhost
export MYSQL_PORT=3304

if [[ $RE_INIT == true || $FORCE_DB_REFRESH == 'true' ]]; then
    if [[ $CLUSTER_TYPE == 'minikube' ]]; then
        export STORAGE_S3_STATIC_RESOURCE_BUCKET=etherealengine-minikube-static-resources
        export VITE_FILE_SERVER=https://localhost:9000/etherealengine-minikube-static-resources
    else
        export STORAGE_S3_STATIC_RESOURCE_BUCKET=etherealengine-microk8s-static-resources
        export VITE_FILE_SERVER=https://localhost:9000/etherealengine-microk8s-static-resources
    fi

    npm run dev-docker
    npm run dev-reinit
fi

npm run prepare-database

echo "Ethereal Engine docker images build starting"
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

if [[ $CLUSTER_TYPE == 'microk8s' ]]; then
    set +e

    bash ./scripts/build_microk8s.sh "$TAG" true "$APP_ENV"

    exit_status=$?
    if [ "$exit_status" -ne 0 ]; then
        echo "If the previous error is 'localhost:32000 connection refused'. Please wait a while for the local registry to start and then configure again."
        exit "$exit_status"
    fi

    set -e

elif [[ $CLUSTER_TYPE == 'microk8sWindows' ]]; then
    export REGISTRY_HOST=microk8s.registry
    export MYSQL_HOST=kubernetes.docker.internal

    set +e
    retry=1
    while [ "$retry" -le 6 ]; do
        echo "Trying: $retry"

        bash ./scripts/build_microk8s.sh "$TAG" true "$APP_ENV"

        exit_status=$?
        if [ $exit_status -eq 0 ]; then
            break
        fi

        ((retry = retry + 1))
    done
    set -e

    if [ "$exit_status" -ne 0 ]; then
        exit "$exit_status"
    fi
elif [[ $CLUSTER_TYPE == 'minikube' ]]; then
    export MYSQL_HOST=host.minikube.internal
    bash ./scripts/build_minikube.sh
fi

ENGINE_INSTALLED=false
if helm status local >/dev/null; then
    ENGINE_INSTALLED=true
    echo "Ethereal Engine is installed"
else
    echo "Ethereal Engine is not installed"
fi

export MYSQL_HOST=localhost
export MYSQL_PORT=3304
npm run prepare-database

echo "Force DB refresh is $FORCE_DB_REFRESH"

if [[ $ENGINE_INSTALLED == true ]] && [[ $DB_EXISTS == false || $FORCE_DB_REFRESH == 'true' ]]; then
    echo "Updating Ethereal Engine deployment to configure database"

    helm upgrade --reuse-values -f "$OPS_FOLDER/configs/db-refresh-true.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine

    # Added this wait to ensure previous pod is deleted.
    sleep 60

    # Wait until the api pod is ready
    apiCount=$(kubectl get deploy local-etherealengine-api -o jsonpath='{.status.availableReplicas}')
    if [ -z "$apiCount" ]; then
        apiCount=0
    fi
    echo "Waiting for API pod to be ready. API ready count: $apiCount"

    # Wait until api count is 1.
    until [ "${apiCount}" -ge 1 ]; do
        sleep 5

        apiCount=$(kubectl get deploy local-etherealengine-api -o jsonpath='{.status.availableReplicas}')
        if [ -z "$apiCount" ]; then
            apiCount=0
        fi
        echo "Waiting for API pod to be ready. API ready count: $apiCount"
    done

    helm upgrade --reuse-values -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" -f "$OPS_FOLDER/configs/db-refresh-false.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine
elif [[ $ENGINE_INSTALLED == true ]] && [[ $DB_EXISTS == true ]]; then
    echo "Updating Ethereal Engine deployment without populating database"

    helm upgrade --reuse-values -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine
elif [[ $ENGINE_INSTALLED == false ]] && [[ $DB_EXISTS == false || $FORCE_DB_REFRESH == 'true' ]]; then
    echo "Installing Ethereal Engine deployment with populating database"

    helm install -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" -f "$OPS_FOLDER/configs/db-refresh-true.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine

    apiCount=$(kubectl get deploy local-etherealengine-api -o jsonpath='{.status.availableReplicas}')
    if [ -z "$apiCount" ]; then
        apiCount=0
    fi
    echo "Waiting for API pod to be ready. API ready count: $apiCount"

    # Wait until api count is 1.
    until [ "${apiCount}" -ge 1 ]; do
        sleep 5

        apiCount=$(kubectl get deploy local-etherealengine-api -o jsonpath='{.status.availableReplicas}')
        if [ -z "$apiCount" ]; then
            apiCount=0
        fi
        echo "Waiting for API pod to be ready. API ready count: $apiCount"
    done

    sleep 5

    helm upgrade --reuse-values -f "$OPS_FOLDER/configs/db-refresh-false.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine
elif [[ $ENGINE_INSTALLED == false ]] && [[ $DB_EXISTS == true ]]; then
    echo "Installing Ethereal Engine deployment without populating database"

    helm install -f "$CONFIGS_FOLDER/$CLUSTER_ID-engine.values.yaml" --set taskserver.image.tag="$TAG",api.image.tag="$TAG",instanceserver.image.tag="$TAG",testbot.image.tag="$TAG",client.image.tag="$TAG",testbot.image.tag="$TAG" local etherealengine/etherealengine
fi

export RELEASE_NAME=local
bash ./scripts/check-engine.sh

ENGINE_STATUS=$(helm status local)
echo "Ethereal Engine status is $ENGINE_STATUS"
