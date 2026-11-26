-- Self-check for cc.lua. Run from this folder: rex do cc_check.lua
local cc = require("cc")

assert(cc.epoch("1970-01-01T00:00:00Z") == 0)
assert(cc.epoch("2024-03-01T00:00:00Z") == 1709251200)
assert(cc.epoch("2026-11-26T08:28:11.466731-06:00") == cc.epoch("2026-11-26T14:28:11Z"))
assert(cc.epoch("not a date") == nil)

assert(cc.owner_facing("Sam merges the PR.", "Sam"))
assert(cc.owner_facing("Owner decides.", nil))
assert(not cc.owner_facing("Samantha reviews.", "Sam"))
assert(not cc.owner_facing("Run the tests.", "Sam"))

assert(cc.cleared("Owner merges PR 99.", { ["12"] = true }))
assert(not cc.cleared("Owner merges PR 12 and #99.", { ["12"] = true }))
assert(not cc.cleared("Owner decides.", { ["12"] = true }))
assert(not cc.cleared("Owner merges #99.", nil))

local now = cc.epoch("2026-11-26T12:00:00Z")
local tasks = {
  { repo = "app", task = "ship", status = "done", done = 3, total = 3,
    next = "Sam merges #12.", at = "2026-11-25T12:00:00.000Z" },
  { repo = "app", task = "gone", status = "blocked", done = 1, total = 2,
    next = "Owner merges #99.", at = "2026-11-26T09:00:00.000Z" },
  { repo = "app", task = "old", status = "blocked", done = 1, total = 2,
    next = "Owner decides on #7.", at = "2026-11-22T12:00:00.000Z" },
  { repo = "app", task = "wip", status = "active", done = 4, total = 5,
    next = "Run the tests.", at = "2026-11-26T11:00:00.000Z" },
  { repo = "app", task = "early", status = "active", done = 1, total = 5,
    next = "Read the spec.", at = "2026-11-26T11:30:00.000Z" },
}
local prs = {
  { number = 12, title = "Ship it", url = "https://example.test/pull/12", isDraft = false,
    updatedAt = "2026-11-26T10:00:00Z", repository = { name = "app" } },
  { number = 7, title = "Stale", url = "https://example.test/pull/7", isDraft = true,
    updatedAt = "2026-11-01T10:00:00Z", repository = { name = "app" } },
}
local status = {
  { state = "working", label = "web", app = "codex", updated_at = "2026-11-26T11:59:00Z" },
  { state = "blocked", label = "api", app = "claude-code", msg = "Permission?",
    updated_at = "2026-11-26T11:50:00Z" },
}

local rows = cc.needs_rows(status, tasks, prs, "Sam", now)
-- Left out: the task older than 3 days and the PR untouched for 14 days.
assert(#rows == 3, "blocked pane, owner task, open PR")
assert(rows[1].title == "blocked  api · claude-code" and rows[1].detail == "10m")
assert(rows[2].title == "owner  app · ship" and rows[2].detail == "1d")
assert(rows[3].title == "pr  app #12 · Ship it" and rows[3].subtitle == "ready")

-- GitHub unreadable: the task that names a closed PR stays, because nothing can be cleared.
rows = cc.needs_rows({}, tasks, nil, "Sam", now)
assert(#rows == 2 and rows[1].thread.task == "gone" and rows[2].thread.task == "ship")

rows = cc.thread_rows(tasks, now)
assert(#rows == 2 and rows[1].title == "4/5  app · wip" and rows[2].title == "1/5  app · early")

print("cc_check: ok")
