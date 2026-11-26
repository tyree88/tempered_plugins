#!/bin/sh
# Command center pane: fzf over the rows that a cc.lua action returns.
# Usage: cc_pane.sh [needs_me|threads]
# Enter opens the row (through the cc_open action), ctrl-r reloads, esc closes.
list=${1:-needs_me}

if [ "$2" = rows ]; then
  # One line per row: the row as base64 JSON, a tab, then the text that fzf shows.
  rex do "$list" rows=true | jq -r '
    {blocked: 31, error: 31, owner: 33, pr: 34, done: 32} as $color
    | .[] | (.title | split("  ")) as $t
    | [ (tojson | @base64),
        "\u001b[\($color[$t[0]] // 36)m\($t[0])\u001b[0m  \($t[1:] | join("  "))  \u001b[2m\(.detail // "")  \(.subtitle // "")\u001b[0m"
      ] | @tsv'
  exit
fi

sh "$0" "$list" rows | fzf --ansi --delimiter '\t' --with-nth 2 --no-sort --layout reverse \
  --header "$list   enter: open   ctrl-r: reload   esc: close" \
  --preview 'echo {1} | base64 -d | jq -r "(.subtitle // \"\"), \"\", ((.thread // .pane // {url}) | to_entries[] | \"\(.key): \(.value)\")"' \
  --preview-window 'down,8,wrap' \
  --bind "ctrl-r:reload(sh '$0' '$list' rows)" \
  --bind 'enter:execute-silent(echo {1} | base64 -d | jq -c "{row: .}" | rex do cc_open --args -)+abort'
