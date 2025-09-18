#!/bin/bash

# Extract CRDB protos with proper import path resolution
set -e

CRDB_ROOT="$HOME/go/src/github.com/cockroachdb/cockroach"
OUTPUT_DIR="/Users/david/code/zipbrowse/public"

echo "Building proto import map..."

cd "$CRDB_ROOT"

# Find all proto files and build a map of import name to actual path
declare -A PROTO_MAP

# Find all proto files in CRDB
echo "Scanning CRDB proto files..."
while IFS= read -r proto_path; do
    # The import name is the path relative to the CRDB root
    import_name="${proto_path#./}"
    PROTO_MAP["$import_name"]="$proto_path"
    echo "  $import_name -> $proto_path"
done < <(find . -name "*.proto" -type f | grep -v "/vendor/" | grep -v "/_bazel" | grep -v "/node_modules/")

echo "Found ${#PROTO_MAP[@]} proto files in CRDB"

# Find gogoproto path
GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/cockroachdb/gogoproto@* 2>/dev/null | sort -V | tail -1)
if [ -z "$GOGOPROTO_PATH" ]; then
    GOGOPROTO_PATH=$(ls -d ~/go/pkg/mod/github.com/gogo/protobuf@* 2>/dev/null | sort -V | tail -1)
fi

echo "Using gogoproto from: $GOGOPROTO_PATH"

# Build list of all proto files we need for jobs.proto
echo "Finding dependencies for jobs.proto..."

# Function to extract imports from a proto file
extract_imports() {
    local proto_file=$1
    grep "^import " "$proto_file" 2>/dev/null | sed 's/import "\(.*\)";/\1/' || true
}

# Recursively find all dependencies
SEEN_PROTOS=""
PROTO_LIST=""

find_deps() {
    local proto=$1

    # Check if we've already seen this proto
    if echo "$SEEN_PROTOS" | grep -q "^$proto$"; then
        return
    fi

    SEEN_PROTOS="$SEEN_PROTOS$proto"$'\n'

    # Find the actual path for this proto
    local actual_path="${PROTO_MAP[$proto]}"
    if [ -z "$actual_path" ]; then
        # Try without leading ./
        actual_path="${PROTO_MAP[./$proto]}"
    fi

    if [ -n "$actual_path" ] && [ -f "$actual_path" ]; then
        PROTO_LIST="$PROTO_LIST $actual_path"
        echo "  Adding: $proto -> $actual_path"

        # Get its imports
        local imports=$(extract_imports "$actual_path")
        for import in $imports; do
            # Skip google/protobuf imports as they'll be in gogoproto
            if [[ ! "$import" == google/protobuf/* ]] && [[ ! "$import" == gogoproto/* ]]; then
                find_deps "$import"
            fi
        done
    else
        echo "  Warning: Could not find $proto"
    fi
}

# Start with jobs.proto
find_deps "pkg/jobs/jobspb/jobs.proto"

# Also add schedule.proto if it exists
if [ -f "pkg/jobs/jobspb/schedule.proto" ]; then
    find_deps "pkg/jobs/jobspb/schedule.proto"
fi

echo "Collected $(echo $PROTO_LIST | wc -w) proto files"

# Now run protoc with all the right includes
echo "Running protoc..."

protoc \
    -I. \
    -I"$GOGOPROTO_PATH" \
    -I"$GOGOPROTO_PATH/protobuf" \
    --descriptor_set_out="$OUTPUT_DIR/crdb_jobs_full.pb" \
    --include_imports \
    --include_source_info \
    $PROTO_LIST

if [ $? -eq 0 ]; then
    echo "Successfully created $OUTPUT_DIR/crdb_jobs_full.pb"
    ls -lh "$OUTPUT_DIR/crdb_jobs_full.pb"
else
    echo "Failed to create descriptor set"
    exit 1
fi

echo "Done!"