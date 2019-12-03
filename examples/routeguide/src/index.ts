import { AsyncStreamObserver, UnaryResponse } from '@wellplayed/grpc-bridge';
import { WSChannel } from '@wellplayed/grpc-bridge-ws';
import yargs from 'yargs';
import messages from '../proto/routeguide_pb';
import services from '../proto/routeguide_grpc_bridge';

const PT_MIN = mkPoint(-90, -180);
const PT_MAX = mkPoint(90, 180);
const RECT_ALL = mkRect(PT_MIN, PT_MAX);

function e7(x: number): number {
  return Math.round(x * (10 ** 7));
}

function mkPoint(lat: number, long: number): messages.Point {
  const pt = new messages.Point();
  pt.setLatitude(e7(lat));
  pt.setLongitude(e7(long));
  return pt;
}

function mkRect(lo: messages.Point, hi: messages.Point): messages.Rectangle {
  const rect = new messages.Rectangle();
  rect.setLo(lo);
  rect.setHi(hi);
  return rect;
}

async function asyncMain() {
  const argv = yargs.options({
    target: { type: 'string', default: 'ws://localhost:8080' },
  }).argv;
  
  const channel = new WSChannel({
    url: argv.target,
  });

  const client = new services.RouteGuideClient(channel);

  const feature = await client.getFeature(mkPoint(0, 0));
  console.log('get', feature.message.toObject());

  const features = await new Promise<messages.Feature[]>(accept => {
    const features: messages.Feature[] = [];
    client.listFeatures(RECT_ALL, {
      onHeader() {},
      onMessage(feature) {
        features.push(feature);
      },
      onEnd() { accept(features) },
    });
  });
  console.log('list', features.map(x => x.toObject()));

  const summary = await new Promise<UnaryResponse<messages.RouteSummary>>((accept, reject) => {
    client.recordRoute(new AsyncStreamObserver<messages.RouteSummary>(accept, reject))
      .then(writer => {
        writer.send(PT_MIN);
        writer.send(PT_MAX);
        writer.send(PT_MIN);
        writer.send(PT_MAX);
        writer.close();
      })
      .catch(reject);
  });
  console.log('summary', summary.message.toObject());
}

asyncMain()
  .then(
    () => process.exit(0),
    err => {
      console.error(err);
      process.exit(1);
    });