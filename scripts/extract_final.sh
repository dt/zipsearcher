#!/bin/bash

# Extract CRDB protos properly
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

# Create a temporary directory and copy all protos there
TEMP_DIR="/tmp/crdb_protos_$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "Copying CRDB proto files..."

# Copy all CRDB proto files preserving structure
find . -name "*.proto" -type f | grep -v "/vendor/" | grep -v "/_bazel" | while read proto; do
    dir=$(dirname "$proto")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$proto"
done

# Copy gogoproto
if [ -d "$GOGOPROTO_PATH/gogoproto" ]; then
    echo "Copying gogoproto..."
    cp -r "$GOGOPROTO_PATH/gogoproto" "$TEMP_DIR/"
fi

# Copy google protobuf definitions
if [ -d "$GOGOPROTO_PATH/protobuf/google" ]; then
    echo "Copying google protobuf..."
    cp -r "$GOGOPROTO_PATH/protobuf/google" "$TEMP_DIR/"
fi

cd "$TEMP_DIR"

echo "Compiling jobs proto with all dependencies..."

# Run protoc from the temp dir where all protos are available
protoc \
    -I. \
    --descriptor_set_out="$OUTPUT_DIR/crdb_jobs_complete.pb" \
    --include_imports \
    --include_source_info \
    pkg/jobs/jobspb/jobs.proto

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb_jobs_complete.pb"
    ls -lh "$OUTPUT_DIR/crdb_jobs_complete.pb"

    # Test that it contains the Payload type
    echo "Testing descriptor content..."
    cd "$OUTPUT_DIR"

    # Move back to zipbrowse dir
    cd /Users/david/code/zipbrowse

    # Create a quick test to verify the descriptor has what we need
    cat > test_descriptor.cjs << 'EOF'
const protobuf = require('protobufjs');
const fs = require('fs');
const descriptor = require('protobufjs/ext/descriptor');

const buffer = fs.readFileSync('./public/crdb_jobs_complete.pb');
const FileDescriptorSet = descriptor.FileDescriptorSet;
const fileDescriptorSet = FileDescriptorSet.decode(buffer);

console.log(`Descriptor contains ${fileDescriptorSet.file.length} files`);

// Check for jobs.proto
const jobsFile = fileDescriptorSet.file.find(f => f.name && f.name.includes('jobs.proto'));
if (jobsFile) {
    console.log('✓ Found jobs.proto');
    console.log(`  Package: ${jobsFile.package}`);
    console.log(`  Messages: ${jobsFile.messageType ? jobsFile.messageType.length : 0}`);

    // Look for Payload message
    if (jobsFile.messageType) {
        const payload = jobsFile.messageType.find(m => m.name === 'Payload');
        if (payload) {
            console.log('✓ Found Payload message');
            console.log(`  Fields: ${payload.field ? payload.field.length : 0}`);

            // Check for critical fields
            const criticalFields = ['creation_cluster_id', 'creation_cluster_version'];
            criticalFields.forEach(fieldName => {
                const field = payload.field && payload.field.find(f => f.name === fieldName);
                if (field) {
                    console.log(`  ✓ Has field: ${fieldName}`);
                }
            });
        }
    }
}
EOF

    node test_descriptor.cjs
    rm test_descriptor.cjs

else
    echo "Failed to create descriptor set"
    # Show first few errors
    protoc \
        -I. \
        --descriptor_set_out="/dev/null" \
        pkg/jobs/jobspb/jobs.proto 2>&1 | head -20
fi

# Clean up
rm -rf "$TEMP_DIR"

echo "Done!"