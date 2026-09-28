-- Living flame born when a barrel hits the drum, ported from src/entities/fire.ts. Wanders its ring,
-- turns back at gaps, and sometimes takes a ladder up or down.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local FIRE = Config.FIRE
local STUD = Config.STUD
local C = Config.COLORS

-- { size, centre above the feet, colour, glows }
local PARTS = {
	{ Vector3.new(0.6, 0.4, 0.6), Vector3.new(0, 0.2, 0), C.red, true },
	{ Vector3.new(0.46, 0.36, 0.46), Vector3.new(0, 0.55, 0), C.orange, true },
	{ Vector3.new(0.28, 0.3, 0.28), Vector3.new(0, 0.85, 0), C.yellow, true },
	{ Vector3.new(0.1, 0.12, 0.04), Vector3.new(-0.12, 0.45, 0.24), C.black, false },
	{ Vector3.new(0.1, 0.12, 0.04), Vector3.new(0.12, 0.45, 0.24), C.black, false },
}

local function randRange(lo: number, hi: number): number
	return lo + math.random() * (hi - lo)
end

local Fire = {}
Fire.__index = Fire

function Fire.new(level, parent: Instance)
	local self = setmetatable({}, Fire)
	self.level = level
	local drum = level.def.drum
	self.ring = drum.ring
	self.s = level:spotS(drum)
	self.dir = if math.random() < 0.5 then 1 else -1
	self.path = nil
	self.d = 0
	self.climbDir = 1
	self.turnClock = randRange(FIRE.minTurn, FIRE.maxTurn)
	self.t = math.random() * 10
	self.spawnT = 0
	-- Feet on the walkway, and the centre used for hits.
	self.feet = Vector3.zero
	self.position = Vector3.zero

	self.model = Instance.new("Model")
	self.model.Name = "Fire"
	self.parts = {}
	for _, spec in PARTS do
		local part = Voxel.part(self.model, spec[1], spec[3])
		if spec[4] then
			part.Material = Enum.Material.Neon
		end
		table.insert(self.parts, part)
	end
	self.cframes = table.create(#self.parts)
	self:_updatePosition()
	self.model.Parent = parent
	return self
end

function Fire:destroy()
	self.model:Destroy()
end

-- `env` is the level's obstacles: fires turn back at gaps and don't climb locked ladders.
function Fire:update(dt: number, env, speedMul: number)
	local L = self.level
	self.t += dt
	self.spawnT = math.min(1, self.spawnT + dt * 2.5)
	local speed = FIRE.speed * speedMul

	local path = self.path
	if path then
		self.d += self.climbDir * speed * 0.6 * dt
		if self.d >= path.length and path.topS ~= nil then
			self.ring = path.ladder.ring + 1
			self.s = path.topS
			self.path = nil
		elseif self.d <= 0 then
			self.ring = path.ladder.ring
			self.s = path.bottomS
			self.path = nil
		elseif self.d >= path.length then
			-- The summit ladder has no ring at the top, so turn back down.
			self.climbDir = -1
		end
		self:_updatePosition()
		return
	end

	self.turnClock -= dt
	if self.turnClock <= 0 then
		self.turnClock = randRange(FIRE.minTurn, FIRE.maxTurn)
		if math.random() < 0.45 then
			self.dir = -self.dir
		end
	end

	local delta = speed * dt
	local nextS = (self.s + self.dir * delta) % L:ringLength(self.ring)
	if env:carry(self.ring, nextS + self.dir * 0.4) == nil then
		self.dir = -self.dir
	else
		local prev = self.s
		self.s = nextS
		for _, p in L.ladderPaths do
			if p.topS ~= nil and env:isLadderOpen(p.index) and math.random() < FIRE.ladderChance then
				if p.ladder.ring == self.ring and L:crossed(self.ring, prev, p.bottomS, delta, self.dir) then
					self:_enterLadder(p, 0.01, 1)
					break
				end
				if p.ladder.ring + 1 == self.ring and L:crossed(self.ring, prev, p.topS, delta, self.dir) then
					self:_enterLadder(p, p.length - 0.01, -1)
					break
				end
			end
		end
	end
	self:_updatePosition()
end

function Fire:_enterLadder(path, d: number, dir: number)
	self.path = path
	self.d = d
	self.climbDir = dir
end

function Fire:_updatePosition()
	local L = self.level
	local x, y, z
	if self.path then
		x, y, z = self.path.point(self.d)
	else
		x, z = L:ringPoint(self.ring, self.s)
		y = L:tierTop(self.ring)
	end
	self.feet = Vector3.new(x, y, z)
	self.position = Vector3.new(x, y + 0.45, z)
end

function Fire:render()
	local flicker = 1 + math.sin(self.t * 22) * 0.08
	local wide = self.spawnT / flicker
	local tall = self.spawnT * flicker
	local scale = Vector3.new(wide, tall, wide)
	local root = CFrame.new(self.feet * STUD) * CFrame.Angles(0, self.t * 2, 0)
	for i, spec in PARTS do
		-- Parts can't be scaled as a group, so resize each one; there are only a few fires at a time.
		self.parts[i].Size = spec[1] * scale * STUD
		self.cframes[i] = root * CFrame.new(spec[2] * scale * STUD)
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Fire
