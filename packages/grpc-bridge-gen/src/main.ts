import fs from 'fs';
import path from 'path';
import { CodeGeneratorRequest, CodeGeneratorResponse } from 'google-protobuf/google/protobuf/compiler/plugin_pb';
import { FileDescriptorProto, DescriptorProto } from 'google-protobuf/google/protobuf/descriptor_pb';

const PACKAGE_NAME = '@wellplayed/grpc-bridge';
const PROTO_ROOTS: {[k: string]: string} = {
  'google/protobuf/': 'google-protobuf/',
};

const buffer = fs.readFileSync(0);
const request = CodeGeneratorRequest.deserializeBinary(buffer);
const response = new CodeGeneratorResponse();

const parameters = (request.getParameter() || '').split(',').reduce<{ [k: string]: string }>((params, line) => {
  const valueIdx = line.indexOf('=');
  if (valueIdx >= 0) {
    params[line.slice(0, valueIdx)] = line.slice(valueIdx + 1);
  } else {
    params[line] = '1';
  }
  return params;
}, {});

interface GeneratedCode {
  js: string;
  dts: string;
}

function capitalToLowerCamel(s: string) {
  return s.slice(0, 1).toLowerCase() + s.slice(1);
}

function importPath(sourcePath: string, targetPath: string): string {
  for (const [k, v] of Object.entries(PROTO_ROOTS)) {
    if (targetPath.startsWith(k)) {
      const rest = targetPath.slice(k.length);
      const absPath = path.join(v, rest);
      return absPath;
    }
  }

  const slashes = sourcePath.match(/\//g);
  const numSlashes = (slashes && slashes.length) || 0;

  if (numSlashes <= 0) {
    return `./${targetPath}`;
  }

  return path.join('../'.repeat(numSlashes), targetPath);
}

function jsName(targetDesc: FileDescriptorProto): string {
  return path.basename(targetDesc.getName() || '', '.proto') + '_pb';
}

function containsMessage(msgs: DescriptorProto[], name: string): boolean {
  for (const msg of msgs) {
    const msgName = msg.getName() || '';
    if (msgName === name) {
      return true;
    }

    if (msgName.startsWith(name) && msgName[name.length] === '.' && containsMessage(msg.getNestedTypeList(), name.slice(msgName.length + 1))) {
      return true;
    }
  }

  return false;
}

function fileForMessage(messageName: string): [FileDescriptorProto, string] {
  for (const proto of request.getProtoFileList()) {
    const pkgName = `.${proto.getPackage() || ''}`;
    if (!messageName.startsWith(pkgName)) {
      continue;
    }

    if (containsMessage(proto.getMessageTypeList(), messageName.slice(pkgName.length + 1))) {
      return [proto, messageName.substr(pkgName.length + 1)];
    }
  }
  
  throw new Error(`unable to find descriptor for ${messageName}`);
}

class ImportMap<TModule> {
  imports: Map<TModule, string>;

  constructor(private generateName: (module: TModule) => string) {
    this.imports = new Map();
  }

  getOrAdd(mod: TModule): string {
    const existing = this.imports.get(mod);
    if (existing !== undefined) {
      return existing;
    }

    const existingNames = Array.from(this.imports.values());
    let name = this.generateName(mod);

    while (existingNames.indexOf(name) >= 0) {
      name += '_';
    }

    this.imports.set(mod, name);
    return name;
  }

  modules(): IterableIterator<[TModule, string]> {
    return this.imports.entries();
  }
}

function messageToSymbol(map: ImportMap<FileDescriptorProto>, messageName: string): string {
  const [desc, msgSym] = fileForMessage(messageName);
  const pkgSym = map.getOrAdd(desc);
  return `${pkgSym}.${msgSym}`;
}

function generateCode(basePath: string, desc: FileDescriptorProto): GeneratedCode {
  const js = (x: any) => JSON.stringify(x, null, 2);
  const indent = (s: string, indent: string | number = '  ') => {
    if (typeof indent === 'number') {
      indent = '  '.repeat(indent);
    }

    return s.replace(/\n/g, `\n${indent}`);
  };

  const imports = new ImportMap(jsName);
  const code = {
    js: `// Generated from ${basePath}\n\n`,
    dts: `// Generated from ${basePath}\n\n`,
  };

  code.js += `const { ClientBase, StatusError, AsyncStreamObserver, mapStreamWriter, mapStreamObserver } = require('${PACKAGE_NAME}');\n`;
  code.dts += `import { Service, ServiceMethod, StreamWriter, StreamObserver, ClientBase, ExtraCallOptions, UnaryResponse } from '${PACKAGE_NAME}';\n`

  code.js += '\n';
  code.dts += '\n';

  let dtsBody = '';
  let jsBody = '';

  for (const svc of desc.getServiceList()) {
    const svcName = svc.getName() || '';
    const pkgName = (desc.getPackage() || '');
    const absSvcName = pkgName ? `${pkgName}.${svcName}` : svcName;
    const options = svc.getOptions();
    const clientName = `${svcName}Client`;

    // Generate service metadata.

    dtsBody += `export const ${svcName} : Service;\n\n`;
    jsBody += `exports.${svcName} = {\n`;
    jsBody += `  name: ${js(svcName)},\n`;

    if (options !== undefined) {
      jsBody += `  options: ${indent(js(options))},\n`
    }

    jsBody += '  methods: {\n';

    for (const mth of svc.getMethodList()) {
      const mthName = mth.getName() || '';
      const mthJsName = capitalToLowerCamel(mthName);
      const mthPath = `/${absSvcName}/${mthName}`;
      const inputType = messageToSymbol(imports, mth.getInputType() || '');
      const outputType = messageToSymbol(imports, mth.getOutputType() || '');
      
      const options = mth.getOptions();

      jsBody += `    ${mthJsName}: {\n`;
      jsBody += `      name: ${js(mthName)},\n`;
      jsBody += `      jsName: ${js(mthJsName)},\n`;
      jsBody += `      path: ${js(mthPath)},\n`;
      jsBody += `      inputType: ${inputType},\n`;
      jsBody += `      outputType: ${outputType},\n`;
      jsBody += `      serverStreaming: ${js(mth.getServerStreaming() || false)},\n`;
      jsBody += `      clientStreaming: ${js(mth.getClientStreaming() || false)},\n`;

      if (options !== undefined) {
        jsBody += `      options: ${indent(js(options.toObject()), 3)},\n`;
      }

      jsBody += `    },\n`;
    }

    jsBody += '  },\n';
    jsBody += '};\n\n';

    // Generate service client.

    jsBody += `class ${clientName} extends ClientBase {\n`;
    dtsBody += `export class ${clientName} extends ClientBase {\n`;

    for (const mth of svc.getMethodList()) {
      const mthName = mth.getName() || '';
      const mthJsName = capitalToLowerCamel(mthName);
      const mthRef = `exports.${svcName}.methods.${mthJsName}`;
      const inputType = messageToSymbol(imports, mth.getInputType() || '');
      const outputType = messageToSymbol(imports, mth.getOutputType() || '');
      const inputStreaming = mth.getClientStreaming() || false;
      const outputStreaming = mth.getServerStreaming() || false;

      if (inputStreaming) {
        dtsBody += `  ${mthJsName}(observer: StreamObserver<${outputType}>, options?: ExtraCallOptions): Promise<StreamWriter<${inputType}>>;\n`;

        jsBody += `  ${mthJsName}(observer, options) {\n`;
        jsBody += `    const methodDesc = ${mthRef};\n`;
        jsBody += `    const rawObserver = mapStreamObserver(observer, x => methodDesc.outputType.deserializeBinary(x));\n`;
        jsBody += `    return this.channel.createStream(rawObserver, { ...options, method: methodDesc.path })\n`;
        jsBody += `      .then(writer => mapStreamWriter(writer, x => x.serializeBinary()));\n`;
        jsBody += `  }\n\n`;
      } else if (outputStreaming) {
        // Only response streaming.
        dtsBody += `  ${mthJsName}(input: ${inputType}, observer: StreamObserver<${outputType}>, options?: ExtraCallOptions): void;\n`;

        jsBody += `  ${mthJsName}(input, observer, options) {\n`;
        jsBody += `    const methodDesc = ${mthRef};\n`;
        jsBody += `    const rawObserver = mapStreamObserver(observer, x => methodDesc.outputType.deserializeBinary(x));\n`;
        jsBody += `    this.channel.createStream(rawObserver, { ...options, method: methodDesc.path })\n`;
        jsBody += `      .then(writer => writer.send(input.serializeBinary()))\n`;
        jsBody += `      .catch(err => streamObserverThrow(rawObserver, err));\n`;
        jsBody += `  }\n\n`;
      } else {
        // Unary call.
        dtsBody += `  ${mthJsName}(input: ${inputType}, options?: ExtraCallOptions): Promise<UnaryResponse<${outputType}>>;\n`;

        jsBody += `  ${mthJsName}(input, options) {\n`;
        jsBody += `    const methodDesc = ${mthRef};\n`;
        jsBody += `    return new Promise((accept, reject) => {\n`;
        jsBody += `      const observer = mapStreamObserver(new AsyncStreamObserver(accept, reject), x => methodDesc.outputType.deserializeBinary(x));\n`;
        jsBody += `      this.channel.createStream(observer, { ...options, method: methodDesc.path })\n`;
        jsBody += `        .then(writer => writer.send(input.serializeBinary()), reject);\n`;
        jsBody += `    });\n`;
        jsBody += `  }\n\n`;
      }
    }

    jsBody += '}\n';
    jsBody += `exports.${clientName} = ${clientName};\n\n`;
    dtsBody += '}\n\n';
  }

  // Process imports!
  
  for (const [importDesc, impName] of imports.modules()) {
    const protoPath = (importDesc.getName() || '').replace('.proto', '') + '_pb';
    const impPath = importPath(desc.getName() || '', protoPath);

    code.js += `const ${impName} = require('${impPath}');\n`;
    code.dts += `import * as ${impName} from '${impPath}';\n`;
  }

  code.js += '\n';
  code.dts += '\n';

  code.js += jsBody;
  code.dts += dtsBody;
  return code;
}

(async () => {
  const descriptorMap = request.getProtoFileList().reduce<{[key: string]: FileDescriptorProto}>((acc, desc) => {
    const name = desc.getName()
    if (name) {
      acc[name] = desc;
    }
    return acc;
  }, {});

  for (const fileToGenerate of request.getFileToGenerateList()) {
    const desc = descriptorMap[fileToGenerate];
    if (!desc) {
      console.error('No descriptor for', fileToGenerate);
      process.exit(1);
    }

    const basePath = (desc.getName() || '').replace('.proto', '');
    const jsPath = `${basePath}_grpc_bridge.js`;
    const dtsPath = `${basePath}_grpc_bridge.d.ts`;

    const code = generateCode(basePath, desc);

    const jsFile = new CodeGeneratorResponse.File();
    jsFile.setName(jsPath);
    jsFile.setContent(code.js);
    response.addFile(jsFile);

    const dtsFile = new CodeGeneratorResponse.File();
    dtsFile.setName(dtsPath);
    dtsFile.setContent(code.dts);
    response.addFile(dtsFile);
  }

  fs.writeSync(1, response.serializeBinary());
})().then(
  () => process.exit(0),
  err => {
    console.error('error:', err);
    process.exit(1);
  });
