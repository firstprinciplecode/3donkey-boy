-- Ground monster pacing a stretch of ring, ported from src/entities/crawler.ts. It turns back at gaps,
-- and every few seconds does its special move: snakes and scorpions stop and rear up (taller, harder
-- to jump), hedgehogs curl up and roll and penguins belly slide (both twice as fast, but low).

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

-- Waddles side to side, and belly slides (tipped flat on its front) for its special.
local function penguin(): Rig
	local parts = {}
	local function add(group, sx, sy, sz, color, x, y, z)
		table.insert(parts, { group = group, size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color })
	end
	add("body", 0.46, 0.66, 0.44, C.black, 0, 0.33, 0)
	add("body", 0.06, 0.5, 0.34, C.cream, 0.23, 0.3, 0)
	add("body", 0.16, 0.08, 0.12, C.orange, 0.3, 0.5, 0)
	add("body", 0.04, 0.08, 0.08, C.cream, 0.24, 0.6, 0.12)
	add("body", 0.04, 0.08, 0.08, C.cream, 0.24, 0.6, -0.12)
	add("body", 0.3, 0.06, 0.1, C.orange, 0.08, 0.03, 0.12)
	add("body", 0.3, 0.06, 0.1, C.orange, 0.08, 0.03, -0.12)
	add("body", 0.3, 0.1, 0.46, C.red, 0, 0.62, 0)
	add("flipperL", 0.3, 0.1, 0.06, C.black, 0, 0, 0)
	add("flipperR", 0.3, 0.1, 0.06, C.black, 0, 0, 0)
	return {
		parts = parts,
		rears = false,
		pose = function(t, special)
			local slide = if special > 0 then math.min(1, special * 5) * math.min(1, (1 - special) * 5) else 0
			local tilt = -slide * (math.pi / 2) + (1 - slide) * math.sin(t * 10) * 0.14
			local body = CFrame.new(0, slide * 0.22, 0) * CFrame.Angles(0, 0, tilt)
			local flap = math.sin(t * 10) * 0.4 * (1 - slide) + slide * 0.5
			return {
				body = { frame = body },
				flipperL = { frame = body * CFrame.new(0, 0.4, 0.25) * CFrame.Angles(flap, 0, 0) },
				flipperR = { frame = body * CFrame.new(0, 0.4, -0.25) * CFrame.Angles(-flap, 0, 0) },
			}
		end,
	}
end

-- Resizing to nearly nothing hides a group without touching Transparency every frame.
local HIDDEN_SCALE = Vector3.one * 0.001

local function rearAmount(special: number): number
	if special <= 0 then
		return 0
	end
	return math.sin(math.min(1, special * 1.6) * math.pi * 0.5) * (if special > 0.85 then (1 - special) / 0.15 else 1)
end

-- Slithers in a wave, and rears its head up high (harder to jump) for its special.
local function snake(): Rig
	local parts = {}
	local function add(group, sx, sy, sz, color, x, y, z)
		table.insert(parts, { group = group, size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color })
	end
	for i = 0, 5 do
		add(`seg{i}`, 0.3, 0.22, 0.24, if i % 2 == 1 then C.yellow else C.leaf, 0, 0, 0)
	end
	add("head", 0.38, 0.26, 0.32, C.leaf, 0.08, 0.13, 0)
	add("head", 0.08, 0.08, 0.04, C.yellow, 0.16, 0.2, 0.17)
	add("head", 0.08, 0.08, 0.04, C.yellow, 0.16, 0.2, -0.17)
	add("head", 0.04, 0.06, 0.05, C.black, 0.18, 0.2, 0.19)
	add("head", 0.04, 0.06, 0.05, C.black, 0.18, 0.2, -0.19)
	add("tongue", 0.18, 0.03, 0.06, C.red, 0.3, 0.05, 0)
	return {
		parts = parts,
		rears = true,
		pose = function(t, special)
			local rear = rearAmount(special)
			local poses = {}
			for i = 0, 5 do
				local z = math.sin(t * 9 - i * 1.1) * 0.12 * (1 - rear * 0.7)
				poses[`seg{i}`] = { frame = CFrame.new(-i * 0.26, 0.11 + math.max(0, rear * (0.8 - i * 0.28)), z) }
			end
			local head = CFrame.new(0.22, rear * 0.85, 0) * CFrame.Angles(0, 0, -rear * 0.35)
			poses.head = { frame = head }
			poses.tongue = { frame = head, scale = if math.sin(t * 6) > 0.3 or rear > 0.2 then nil else HIDDEN_SCALE }
			return poses
		end,
	}
end

-- Scuttles on six legs, and raises its claws and stinger (taller, harder to jump) for its special.
local function scorpion(): Rig
	local parts = {}
	local function add(group, sx, sy, sz, color, x, y, z)
		table.insert(parts, { group = group, size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color })
	end
	add("body", 0.62, 0.22, 0.44, C.rust, 0, 0.2, 0)
	add("body", 0.24, 0.18, 0.34, C.black, 0.38, 0.2, 0)
	local legs = {}
	for i = 0, 2 do
		for _, side in { -1, 1 } do
			local name = `leg{#legs}`
			table.insert(legs, { name = name, x = -0.15 + i * 0.16, z = side * 0.28 })
			add(name, 0.08, 0.2, 0.08, C.black, 0, 0, 0)
		end
	end
	add("claws", 0.28, 0.12, 0.12, C.rust, 0.62, 0.22, 0.2)
	add("claws", 0.28, 0.12, 0.12, C.rust, 0.62, 0.22, -0.2)
	add("claws", 0.14, 0.1, 0.18, C.lava, 0.8, 0.22, 0.2)
	add("claws", 0.14, 0.1, 0.18, C.lava, 0.8, 0.22, -0.2)
	add("tail", 0.16, 0.16, 0.16, C.rust, 0, 0.1, 0)
	add("tail", 0.16, 0.16, 0.16, C.rust, 0.02, 0.28, 0)
	add("tail", 0.16, 0.16, 0.16, C.rust, 0.12, 0.44, 0)
	-- Stepped stand-in for the web's stinger cone.
	add("tail", 0.14, 0.1, 0.14, C.yellow, 0.26, 0.49, 0)
	add("tail", 0.07, 0.1, 0.07, C.yellow, 0.26, 0.59, 0)
	return {
		parts = parts,
		rears = true,
		pose = function(t, special)
			local rear = if special > 0 then math.min(1, special * 3) * math.min(1, (1 - special) * 4) else 0
			local poses = {
				body = { frame = CFrame.identity },
				claws = { frame = CFrame.new(0, rear * 0.25, 0) * CFrame.Angles(0, 0, rear * 0.3) },
				tail = {
					frame = CFrame.new(-0.34, 0.24, 0) * CFrame.Angles(0, 0, -rear * 0.5 + math.sin(t * 3) * 0.08),
					scale = Vector3.one * (1 + rear * 0.6),
				},
			}
			for i, leg in legs do
				local lift = math.max(0, math.sin(t * 16 + (i - 1) * 1.3)) * 0.05 * (1 - rear)
				poses[leg.name] = { frame = CFrame.new(leg.x, 0.08 + lift, leg.z) }
			end
			return poses
		end,
	}
end

local RIGS: { [string]: () -> Rig } = { hedgehog = hedgehog, penguin = penguin, snake = snake, scorpion = scorpion }

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
