#!/bin/bash

# Extract ALL CRDB protos including jobs
set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"

echo "Extracting ALL CRDB protos..."

cd "$CRDB_ROOT"

# Find ALL proto files in the CRDB repo
ALL_PROTOS=$(find . -name "*.proto" -type f | grep -v "/vendor/" | grep -v "/_bazel" | grep -v "/node_modules/" | sort)

echo "Found $(echo "$ALL_PROTOS" | wc -l) proto files"

# Find gogoproto path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)
if [ -z "$GOGOPROTO_PATH" ]; then
    GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/gogo/protobuf@* 2>/dev/null | sort -V | tail -1)
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"

# Create temp directory with all proto files
TEMP_DIR="/tmp/crdb_all_protos_$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy all CRDB proto files preserving directory structure
echo "Copying proto files..."
for proto in $ALL_PROTOS; do
    dir=$(dirname "$proto")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$proto"
done

# Copy gogoproto
if [ -d "$GOGOPROTO_PATH/gogoproto" ]; then
    echo "Copying gogoproto..."
    cp -r "$GOGOPROTO_PATH/gogoproto" "$TEMP_DIR/"
fi

# Copy google protobuf if available
if [ -d "$GOGOPROTO_PATH/protobuf/google" ]; then
    echo "Copying google protobuf..."
    cp -r "$GOGOPROTO_PATH/protobuf/google" "$TEMP_DIR/"
fi

cd "$TEMP_DIR"

# Now compile with protoc
echo "Compiling descriptor set..."
protoc \
    -I. \
    --descriptor_set_out="$OUTPUT_DIR/crdb_all.pb" \
    --include_imports \
    --include_source_info \
    $(find . -name "*.proto")

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb_all.pb"
    ls -lh "$OUTPUT_DIR/crdb_all.pb"

    # Also create a jobs-specific one
    echo "Creating jobs-specific descriptor..."
    protoc \
        -I. \
        --descriptor_set_out="$OUTPUT_DIR/crdb_jobs_only.pb" \
        --include_imports \
        --include_source_info \
        ./pkg/jobs/jobspb/jobs.proto

    if [ $? -eq 0 ]; then
        echo "Successfully created $OUTPUT_DIR/crdb_jobs_only.pb"
        ls -lh "$OUTPUT_DIR/crdb_jobs_only.pb"
    fi
else
    echo "Failed to create descriptor set"
    # Show errors
    protoc \
        -I. \
        --descriptor_set_out="/dev/null" \
        $(find . -name "*.proto") 2>&1 | head -30
fi

# Clean up
rm -rf "$TEMP_DIR"

echo "Done!"