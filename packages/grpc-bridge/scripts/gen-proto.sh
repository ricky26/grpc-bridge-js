#!/bin/bash
cd "$(dirname "${BASH_SOURCE[0]}")/../proto"
protoc --plugin=protoc-gen-ts=../node_modules/.bin/protoc-gen-ts --js_out=import_style=commonjs:. --ts_out=. bridge.proto
