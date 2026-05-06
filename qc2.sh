#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DIFF=$(git diff HEAD~1 -- ':!esphome-espnow-tree-ha/components/**')
if [ -z "$DIFF" ]; then
  echo "No changes since last commit."
  exit 1
fi

TMPFILE=$(mktemp)
echo "$DIFF" > "$TMPFILE"

echo "Asking Kimi for commit message suggestion..."
COMMIT_MSG=$(ask-kimi --paths "$TMPFILE" --question "Return ONLY the commit message line. Format: type: description. Types: feat, fix, chore, refactor, docs." --max-tokens 500)

rm -f "$TMPFILE"

COMMIT_MSG=$(echo "$COMMIT_MSG" | sed 's/<[^>]*>//g' | grep -v '^$' | tail -1)

echo ""
echo "Proposed commit message:"
echo "$COMMIT_MSG"
echo ""

read -r -p "Use this message? [Y/n] " -n 1 confirm
echo
if [[ "$confirm" =~ ^[Nn]$ ]]; then
  echo "Cancelled."
  exit 0
fi

git add -A
git commit -m "$COMMIT_MSG"
