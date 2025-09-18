#!/bin/bash

# Script to extract CRDB proto descriptors with all dependencies
# Usage: ./extract_crdb_protos.sh

set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"

echo "Extracting CRDB proto descriptors..."

cd "$CRDB_ROOT"

# Find the gogoproto module path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)

if [ -z "$GOGOPROTO_PATH" ]; then
    echo "Error: Cannot find gogoproto in go modules"
    exit 1
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"

# Create a temporary directory with all proto files
TEMP_DIR="/tmp/crdb_protos_$$"
mkdir -p "$TEMP_DIR"

# Copy all CRDB proto files (macOS compatible)
echo "Copying CRDB proto files..."
find pkg -name "*.proto" | while read proto; do
    dir=$(dirname "$proto")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$proto" "$TEMP_DIR/$proto"
done

# Copy gogoproto
echo "Copying gogoproto..."
mkdir -p "$TEMP_DIR/gogoproto"
cp "$GOGOPROTO_PATH/gogoproto/gogo.proto" "$TEMP_DIR/gogoproto/"

# Copy google protobuf definitions if they exist
if [ -d "$GOGOPROTO_PATH/protobuf/google" ]; then
    echo "Copying google protobuf definitions..."
    cp -r "$GOGOPROTO_PATH/protobuf/google" "$TEMP_DIR/"
fi

# Count proto files
PROTO_COUNT=$(find "$TEMP_DIR" -name "*.proto" | wc -l)
echo "Found $PROTO_COUNT proto files"

# Compile the descriptor set
echo "Compiling descriptor set..."
cd "$TEMP_DIR"

# Get all proto files
PROTO_FILES=$(find . -name "*.proto" | sort)

# Run protoc with all includes
protoc \
    -I. \
    --descriptor_set_out="$OUTPUT_DIR/crdb.pb" \
    --include_imports \
    --include_source_info \
    $PROTO_FILES

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb.pb"
    ls -lh "$OUTPUT_DIR/crdb.pb"

    # Create a smaller version with just the job-related protos
    echo "Creating jobs-only descriptor set..."
    protoc \
        -I. \
        --descriptor_set_out="$OUTPUT_DIR/crdb_jobs.pb" \
        --include_imports \
        --include_source_info \
        pkg/jobs/jobspb/jobs.proto \
        pkg/jobs/jobspb/schedule.proto

    if [ $? -eq 0 ]; then
        echo "Successfully created $OUTPUT_DIR/crdb_jobs.pb"
        ls -lh "$OUTPUT_DIR/crdb_jobs.pb"
    fi
else
    echo "Failed to compile proto descriptors"
    # Show first few errors for debugging
    protoc \
        -I. \
        --descriptor_set_out="/dev/null" \
        $PROTO_FILES 2>&1 | head -20
    exit 1
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo "Done!"