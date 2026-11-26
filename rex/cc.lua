-- Rex command center: two pick-lists, "Needs Me" and "Threads".
-- Rows are built at pick time from Rex program status, the timeline mod's logs and GitHub.
-- It stores nothing and never merges, approves or deletes.
local M = {}

local HOME = os.getenv("HOME") or ""
local TERM = "com.superlogical.terminal"
local DAY = 86400

-- ISO 8601 to Unix seconds. Rex's Lua has no date parser.
function M.epoch(iso)
  local y, mo, d, h, mi, s, rest = tostring(iso):match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)(.*)$")
  if not y then return nil end
  y, mo = tonumber(y), tonumber(mo)
  if mo <= 2 then y, mo = y - 1, mo + 12 end
  local days = 365 * y + math.floor(y / 4) - math.floor(y / 100) + math.floor(y / 400)
    + math.floor((153 * (mo - 3) + 2) / 5) + d - 719469
  local t = days * DAY + h * 3600 + mi * 60 + s
  local sign, oh, om = rest:match("([+-])(%d%d):?(%d%d)$")
  if sign then t = t - (sign == "-" and -1 or 1) * (oh * 3600 + om * 60) end
  return t
end

local function age(now, t)
  local s = math.max(0, now - t)
  if s < 3600 then return math.floor(s / 60) .. "m" end
  if s < DAY then return math.floor(s / 3600) .. "h" end
  return math.floor(s / DAY) .. "d"
end

-- True when a task's next step starts with the owner's first name, "Owner" or "User".
function M.owner_facing(step, me)
  local w = tostring(step or ""):match("^(%a+)")
  if not w then return false end
  w = w:lower()
  return w == "owner" or w == "user" or (me ~= nil and w == me:lower())
end

-- True when the step names pull requests ("#12" or "PR 12") and none of them is still open.
-- `open` is nil when GitHub could not be read; then nothing is cleared.
-- ponytail: PR numbers match across all repos, key by repo if stale rows survive.
function M.cleared(step, open)
  if not open then return false end
  local named = false
  for n in tostring(step or ""):gsub("PRs? (%d+)", "#%1"):gmatch("#(%d+)") do
    if open[n] then return false end
    named = true
  end
  return named
end

local function thread_row(word, e, t, now)
  return {
    title = word .. "  " .. e.repo .. " · " .. e.task,
    subtitle = e.next, detail = age(now, t), icon = "clock", at = t, thread = e,
  }
end

