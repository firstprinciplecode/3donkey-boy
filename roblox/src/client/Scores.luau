-- The client's view of the shared hi-score table (server/Scores). Calls run off the frame loop and
-- report back through callbacks. With no server table (a smoke test, or the server failed), the
-- table lives only on this client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local HiScore = require(ReplicatedStorage:WaitForChild("Shared").HiScore)

local REMOTE_WAIT = 10

local Scores = {}
Scores.__index = Scores

function Scores.new()
	local self = setmetatable({}, Scores)
	self.board = {} :: { HiScore.Entry }
	self.name = nil :: string?
	self.remote = nil :: RemoteFunction?
	return self
end

function Scores:_remote(): RemoteFunction?
	if not self.remote then
		local found = ReplicatedStorage:WaitForChild("PopscotchScores", REMOTE_WAIT)
		if typeof(found) == "Instance" and found:IsA("RemoteFunction") then
			self.remote = found
		end
	end
	return self.remote
end

function Scores:_apply(reply: any)
	if type(reply) ~= "table" then
		return
	end
	if type(reply.board) == "table" then
		local entries = {}
		for _, row in reply.board do
			if type(row) == "table" and HiScore.isName(row.name) and type(row.score) == "number" then
				table.insert(entries, { name = row.name, score = row.score })
			end
		end
		self.board = HiScore.normalize(entries)
	end
	if HiScore.isName(reply.name) then
		self.name = reply.name
	end
end

-- Loads the table and this player's saved initials, then calls `done`.
function Scores:fetch(done: () -> ())
	task.spawn(function()
		local remote = self:_remote()
		if remote then
			local ok, reply = pcall(remote.InvokeServer, remote, "get")
			if ok then
				self:_apply(reply)
			end
		end
		done()
	end)
end

-- Records a score now so the table shows it straight away, then sends it on. `done` gets the
-- server's placement once it answers.
function Scores:submit(name: string, score: number, done: (index: number?) -> ())
	self.name = name
	local placed = HiScore.insert(self.board, name, score)
	if placed and placed.improved then
		self.board = placed.board
	end
	task.spawn(function()
		local remote = self:_remote()
		if not remote then
			return
		end
		local ok, reply = pcall(remote.InvokeServer, remote, "submit", name, score)
		if ok and type(reply) == "table" then
			self:_apply(reply)
			done(HiScore.indexOf(self.board, name))
		end
	end)
	return placed
end

return Scores
