#!/bin/bash

# Extract CRDB protos with ALL dependencies including external ones
set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"
ERRORS_PKG="$HOME/go/pkg/mod/github.com/cockroachdb/errors@v1.11.1"

cd "$CRDB_ROOT"

# Find gogoproto path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)
if [ -z "$GOGOPROTO_PATH" ]; then
    GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/gogo/protobuf@* 2>/dev/null | sort -V | tail -1)
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"
echo "Using errors from: $ERRORS_PKG"

# Create temp directory with correct structure
TEMP_DIR="/tmp/crdb_proto_complete_$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "Setting up proto directory structure..."

# Copy CRDB protos without pkg/ prefix (to match import paths)
find pkg -name "*.proto" -type f | while read proto; do
    import_path="${proto#pkg/}"
    dir=$(dirname "$import_path")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$import_path"
done

# Copy other CRDB protos (not in pkg/)
find . -name "*.proto" -type f | grep -v "^./pkg/" | grep -v vendor | grep -v bazel | grep -v node_modules | while read proto; do
    import_path="${proto#./}"
    dir=$(dirname "$import_path")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$import_path"
done

# Copy errorspb from external package
if [ -d "$ERRORS_PKG/errorspb" ]; then
    echo "Copying errorspb..."
    mkdir -p "$TEMP_DIR/errorspb"
    cp "$ERRORS_PKG/errorspb"/*.proto "$TEMP_DIR/errorspb/"
fi

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

echo "Compiling jobs.proto with all dependencies..."

# Compile the descriptor
protoc \
    -I. \
    --descriptor_set_out="$OUTPUT_DIR/crdb_jobs_complete.pb" \
    --include_imports \
    --include_source_info \
    jobs/jobspb/jobs.proto

if [ $? -eq 0 ]; then
    echo "✓ Successfully created $OUTPUT_DIR/crdb_jobs_complete.pb"
    ls -lh "$OUTPUT_DIR/crdb_jobs_complete.pb"

    # Quick verification
    cd /Users/david/code/zipbrowse

    cat > verify_complete.cjs << 'EOF'
const protobuf = require('protobufjs');
const fs = require('fs');
const descriptor = require('protobufjs/ext/descriptor');

const buffer = fs.readFileSync('./public/crdb_jobs_complete.pb');
const FileDescriptorSet = descriptor.FileDescriptorSet;
const fileDescriptorSet = FileDescriptorSet.decode(buffer);

console.log(`\n✓ Descriptor contains ${fileDescriptorSet.file.length} files`);

// Look for jobs.proto
const jobsFile = fileDescriptorSet.file.find(f =>
    f.name && f.name.includes('jobs.proto')
);

if (jobsFile) {
    console.log(`✓ Found: ${jobsFile.name}`);
    console.log(`  Package: ${jobsFile.package}`);

    if (jobsFile.messageType) {
        // Find Payload
        const payload = jobsFile.messageType.find(m => m.name === 'Payload');
        if (payload) {
            console.log(`✓ Found Payload message with ${payload.field ? payload.field.length : 0} fields`);

            // Check for the critical fields we need
            const criticalFields = [
                'description',
                'username_proto',
                'started_micros',
                'creation_cluster_id',
                'creation_cluster_version'
            ];

            console.log('\nChecking critical fields:');
            criticalFields.forEach(fieldName => {
                const field = payload.field && payload.field.find(f => f.name === fieldName);
                if (field) {
                    console.log(`  ✓ ${fieldName} (field ${field.number})`);
                } else {
                    console.log(`  ✗ ${fieldName} - MISSING!`);
                }
            });
        } else {
            console.log('✗ Payload message NOT FOUND!');
        }

        // Also check for Progress
        const progress = jobsFile.messageType.find(m => m.name === 'Progress');
        if (progress) {
            console.log(`\n✓ Found Progress message with ${progress.field ? progress.field.length : 0} fields`);
        }
    }
} else {
    console.log('✗ jobs.proto NOT FOUND in descriptor!');
}
EOF

    node verify_complete.cjs
    rm verify_complete.cjs
else
    echo "✗ Failed to compile. Errors:"
    protoc \
        -I. \
        --descriptor_set_out="/dev/null" \
        jobs/jobspb/jobs.proto 2>&1 | head -20
fi

# Clean up
rm -rf "$TEMP_DIR"

echo -e "\nDone!"