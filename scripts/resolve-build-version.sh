#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

exact_tag="$(git tag --points-at HEAD | sort -V | tail -n 1)"
dirty="$(git status --porcelain)"

if [[ -n "$exact_tag" && -z "$dirty" ]]; then
  printf '%s\n' "$exact_tag"
  exit 0
fi

if [[ -t 0 ]]; then
  if [[ -n "$dirty" ]]; then
    reason='the worktree contains uncommitted changes'
  else
    reason='HEAD has no exact tag'
  fi
  printf 'Build warning: %s. Continue with a git-describe version? [y/N] ' "$reason" >&2
  read -r reply
  case "$reply" in
    y|Y|yes|YES|Yes) ;;
    *) exit 1 ;;
  esac
fi

git describe --tags --always --dirty
