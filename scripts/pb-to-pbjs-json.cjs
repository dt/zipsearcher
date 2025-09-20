// pb-to-pbjs-json.cjs — merge N FileDescriptorSets -> protobuf.js JSON (oneof-correct)
const fs = require("fs");
const desc = require("protobufjs/ext/descriptor"); // CJS
const { FileDescriptorSet } = desc;

if (process.argv.length < 4) {
  console.error("Usage: node pb-to-pbjs-json.cjs <out.json> <in1.pb> [in2.pb ...]");
  process.exit(1);
}

const outPath = process.argv[2];
const inPaths = process.argv.slice(3);

const DEBUG = !!process.env.DEBUG_DESCRIPTOR;
const SHOULD_LOG = (fullName) => DEBUG && /Descriptor/.test(fullName);

const scalar = {
  1:"double",2:"float",3:"int64",4:"uint64",5:"int32",6:"fixed64",7:"fixed32",
  8:"bool",9:"string",12:"bytes",13:"uint32",15:"sfixed32",16:"sfixed64",17:"sint32",18:"sint64"
};

// 1) Merge all sets
const merged = { file: [] };
for (const p of inPaths) {
  const fds = FileDescriptorSet.decode(fs.readFileSync(p));
  if (fds && Array.isArray(fds.file)) merged.file.push(...fds.file);
}

// 2) Convert -> protobuf.js JSON
const rootJSON = { nested: {} };

function ensurePkg(root, pkg) {
  const parts = pkg ? pkg.split(".") : [];
  let cur = root;
  for (const part of parts) {
    cur.nested ||= {};
    cur.nested[part] ||= {};
    cur = cur.nested[part];
  }
  cur.nested ||= {};
  return cur;
}

for (const file of merged.file) {
  const pkgNode = ensurePkg(rootJSON, file.package || "");

  // file-scope enums
  for (const en of file.enumType || []) {
    pkgNode.nested[en.name] = {
      values: Object.fromEntries((en.value || []).map(v => [v.name, v.number])),
    };
  }

  // file-scope messages
  for (const msg of file.messageType || []) {
    pkgNode.nested[msg.name] = buildMessageJSON(msg, [file.package || ""].filter(Boolean));
  }
}

function buildMessageJSON(msg, fqPath) {
  const out = { fields: {}, nested: {} };
  const fullName = [...fqPath, msg.name].filter(Boolean).join(".");

  if (SHOULD_LOG(fullName)) {
    console.error(`\n>>> Building message: ${fullName}`);
    console.error("   oneofDecl:", msg.oneofDecl?.length ? msg.oneofDecl.map(o => o.name) : "(none)");
  }

  // Track mapEntry helper types
  const mapEntryNames = new Set();

  // nested enums
  for (const en of msg.enumType || []) {
    out.nested[en.name] = {
      values: Object.fromEntries((en.value || []).map(v => [v.name, v.number])),
    };
  }

  // nested messages
  for (const n of msg.nestedType || []) {
    if (n.options && n.options.mapEntry) { mapEntryNames.add(n.name); continue; }
    out.nested[n.name] = buildMessageJSON(n, [...fqPath, msg.name]);
  }
  if (!Object.keys(out.nested).length) delete out.nested;

  // prepare oneofs ONLY if declared
  let oneofs = null;
  const hasDecl = Array.isArray(msg.oneofDecl) && msg.oneofDecl.length > 0;
  if (hasDecl) {
    oneofs = {};
    for (const o of msg.oneofDecl) oneofs[o.name] = [];
  }

  // fields
  for (const f of msg.field || []) {
    let rule = f.label === 3 ? "repeated" : (f.proto3Optional ? "optional" : undefined);
    let type = "", keyType;

    if (f.type === 11) { // message
      let fq = f.typeName;
      const short = fq && fq.split(".").pop();
      if (mapEntryNames.has(short)) {
        const me = (msg.nestedType || []).find(n => n.name === short);
        const k = me.field.find(x => x.name === "key");
        const v = me.field.find(x => x.name === "value");
        keyType = (k.type === 11 || k.type === 14) ? k.typeName : (scalar[k.type] || "bytes");
        type    = (v.type === 11 || v.type === 14) ? v.typeName : (scalar[v.type] || "bytes");
        rule = undefined; // maps use keyType/type only
      } else {
        // ensure leading dot for protobuf.js
        if (fq && !fq.startsWith(".")) fq = "." + fq;
        type = fq;
      }
    } else if (f.type === 14) { // enum
      let fq = f.typeName;
      if (fq && !fq.startsWith(".")) fq = "." + fq;
      type = fq;
    } else {
      type = scalar[f.type] || "bytes";
    }

    out.fields[f.name] = { id: f.number, type, ...(rule && { rule }), ...(keyType && { keyType }) };

    if (SHOULD_LOG(fullName)) {
      // IMPORTANT: presence check – NOT value check
      const hasOneofIndex = Object.prototype.hasOwnProperty.call(f, "oneofIndex");
      console.error(`   field: ${f.name} (#${f.number}), type=${type}, oneofIndex=${hasOneofIndex ? f.oneofIndex : "(absent)"}`);
    }

    // attach to oneof ONLY if declared AND oneofIndex is present
    if (hasDecl && Object.prototype.hasOwnProperty.call(f, "oneofIndex")) {
      const idx = f.oneofIndex;
      if (msg.oneofDecl[idx]) {
        const name = msg.oneofDecl[idx].name;
        (oneofs[name] ||= []).push(f.name);
      }
    }
  }

  if (oneofs && Object.keys(oneofs).length) {
    out.oneofs = oneofs;
    if (SHOULD_LOG(fullName)) console.error("   → wrote oneofs:", oneofs);
  }

  return out;
}

// 3) Apply gogoproto.typedecl = false patches
// Fix ColumnDescriptor field 3 (type) to expect InternalType instead of T
// This is needed because CRDB uses gogoproto.typedecl = false for T type,
// causing it to generate flattened InternalType data instead of nested T messages
function applyTypedeclPatches(root) {
  try {
    const columnDescPath = ['cockroach', 'sql', 'sqlbase', 'ColumnDescriptor'];
    let current = root;

    // Navigate to ColumnDescriptor
    for (const part of columnDescPath) {
      if (current?.nested?.[part]) {
        current = current.nested[part];
      } else {
        console.log(`Skipping typedecl patch - ColumnDescriptor not found at ${columnDescPath.join('.')}`);
        return;
      }
    }

    // Check if field 3 exists and is the type field
    if (current?.fields?.type?.id === 3) {
      const originalType = current.fields.type.type;
      current.fields.type.type = '.cockroach.sql.sem.types.InternalType';
      console.log(`Applied typedecl patch: ColumnDescriptor.type field changed from ${originalType} to .cockroach.sql.sem.types.InternalType`);
    } else {
      console.log(`Skipping typedecl patch - ColumnDescriptor.type field 3 not found as expected`);
    }
  } catch (error) {
    console.log(`Failed to apply typedecl patch: ${error.message}`);
  }
}

applyTypedeclPatches(rootJSON);

// 4) write
fs.writeFileSync(outPath, JSON.stringify(rootJSON, null, 2));
console.log(`Wrote ${outPath}`);
