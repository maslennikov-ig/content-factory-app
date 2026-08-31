#!/usr/bin/env bash

docker kill content-factory || true 
docker rm content-factory || true 
docker create --name content-factory -p 3000:3000 -p 4200:4200 localhost/content-factory
