#!/bin/bash
# Savage Arena - Sprite Sheet Assembler
# Assembles individual frames into 8x4 grid (128x128) sprite sheets

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
FRAMES_DIR="$PROJECT_DIR/sprites/frames"
SHEET_DIR="$PROJECT_DIR/sprites/sheets"

mkdir -p "$SHEET_DIR"

# Usage: ./assemble-sheet.sh <character_id>
# Expects frames in: sprites/frames/<character_id>/
# Frame naming: idle_f00.png, walk_f00.png, walk_f01.png, etc.

CHARACTER_ID="${1:-sa_croc_warrior_01}"
CHAR_FRAMES="$FRAMES_DIR/$CHARACTER_ID"

if [ ! -d "$CHAR_FRAMES" ]; then
    echo "❌ Frame directory not found: $CHAR_FRAMES"
    echo ""
    echo "Expected structure:"
    echo "  sprites/frames/$CHARACTER_ID/"
    echo "    ├── idle_f00.png"
    echo "    ├── walk_f00.png"
    echo "    ├── walk_f01.png"
    echo "    ├── walk_f02.png"
    echo "    ├── walk_f03.png"
    echo "    ├── attack_f00.png"
    echo "    ├── attack_f01.png"
    echo "    ├── attack_f02.png"
    echo "    ├── death_f00.png"
    echo "    └── death_f01.png"
    exit 1
fi

echo "🎨 Assembling sprite sheet for: $CHARACTER_ID"

# Use ImageMagick montage if available, otherwise provide manual instructions
if command -v montage &> /dev/null; then
    # Row 0: idle (1 frame) + empty (7)
    # Row 1: walk (4 frames) + empty (4)
    # Row 2: attack (3 frames) + empty (5)
    # Row 3: death (2 frames) + empty (6)
    
    montage \
        "$CHAR_FRAMES/idle_f00.png" \
        "$CHAR_FRAMES/walk_f00.png" "$CHAR_FRAMES/walk_f01.png" "$CHAR_FRAMES/walk_f02.png" "$CHAR_FRAMES/walk_f03.png" \
        "$CHAR_FRAMES/attack_f00.png" "$CHAR_FRAMES/attack_f01.png" "$CHAR_FRAMES/attack_f02.png" \
        -tile 8x4 -geometry 16x32+0+0 -background transparent \
        "$SHEET_DIR/${CHARACTER_ID}.png"
    
    echo "✅ Created: $SHEET_DIR/${CHARACTER_ID}.png"
else
    echo "⚠️ ImageMagick not installed. Manual assembly required."
    echo "Install with: brew install imagemagick"
fi
