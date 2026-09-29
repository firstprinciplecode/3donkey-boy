-- The shared hi-score table. Scores live in an OrderedDataStore keyed by initials, and each
-- player's last initials in a DataStore, so returning players don't retype them.
--
-- DataStores only work in a published place (and in Studio only with API access turned on), so any
-- failure falls back to an in-memory table that lasts as long as this server.
--
-- The round runs on the client, so a submitted score can't be proven. The server keeps it
-- plausible (a cap, one submit per game) rather than trusting it outright.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local HiScore = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("HiScore"))

local BOARD_STORE = "PopscotchHiScores_v1"
local NAME_STORE = "PopscotchPlayers_v1"
local REFRESH_EVERY = 60
local MAX_SCORE = 10000000
local SUBMIT_COOLDOWN = 15

local Scores = {}

local ordered: OrderedDataStore? = nil
local names: DataStore? = nil
local board: { HiScore.Entry } = {}
local memoryNames: { [number]: string } = {}
local lastSubmit: { [number]: number } = {}

local function openStores()
	local ok, err = pcall(function()
		ordered = DataStoreService:GetOrderedDataStore(BOARD_STORE)
		names = DataStoreService:GetDataStore(NAME_STORE)
	end)
	if not ok then
		warn(`[popscotch] hi-scores stay in memory: {err}`)
		ordered, names = nil, nil
	end
end

local function refresh()
	local store = ordered
	if not store then
		return
	end
	local ok, result = pcall(function()
		local page = store:GetSortedAsync(false, HiScore.SIZE):GetCurrentPage()
		local entries = {}
		for _, row in page do
			if HiScore.isName(row.key) then
				table.insert(entries, { name = row.key, score = row.value })
			end
		end
		return entries
	end)
	if ok then
		board = HiScore.normalize(result)
	else
		warn(`[popscotch] couldn't read hi-scores, keeping the last table: {result}`)
		-- An unpublished place, or Studio without API access, fails every call; stop retrying.
		local message = tostring(result)
		for _, sign in { "403", "API", "publish" } do
			if string.find(message, sign, 1, true) then
				ordered, names = nil, nil
				break
			end
		end
	end
end

local function nameFor(player: Player): string?
	local cached = memoryNames[player.UserId]
	if cached then
		return cached
	end
	local store = names
	if not store then
		return nil
	end
	local ok, value = pcall(function()
		return store:GetAsync(`u{player.UserId}`)
	end)
	if ok and HiScore.isName(value) then
		memoryNames[player.UserId] = value
		return value
	end
	return nil
end

local function save(player: Player, name: string, score: number)
	memoryNames[player.UserId] = name
	local store, nameStore = ordered, names
	if store then
		local ok, err = pcall(function()
			store:UpdateAsync(name, function(old)
				return math.max(tonumber(old) or 0, score)
			end)
		end)
		if not ok then
			warn(`[popscotch] couldn't save a hi-score: {err}`)
		end
	end
	if nameStore then
		pcall(function()
			nameStore:SetAsync(`u{player.UserId}`, name)
		end)
	end
end

local function onRequest(player: Player, action: any, name: any, score: any)
	if action == "get" then
		return { board = board, name = nameFor(player) }
	end
	if action ~= "submit" or not HiScore.isName(name) or type(score) ~= "number" then
		return nil
	end
	local now = os.clock()
	if lastSubmit[player.UserId] and now - lastSubmit[player.UserId] < SUBMIT_COOLDOWN then
		return { board = board, name = nameFor(player) }
	end
	lastSubmit[player.UserId] = now
	local points = math.clamp(math.floor(score), 0, MAX_SCORE)
	local placed = HiScore.insert(board, name, points)
	if placed and placed.improved then
		board = placed.board
		task.spawn(save, player, name, points)
	else
		memoryNames[player.UserId] = name
		if names then
			task.spawn(function()
				pcall(function()
					(names :: DataStore):SetAsync(`u{player.UserId}`, name)
				end)
			end)
		end
	end
	return { board = board, name = name, index = if placed then placed.index else nil, improved = placed ~= nil and placed.improved }
end

function Scores.start()
	local remote = Instance.new("RemoteFunction")
	remote.Name = "PopscotchScores"
	remote.OnServerInvoke = onRequest
	remote.Parent = ReplicatedStorage

	openStores()
	refresh()
	task.spawn(function()
		while ordered do
			task.wait(REFRESH_EVERY)
			refresh()
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		memoryNames[player.UserId] = nil
		lastSubmit[player.UserId] = nil
	end)
end

return Scores
