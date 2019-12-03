#!/bin/bash

set -e

PACKAGES="\
  packages/grpc-bridge\
  packages/grpc-bridge-gen\
  packages/grpc-bridge-websocket\
  packages/grpc-bridge-ws\
  examples/routeguide\
  "

for PACKAGE in $PACKAGES; do
  pushd "$PACKAGE"
  npm run watch &
  popd
done

wait