local function append_newest_first(rows, group)
  table.sort(group, function(a, b) return a.at > b.at end)
  for _, r in ipairs(group) do rows[#rows + 1] = r end
end

-- Needs Me: panes that wait, then tasks that hand the owner a step, then open pull requests.
function M.needs_rows(status, tasks, prs, me, now)
  local rows, group = {}, {}
  for _, r in ipairs(status) do
    if r.state == "blocked" or r.state == "error" or r.state == "done" then
      local t = M.epoch(r.updated_at) or now
      group[#group + 1] = {
        title = r.state .. "  " .. r.label .. " · " .. (r.app or "?"),
        subtitle = r.msg, detail = age(now, t), icon = "terminal", at = t, pane = r,
      }
    end
  end
  append_newest_first(rows, group)

  local open
  if prs then
    open = {}
    for _, p in ipairs(prs) do open[tostring(p.number)] = true end
  end
  group = {}
  for _, e in ipairs(tasks) do
    local t = M.epoch(e.at) or 0
    if now - t <= 7 * DAY and (e.status == "blocked" or M.owner_facing(e.next, me))
      and not M.cleared(e.next, open) then
      local r = thread_row("owner", e, t, now)
      r.icon = "person"
      group[#group + 1] = r
    end
  end
  append_newest_first(rows, group)

  group = {}
  for _, p in ipairs(prs or {}) do
    local t = M.epoch(p.updatedAt) or now
    group[#group + 1] = {
      title = "pr  " .. p.repository.name .. " #" .. p.number .. " · " .. p.title,
      subtitle = p.isDraft and "draft" or "ready", detail = age(now, t), icon = "branch", at = t, url = p.url,
    }
  end
  append_newest_first(rows, group)
  return rows
end

-- Threads: tasks still marked active in the last 30 days, almost-done first.
function M.thread_rows(tasks, now)
  local rows = {}
  for _, e in ipairs(tasks) do
    local t = M.epoch(e.at) or 0
    if e.status == "active" and now - t <= 30 * DAY then
      local done, total = tonumber(e.done) or 0, tonumber(e.total) or 0
      local r = thread_row(done .. "/" .. total, e, t, now)
      r.ratio = total > 0 and done / total or 0
      rows[#rows + 1] = r
    end
  end
  table.sort(rows, function(a, b)
    if a.ratio ~= b.ratio then return a.ratio > b.ratio end
    return a.at > b.at
  end)
  for i = #rows, 201, -1 do rows[i] = nil end
  return rows
end

local function exec_json(argv)
  local r, err = rex.exec(argv, { cwd = HOME, timeout = 10 })
  if not r then return nil, err end
  if not r.ok then return nil, r.stderr:match("[^\n]+") or ("exit " .. r.code) end
  return rex.json.decode(r.stdout)
end

local function read_prs()
  return exec_json({ "gh", "search", "prs", "--author=@me", "--state=open", "--limit", "100",
    "--json", "repository,number,title,url,isDraft,updatedAt" })
end

-- The newest main-loop work entry per repo and task from the timeline mod's logs.
local TASK_FILTER = [[select(.kind == "work" and .task != null and .agentId == null)
  | {repo: (input_filename | split("/")[-2] | sub("-[0-9a-f]{8}$"; "")),
     task, status, done, total, next, session, worktree, at}]]

local function read_tasks()
  return exec_json({ "sh", "-c",
    [[find "$1" -name '*.jsonl' -mtime -30 -print0 | xargs -0 jq -c "$2" |
      jq -sc 'group_by([.repo, .task]) | map(max_by(.at))']],
    "sh", HOME .. "/.claude/timelines", TASK_FILTER })
end

local function read_status()
  local out = {}
  local list = rex.call("session.list") or {}
  for _, s in ipairs(list.sessions or {}) do
    local view = rex.call("session.view", { session_id = s.session_id }) or {}
    for _, w in ipairs(view.windows or {}) do
      for _, layer in ipairs(w.layers or {}) do
        for _, b in ipairs(layer.blocks or {}) do
          local ps = rex.call(TERM .. ".program_status",
            { session_id = s.session_id, block_id = b.block_id, args = {} })
          for _, r in ipairs(ps and ps.records or {}) do
            out[#out + 1] = {
              state = r.state, app = r.app, msg = r.msg, updated_at = r.updated_at,
              label = w.label or s.label or "?",
              session_id = s.session_id, window_id = w.window_id, block_id = b.block_id,
            }
          end
        end
      end
    end
  end
  return out
end

local function go(row, ctx)
  if row.pane then
    local p = row.pane
    local _, err = rex.call("session.focus_block", { session_id = p.session_id, block_id = p.block_id })
    if err then error(err, 0) end
    if p.session_id ~= ctx.session_id then
      rex.client.queue("session.select", { session_id = p.session_id, window_id = p.window_id })
    end
  elseif row.thread then
    local e = row.thread
    -- A worktree that no longer exists makes Rex start the shell in the home directory.
    local w, err = rex.session.new_window{
      window_label = e.task:sub(1, 128),
      layout = rex.layout.block{ flavor = TERM .. ".shell", options = { cwd = e.worktree } },
    }
    if err then error(err, 0) end
    -- Typed, not run. The id comes from a log file, so only a plain id is typed.
    if tostring(e.session or ""):match("^[%w-]+$") then
      rex.block.call(TERM, "write", { block_id = w.block_ids[1], data = "claude --resume " .. e.session })
    end
  elseif row.url then
    local r = rex.exec({ "gh", "pr", "view", row.url, "--web" }, { cwd = HOME, timeout = 10 })
    if not (r and r.ok) then error("gh pr view: " .. (r and r.stderr or "did not run"), 0) end
  end
end

local function show(title, rows, ctx)
  local items = {}
  for i, r in ipairs(rows) do
    items[i] = { id = tostring(i), title = r.title, subtitle = r.subtitle, detail = r.detail, icon = r.icon }
  end
  local id, why = rex.ui.pick{ title = title, placeholder = "Filter", items = items }
  if id then return go(rows[tonumber(id)], ctx) end
  -- No app can show the list: return it, so `rex do <action>` prints it.
  if why == "unsupported" or why == "no_client" then return items end
end

local function error_row(source, err)
  return { title = "error  " .. source .. ": " .. tostring(err), icon = "tag" }
end

rex.action{
  name = "needs_me",
  title = "Needs Me",
  category = "Command Center",
  description = "Everything waiting on you: panes, timeline tasks and open pull requests.",
  run = function(ctx)
    local prs, pr_err = read_prs()
    local tasks, task_err = read_tasks()
    local name = rex.exec({ "git", "config", "--global", "user.name" }, { cwd = HOME })
    local me = name and name.stdout:match("^(%a+)")
    local rows = M.needs_rows(read_status(), tasks or {}, prs, me, os.time())
    -- A source that failed shows as a row. Rows are never silently missing.
    if not prs then rows[#rows + 1] = error_row("gh", pr_err) end
    if not tasks then rows[#rows + 1] = error_row("timeline", task_err) end
    return show("Needs me", rows, ctx)
  end,
}

rex.action{
  name = "threads",
  title = "Threads",
  category = "Command Center",
  description = "Timeline tasks still marked active in the last 30 days, almost-done first.",
  run = function(ctx)
    local tasks, task_err = read_tasks()
    local rows = M.thread_rows(tasks or {}, os.time())
    if not tasks then rows[#rows + 1] = error_row("timeline", task_err) end
    return show("Threads", rows, ctx)
  end,
}

return M
