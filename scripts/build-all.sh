#!/bin/bash

set -e

PACKAGES="\
  typed-event-target\
  grpc-bridge\
  grpc-bridge-gen\
  grpc-bridge-websocket\
  grpc-bridge-ws\
  "

for PACKAGE in $PACKAGES; do
  pushd "packages/$PACKAGE"
  npm i
  npm run build
  popd
done
