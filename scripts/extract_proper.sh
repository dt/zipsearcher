#!/bin/bash

# Extract CRDB protos with correct import resolution
set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"

cd "$CRDB_ROOT"

# Find gogoproto path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)
if [ -z "$GOGOPROTO_PATH" ]; then
    GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/gogo/protobuf@* 2>/dev/null | sort -V | tail -1)
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"

# The key insight: CRDB imports don't include "pkg/" but the files are in pkg/
# So we need to set up the import paths correctly

# Create a temp directory with the right structure
TEMP_DIR="/tmp/crdb_proto_extract_$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "Setting up proto directory structure..."

# Copy all proto files from pkg/ to root level in temp dir (matching import paths)
find pkg -name "*.proto" -type f | while read proto; do
    # Remove the pkg/ prefix to match import paths
    import_path="${proto#pkg/}"
    dir=$(dirname "$import_path")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$import_path"
    echo "  $proto -> $import_path"
done

# Also check for protos outside pkg/
find . -name "*.proto" -type f | grep -v "^./pkg/" | grep -v vendor | grep -v bazel | grep -v node_modules | while read proto; do
    import_path="${proto#./}"
    dir=$(dirname "$import_path")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$import_path"
    echo "  $proto -> $import_path"
done

# Copy gogoproto
if [ -d "$GOGOPROTO_PATH/gogoproto" ]; then
    echo "Copying gogoproto..."
    cp -r "$GOGOPROTO_PATH/gogoproto" "$TEMP_DIR/"
fi

# Copy google protobuf
if [ -d "$GOGOPROTO_PATH/protobuf/google" ]; then
    echo "Copying google protobuf..."
    cp -r "$GOGOPROTO_PATH/protobuf/google" "$TEMP_DIR/"
fi

cd "$TEMP_DIR"

echo "Structure ready. Compiling jobs.proto..."

# Now compile - the imports should resolve correctly
protoc \
    -I. \
    --descriptor_set_out="$OUTPUT_DIR/crdb_jobs.pb" \
    --include_imports \
    --include_source_info \
    jobs/jobspb/jobs.proto

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb_jobs.pb"
    ls -lh "$OUTPUT_DIR/crdb_jobs.pb"

    # Verify it contains what we need
    echo "Verifying descriptor content..."
    cd /Users/david/code/zipbrowse

    cat > verify_jobs.cjs << 'EOF'
const protobuf = require('protobufjs');
const fs = require('fs');
const descriptor = require('protobufjs/ext/descriptor');

const buffer = fs.readFileSync('./public/crdb_jobs.pb');
const FileDescriptorSet = descriptor.FileDescriptorSet;
const fileDescriptorSet = FileDescriptorSet.decode(buffer);

console.log(`✓ Descriptor contains ${fileDescriptorSet.file.length} files`);

// Look for jobs.proto
const jobsFile = fileDescriptorSet.file.find(f =>
    f.name && (f.name.includes('jobs.proto') || f.name.includes('jobspb'))
);

if (jobsFile) {
    console.log(`✓ Found jobs file: ${jobsFile.name}`);
    console.log(`  Package: ${jobsFile.package}`);

    if (jobsFile.messageType) {
        console.log(`  Messages: ${jobsFile.messageType.length}`);

        // Find Payload
        const payload = jobsFile.messageType.find(m => m.name === 'Payload');
        if (payload) {
            console.log('✓ Found Payload message');
            console.log(`  Fields: ${payload.field ? payload.field.length : 0}`);

            // Check for critical fields
            ['creation_cluster_id', 'creation_cluster_version', 'description', 'username_proto', 'started_micros'].forEach(name => {
                const field = payload.field && payload.field.find(f => f.name === name);
                console.log(`  ${field ? '✓' : '✗'} Field: ${name}`);
            });
        } else {
            console.log('✗ Payload message not found');
        }
    }
} else {
    console.log('✗ jobs.proto not found in descriptor');
}
EOF

    node verify_jobs.cjs
    rm verify_jobs.cjs
else
    echo "Failed to compile. Showing errors:"
    protoc \
        -I. \
        --descriptor_set_out="/dev/null" \
        jobs/jobspb/jobs.proto 2>&1 | head -30
fi

# Clean up
rm -rf "$TEMP_DIR"

echo "Done!"