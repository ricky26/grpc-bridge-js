# grpc-bridge-js
JavaScript (Node &amp; Browser) support for the grpc-bridge.

This package is designed to make developing frontends directly onto gRPC services easy and error-free.

## Packages
- [@wellplayed/grpc-bridge](packages/grpc-bridge):
    The core gRPC bridge client library. Technically not bridge-specific but at the moment there is no backend which supports the default HTTP/2 wire format.
- [@wellplayed/grpc-bridge-websocket](packages/grpc-bridge-websocket):
    The browser WebSocket backend. This version only works on browsers which support websockets.
- [@wellplayed/grpc-bridge-ws](packages/grpc-bridge-ws):
    The Node.js websocket backend (uses the `ws` package). This version only works under Node.js.
- [@wellplayed/grpc-bridge-gen](packages/grpc-bridge-gen):
    The protoc plugin which generates the service definitions for use with `@wellplayed/grpc-bridge`.

## See Also
 - [grpc-websocket-bridge](https://github.com/wellplayedgames/grpc-websocket-bridge):
    The Go implementation of the websocket bridge.
