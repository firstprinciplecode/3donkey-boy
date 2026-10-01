-- Spike totem from the poster, ported from src/entities/totem.ts. It plods along a stretch of ring
-- and every couple of seconds crouches and hops straight up. It's too tall to jump over: the way past
-- is to run underneath mid-hop, or smash it with the hammer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local TotemLooks = require(Shared.TotemLooks)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local TOTEM = Config.TOTEM

local LEG_X = { legL = -0.22, legR = 0.22 }

-- Flattens a look into { group, size, centre in the group's frame, colour }, with each leg part
-- repeated for both legs and cones turned into stepped stacks standing on their `at`.
local function flatten(look: string)
	local parts = {}
	for _, p in TotemLooks[look] or TotemLooks.spike do
		local groups = if p.group == "leg" then { "legL", "legR" } else { p.group }
		for _, group in groups do
			if p.shape == "box" then
				table.insert(parts, { group, p.size, p.at, p.color })
			else
				local radius, height = p.size.X, p.size.Y
				local n = if radius < 0.08 then 2 else 3
				local step = height / n
				for i = 0, n - 1 do
					local w = 2 * radius * (1 - i / n)
					table.insert(parts, { group, Vector3.new(w, step, w), p.at + Vector3.new(0, (i + 0.5) * step, 0), p.color })
				end
			end
		end
	end
	return parts
end

local PARTS_BY_LOOK = {}
local function partsFor(look: string)
	PARTS_BY_LOOK[look] = PARTS_BY_LOOK[look] or flatten(look)
	return PARTS_BY_LOOK[look]
end

local Totem = {}
Totem.__index = Totem

function Totem.new(level, patrol, speed: number, parent: Instance, look: string?)
	local self = setmetatable({}, Totem)
	self.spec = partsFor(look or "spike")
	self.level = level
	self.ring = patrol.ring
	self.s0 = level:sOf(patrol.ring, patrol.from[1], patrol.from[2])
	local s1 = level:sOf(patrol.ring, patrol.to[1], patrol.to[2])
	self.length = (s1 - self.s0) % level:ringLength(patrol.ring)
	self.speed = speed
	self.progress = self.length / 2
	self.dir = 1
	self.phase = "walk"
	self.phaseT = 0
	self.clock = TOTEM.hopEvery * (0.4 + math.random() * 0.6)
	self.t = math.random() * 10
	self.hop = 0
	self.squash = 0
	self.radius = TOTEM.radius
	-- Height of the hitbox bottom above the floor; the player fits underneath once this clears 1.5.
	self.clearance = 0
	self.scored = false
	-- True for the one update in which it lands, so the game can puff dust and shake the screen.
	self.landed = false
	-- Hit centres: the body, and a second sphere stacked on it so it can't be jumped.
	self.position = Vector3.zero
	self.head = Vector3.zero
	self.side = 0

	self.model = Instance.new("Model")
	self.model.Name = "Totem"
	self.parts = {}
	for _, spec in self.spec do
		table.insert(self.parts, Voxel.part(self.model, spec[2], spec[4]))
	end
	self.cframes = table.create(#self.parts)
	self:_place()
	self.model.Parent = parent
	return self
end

function Totem:isAirborne(): boolean
	return self.phase == "hop"
end

function Totem:destroy()
	self.model:Destroy()
end

function Totem:_enter(phase: string)
	self.phase = phase
	self.phaseT = 0
end

-- `env` answers `carry(ring, s)`, nil over a gap, so the totem turns back at pits.
function Totem:update(dt: number, env)
	local L = self.level
	self.t += dt
	self.phaseT += dt
	self.squash = 0
	self.landed = false
	if self.phase == "walk" then
		local nextProgress = self.progress + self.dir * self.speed * dt
		local ahead = (self.s0 + nextProgress + self.dir * 0.6) % L:ringLength(self.ring)
		if nextProgress > self.length or nextProgress < 0 or env:carry(self.ring, ahead) == nil then
			self.dir = -self.dir
		else
			self.progress = nextProgress
		end
		self.clock -= dt
		if self.clock <= 0 then
			self:_enter("crouch")
		end
	elseif self.phase == "crouch" then
		self.squash = math.min(1, self.phaseT / TOTEM.crouchTime)
		if self.phaseT >= TOTEM.crouchTime then
			self:_enter("hop")
		end
	else
		local u = self.phaseT / TOTEM.hopTime
		if u >= 1 then
			self:_enter("walk")
			self.clock = TOTEM.hopEvery * (0.8 + math.random() * 0.4)
			self.scored = false
			self.landed = true
		end
		self.hop = if u >= 1 then 0 else math.sin(u * math.pi) * TOTEM.hopHeight
	end
	if self.phase ~= "hop" then
		self.hop = 0
	end
	self:_place()
end

function Totem:_place()
	local L = self.level
	local x, z, side = L:ringPoint(self.ring, (self.s0 + self.progress) % L:ringLength(self.ring))
	local y = L:tierTop(self.ring) + self.hop
	self.side = side
	self.base = Vector3.new(x, y, z)
	self.clearance = self.hop + 0.35
	self.position = Vector3.new(x, y + 0.95, z)
	self.head = Vector3.new(x, y + 1.75, z)
end

function Totem:render()
	local walking = self.phase == "walk"
	local stride = if walking then math.sin(self.t * 9) else 0
	local lift = { legL = math.max(0, stride) * 0.12, legR = math.max(0, -stride) * 0.12 }
	-- Legs tuck up mid-hop.
	local tuck = if self.phase == "hop" then 0.12 else 0
	local k = self.squash
	local sx, sy = 1 + k * 0.12, 1 - k * 0.18
	local root = CFrame.new(self.base * STUD) * CFrame.Angles(0, self.side * math.pi / 2, 0)
	local body = root * CFrame.Angles(0, 0, if walking then math.sin(self.t * 9) * 0.04 else 0)
	for i, spec in self.spec do
		local group, at = spec[1], spec[3]
		local frame
		if group == "body" or group == "pupil" then
			local px = if group == "pupil" then at.X + self.dir * 0.06 else at.X
			frame = body * CFrame.new(px * sx * STUD, at.Y * sy * STUD, at.Z * sx * STUD)
		else
			frame = root * CFrame.new((LEG_X[group] + at.X) * STUD, (0.28 + lift[group] + tuck + at.Y) * STUD, at.Z * STUD)
		end
		self.cframes[i] = frame
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Totem
