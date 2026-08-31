#!/bin/bash

set -o xtrace

docker rmi localhost/content-factory || true
docker build --target dist -t localhost/content-factory -f Dockerfile.dev .
docker build --target devcontainer -t localhost/content-factory-devcontainer -f Dockerfile.dev .
