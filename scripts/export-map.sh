#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ---------------------------------------------------------------------------
# Source2Viewer
# ---------------------------------------------------------------------------

SOURCE2VIEWER_VERSION="${SOURCE2VIEWER_VERSION:-19.2}"
SOURCE2VIEWER_DIR="$ROOT_DIR/.local/source2viewer"
SOURCE2VIEWER_CLI="$SOURCE2VIEWER_DIR/Source2Viewer-CLI"

install_source2viewer() (
  set -euo pipefail

  local os
  local arch
  local asset
  local url
  local tmp

  os="$(uname -s)"
  arch="$(uname -m)"

  if [[ "$os" != "Darwin" ]]; then
    echo "Unsupported OS: $os" >&2
    exit 1
  fi

  case "$arch" in
    arm64)
      asset="cli-macos-arm64.zip"
      ;;
    x86_64)
      asset="cli-macos-x64.zip"
      ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  url="https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/${SOURCE2VIEWER_VERSION}/${asset}"

  echo "Source2Viewer $SOURCE2VIEWER_VERSION is not installed."
  echo "Downloading $asset..."

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  curl \
    --fail \
    --location \
    --retry 3 \
    --progress-bar \
    "$url" \
    --output "$tmp/source2viewer.zip"

  rm -rf "$SOURCE2VIEWER_DIR"
  mkdir -p "$SOURCE2VIEWER_DIR"

  unzip -q "$tmp/source2viewer.zip" -d "$SOURCE2VIEWER_DIR"

  if [[ ! -f "$SOURCE2VIEWER_CLI" ]]; then
    echo "Source2Viewer-CLI not found after extraction." >&2
    exit 1
  fi

  chmod +x "$SOURCE2VIEWER_CLI"

  # Remove macOS quarantine attribute if present.
  xattr -dr com.apple.quarantine "$SOURCE2VIEWER_DIR" 2>/dev/null || true

  echo "Source2Viewer installed:"
  "$SOURCE2VIEWER_CLI" --version || true
)

if [[ ! -x "$SOURCE2VIEWER_CLI" ]]; then
  install_source2viewer
fi

# ---------------------------------------------------------------------------
# Map export
# ---------------------------------------------------------------------------

VPK_DIR="$ROOT_DIR/.local/vpk"
OUTPUT_DIR="$VPK_DIR/extracted"

MAPS=(
  de_dust2
  de_mirage
  de_nuke
  de_ancient
  de_anubis
  de_cache
  de_inferno
  de_overpass
  de_train
  de_vertigo
)

echo "Select maps to export (space/comma separated, or all):"

for index in "${!MAPS[@]}"; do
  printf "  %2d) %s\n" "$((index + 1))" "${MAPS[$index]}"
done

read -r -p "Map numbers: " selection

selection="${selection//,/ }"

if [[ "$selection" == "all" ]]; then
  selections=($(seq 1 "${#MAPS[@]}"))
else
  read -r -a selections <<< "$selection"
fi

if (( ${#selections[@]} == 0 )); then
  echo "No maps selected." >&2
  exit 1
fi

for selection in "${selections[@]}"; do
  if ! [[ "$selection" =~ ^[0-9]+$ ]] ||
     (( selection < 1 || selection > ${#MAPS[@]} )); then
    echo "Invalid map selection: $selection" >&2
    exit 1
  fi
done

for selection in "${selections[@]}"; do
  MAP_NAME="${MAPS[$((selection - 1))]}"
  VPK_FILE="$VPK_DIR/$MAP_NAME.vpk"
  MAP_OUTPUT="$OUTPUT_DIR/$MAP_NAME"

  if [[ ! -f "$VPK_FILE" ]]; then
    echo "VPK file not found: $VPK_FILE" >&2
    exit 1
  fi

  rm -rf "$MAP_OUTPUT"
  mkdir -p "$MAP_OUTPUT"

  echo "Exporting $MAP_NAME..."

  "$SOURCE2VIEWER_CLI" \
    --input "$VPK_FILE" \
    --output "$MAP_OUTPUT" \
    --decompile \
    --gltf_export_format glb \
    --gltf_export_materials \
    --gltf_textures_adapt

  EXPORTED_ROOT_DIR="$MAP_OUTPUT/maps"
  EXPORTED_MAP_DIR="$EXPORTED_ROOT_DIR/$MAP_NAME"

  mv \
    "$EXPORTED_MAP_DIR/world_physics.glb" \
    "$MAP_OUTPUT/world_physics.glb"

  mv \
    "$EXPORTED_MAP_DIR/world_physics_physics.glb" \
    "$MAP_OUTPUT/world_physics_physics.glb"

  mv \
    "$EXPORTED_ROOT_DIR/$MAP_NAME.nav" \
    "$MAP_OUTPUT/$MAP_NAME.nav"

  rm -rf "$EXPORTED_ROOT_DIR"

  echo "Export complete: $MAP_OUTPUT"
done