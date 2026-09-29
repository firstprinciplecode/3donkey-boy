-- Top-10 table rules, ported from src/hiscore.ts: three-letter names, one row per name holding its
-- best score. Shared so the server stores scores and the client ranks them the same way.

export type Entry = { name: string, score: number }

local HiScore = {}

HiScore.SIZE = 10
local NAME_LENGTH = 3
local LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

-- Three letters, A–Z. Short input is padded so the slot is never blank.
function HiScore.sanitizeName(raw: string): string
	local letters = string.sub(string.gsub(string.upper(raw), "[^A-Z]", ""), 1, NAME_LENGTH)
	return letters .. string.rep("A", NAME_LENGTH - #letters)
end

function HiScore.isName(raw: any): boolean
	return type(raw) == "string" and string.match(raw, "^[A-Z][A-Z][A-Z]$") ~= nil
end

function HiScore.cycleLetter(letter: string, delta: number): string
	local index = (string.find(LETTERS, letter, 1, true) or 1) - 1
	local next = (index + delta) % #LETTERS
	return string.sub(LETTERS, next + 1, next + 1)
end

-- One row per name, sorted high to low, trimmed to the table size.
function HiScore.normalize(entries: { Entry }): { Entry }
	local sorted = table.clone(entries)
	table.sort(sorted, function(a, b)
		return a.score > b.score
	end)
	local seen, out = {}, {}
	for _, entry in sorted do
		if entry.score > 0 and not seen[entry.name] then
			seen[entry.name] = true
			table.insert(out, { name = entry.name, score = math.floor(entry.score) })
			if #out == HiScore.SIZE then
				break
			end
		end
	end
	return out
end

function HiScore.bestFor(board: { Entry }, name: string): number
	for _, entry in board do
		if entry.name == name then
			return entry.score
		end
	end
	return 0
end

function HiScore.indexOf(board: { Entry }, name: string): number?
	for i, entry in board do
		if entry.name == name then
			return i
		end
	end
	return nil
end

function HiScore.top(board: { Entry }): number
	return if board[1] then board[1].score else 0
end

-- Where a new score would land (1-based), or nil if it misses the table. Ties rank below the older score.
function HiScore.insertionIndex(board: { Entry }, score: number): number?
	local points = math.floor(score)
	if points <= 0 then
		return nil
	end
	for i, entry in board do
		if points > entry.score then
			return i
		end
	end
	return if #board < HiScore.SIZE then #board + 1 else nil
end

-- Records a score under `name`. A name already on the table only moves up when the new score beats
-- its best (`improved` false returns the untouched board and that name's row).
function HiScore.insert(board: { Entry }, name: string, score: number): { board: { Entry }, index: number, improved: boolean }?
	local clean = HiScore.sanitizeName(name)
	local points = math.floor(score)
	local existing = HiScore.indexOf(board, clean)
	if existing and board[existing].score >= points then
		return { board = board, index = existing, improved = false }
	end
	local rest = {}
	for i, entry in board do
		if i ~= existing then
			table.insert(rest, entry)
		end
	end
	local index = HiScore.insertionIndex(rest, points)
	if not index then
		return nil
	end
	table.insert(rest, index, { name = clean, score = points })
	while #rest > HiScore.SIZE do
		table.remove(rest)
	end
	return { board = rest, index = index, improved = true }
end

return HiScore
