#!/bin/bash
# Savage Arena - Sprite Sheet Processor
# Converts base 128x128 images to 16x32 sprite-ready format

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BASE_DIR="$PROJECT_DIR/layers/Base"
OUTPUT_DIR="$PROJECT_DIR/sprites/processed"
SHEET_DIR="$PROJECT_DIR/sprites/sheets"

mkdir -p "$OUTPUT_DIR"
mkdir -p "$SHEET_DIR"

echo "🦎 Savage Arena Sprite Processor"
echo "================================"
echo "Base dir: $BASE_DIR"
echo "Output dir: $OUTPUT_DIR"

# Process each base sprite
for img in "$BASE_DIR"/*.png; do
    filename=$(basename "$img" .png)
    echo "Processing: $filename"
    
    # Scale down to 16x32 (maintaining aspect ratio, crop to fit)
    # Original: 128x128 → Target: 16x32 (1:2 aspect ratio)
    # We'll scale to 16px wide, then crop/pad to 32px tall
    
    sips -z 32 16 "$img" --out "$OUTPUT_DIR/${filename}_16x32.png" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Created ${filename}_16x32.png"
    else
        echo "  ✗ Failed to process $filename"
    fi
done

echo ""
echo "================================"
echo "✅ Processing complete!"
echo "Processed sprites in: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Review processed sprites for quality"
echo "  2. Create animation frames manually or via AI"
echo "  3. Assemble into 128x128 sprite sheets (8x4 grid)"
