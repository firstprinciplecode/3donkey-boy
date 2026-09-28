-- Ground monster pacing a stretch of ring, ported from src/entities/crawler.ts. It turns back at gaps,
-- and every few seconds does its special move: hedgehogs curl up and roll (twice as fast, but low).
-- Snakes, scorpions and penguins join with the levels that use them.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local CRAWLER = Config.CRAWLER
local STUD = Config.STUD

-- A rig is a list of parts, each in a named group, plus a pose function that places the groups.
-- Part: { group, size, centre in the group's frame, colour }. Local +x is the way it's walking.
type PartSpec = { group: string, size: Vector3, at: Vector3, color: Color3 }
type Pose = { frame: CFrame, scale: Vector3? }
type Rig = { parts: { PartSpec }, pose: (t: number, special: number) -> { [string]: Pose }, rears: boolean }

local function hedgehog(): Rig
	local parts = {}
	-- The body hangs 0.22 below the pivot it curls around.
	local function add(sx, sy, sz, color, x, y, z)
		table.insert(parts, { group = "pivot", size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y - 0.22, z), color = color })
	end
	add(0.56, 0.38, 0.46, C.brown, 0, 0.21, 0)
	add(0.2, 0.24, 0.3, C.tan, 0.32, 0.16, 0)
	add(0.08, 0.08, 0.08, C.black, 0.44, 0.18, 0)
	add(0.04, 0.06, 0.05, C.black, 0.34, 0.26, 0.1)
	add(0.04, 0.06, 0.05, C.black, 0.34, 0.26, -0.1)
	-- Two-step stand-ins for the web's spike cones, standing on y = 0.34.
	for i = 0, 2 do
		for j = -1, 1 do
			local color = if i % 2 == 1 then C.cream else C.rust
			local x, z = -0.2 + i * 0.16, j * 0.14
			add(0.16, 0.11, 0.16, color, x, 0.34 + 0.055, z)
			add(0.08, 0.11, 0.08, color, x, 0.34 + 0.165, z)
		end
	end
	return {
		parts = parts,
		rears = false,
		pose = function(t, special)
			local curl = if special > 0 then math.min(1, special * 5) * math.min(1, (1 - special) * 5) else 0
			local spin = if curl > 0.5 then -t * 14 else math.sin(t * 12) * 0.05
			return {
				pivot = {
					frame = CFrame.new(0, 0.24 + curl * 0.04, 0) * CFrame.Angles(0, 0, spin),
					scale = Vector3.new(1 - curl * 0.25, 1 + curl * 0.15, 1),
				},
			}
		end,
	}
end

local RIGS: { [string]: () -> Rig } = { hedgehog = hedgehog }

local Crawler = {}
Crawler.__index = Crawler

function Crawler.new(level, patrol, look: string, speed: number, parent: Instance)
	local makeRig = RIGS[look]
	assert(makeRig, `Crawler "{look}" isn't ported yet`)
	local self = setmetatable({}, Crawler)
	self.level = level
	self.ring = patrol.ring
	self.s0 = level:sOf(patrol.ring, patrol.from[1], patrol.from[2])
	local s1 = level:sOf(patrol.ring, patrol.to[1], patrol.to[2])
	self.length = (s1 - self.s0) % level:ringLength(patrol.ring)
	self.speed = speed
	self.progress = self.length / 2
	self.dir = 1
	self.t = math.random() * 10
	self.specialClock = CRAWLER.rearEvery * (0.5 + math.random())
	self.specialT = -1
	self.special = 0
	self.radius = CRAWLER.radius
	-- Top of the body above the floor, for jump-over scoring.
	self.height = 0.7
	self.scored = false
	-- Centre of the hitbox, and the floor spot it stands on.
	self.position = Vector3.zero
	self.base = Vector3.zero
	self.side = 0
	self.up = 0

	self.rig = makeRig()
	self.model = Instance.new("Model")
	self.model.Name = "Crawler"
	self.parts = {}
	for _, spec in self.rig.parts do
		table.insert(self.parts, Voxel.part(self.model, spec.size, spec.color))
	end
	self.cframes = table.create(#self.parts)
	self.scales = {}
	self:_place()
	self.model.Parent = parent
	return self
end

function Crawler:destroy()
	self.model:Destroy()
end

-- `env` answers `carry(ring, s)`, nil over a gap, so it turns back at pits.
function Crawler:update(dt: number, env)
	self.t += dt
	local special = if self.specialT >= 0 then self.specialT / CRAWLER.rearTime else 0
	if self.specialT >= 0 then
		self.specialT += dt
		if self.specialT >= CRAWLER.rearTime then
			self.specialT = -1
			self.specialClock = CRAWLER.rearEvery * (0.7 + math.random() * 0.6)
		end
	else
		self.specialClock -= dt
		if self.specialClock <= 0 then
			self.specialT = 0
		end
	end

	local rears = self.rig.rears
	if self.specialT < 0 or not rears then
		local speed = self.speed * (if self.specialT >= 0 then 2 else 1)
		local nextProgress = self.progress + self.dir * speed * dt
		local L = self.level
		local ahead = (self.s0 + nextProgress + self.dir * 0.5) % L:ringLength(self.ring)
		if nextProgress > self.length or nextProgress < 0 or env:carry(self.ring, ahead) == nil then
			self.dir = -self.dir
		else
			self.progress = nextProgress
		end
	end

	local up = if rears and self.specialT >= 0 then math.sin(math.min(1, special * 1.6) * math.pi * 0.5) else 0
	self.height = 0.7 + up * 0.5
	self.radius = CRAWLER.radius + up * 0.1
	self.special = if self.specialT >= 0 then math.max(0.001, special) else 0
	self.up = up
	self:_place()
end

function Crawler:_place()
	local L = self.level
	local x, z, side = L:ringPoint(self.ring, (self.s0 + self.progress) % L:ringLength(self.ring))
	local y = L:tierTop(self.ring)
	self.side = side
	self.base = Vector3.new(x, y, z)
	self.position = Vector3.new(x, y + 0.35 + self.up * 0.3, z)
end

function Crawler:render()
	local poses = self.rig.pose(self.t, self.special)
	local yaw = self.side * math.pi / 2 + (if self.dir > 0 then 0 else math.pi)
	local root = CFrame.new(self.base * STUD) * CFrame.Angles(0, yaw, 0)
	for i, spec in self.rig.parts do
		local pose = poses[spec.group]
		local scale = pose.scale or Vector3.one
		-- Resizing is slow, so only touch parts whose group scale changed.
		if self.scales[i] ~= scale then
			self.scales[i] = scale
			self.parts[i].Size = spec.size * scale * STUD
		end
		local at = spec.at * scale
		local frame = pose.frame
		self.cframes[i] = root * (frame.Rotation + frame.Position * STUD) * CFrame.new(at * STUD)
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Crawler
