#!/bin/bash

# Extract CRDB jobs proto with all dependencies
set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"

echo "Extracting CRDB jobs proto with dependencies..."

cd "$CRDB_ROOT"

# Find all proto files that jobs.proto depends on
echo "Finding dependencies for jobs.proto..."

# Function to extract imports from a proto file
extract_imports() {
    local proto_file=$1
    grep "^import " "$proto_file" 2>/dev/null | sed 's/import "\(.*\)";/\1/' | grep -v "google/protobuf"
}

# Recursively find all dependencies
find_all_deps() {
    local proto=$1
    local seen_file="/tmp/seen_protos_$$"

    if grep -q "^$proto$" "$seen_file" 2>/dev/null; then
        return
    fi

    echo "$proto" >> "$seen_file"

    if [ -f "$proto" ]; then
        echo "$proto"
        local imports=$(extract_imports "$proto")
        for import in $imports; do
            find_all_deps "$import"
        done
    fi
}

# Initialize seen file
rm -f /tmp/seen_protos_$$
touch /tmp/seen_protos_$$

# Start with jobs.proto
ALL_PROTOS=$(find_all_deps "pkg/jobs/jobspb/jobs.proto" | sort -u)

echo "Found $(echo "$ALL_PROTOS" | wc -l) proto files"

# Find gogoproto path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)
if [ -z "$GOGOPROTO_PATH" ]; then
    GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/gogo/protobuf@* 2>/dev/null | sort -V | tail -1)
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"

# Build protoc command with all includes
PROTOC_CMD="protoc"
PROTOC_CMD="$PROTOC_CMD -I."
PROTOC_CMD="$PROTOC_CMD -I$GOGOPROTO_PATH"
if [ -d "$GOGOPROTO_PATH/protobuf" ]; then
    PROTOC_CMD="$PROTOC_CMD -I$GOGOPROTO_PATH/protobuf"
fi

# Output descriptor
PROTOC_CMD="$PROTOC_CMD --descriptor_set_out=$OUTPUT_DIR/crdb_jobs.pb"
PROTOC_CMD="$PROTOC_CMD --include_imports"
PROTOC_CMD="$PROTOC_CMD --include_source_info"

# Add all proto files
for proto in $ALL_PROTOS; do
    PROTOC_CMD="$PROTOC_CMD $proto"
done

echo "Running protoc..."
echo "$PROTOC_CMD"
eval $PROTOC_CMD

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb_jobs.pb"
    ls -lh "$OUTPUT_DIR/crdb_jobs.pb"
else
    echo "Failed to create descriptor set"
    exit 1
fi

# Clean up
rm -f /tmp/seen_protos_$$