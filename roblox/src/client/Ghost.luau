-- Glass-headed flying critter, ported from src/entities/ghost.ts. Patrols a stretch of one ring back
-- and forth, flying over pits.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local C = Config.COLORS
local B = C.black

local WING_PIVOTS = {
	wingL = Vector3.new(-0.4, 0.05, 0),
	wingR = Vector3.new(0.4, 0.05, 0),
}

-- { group, size, centre in the group's frame, colour, transparency }
local PARTS = {
	{ "body", Vector3.new(0.8, 0.6, 0.6), Vector3.zero, B, 0 },
	{ "body", Vector3.new(0.36, 0.22, 0.3), Vector3.new(0, 0.46, 0), C.charcoal, 0 },
	{ "body", Vector3.new(0.72, 0.46, 0.58), Vector3.new(0, 0.5, 0), C.cyan, 0.45 },
	{ "body", Vector3.new(0.14, 0.14, 0.04), Vector3.new(-0.18, 0.08, 0.31), C.pink, 0 },
	{ "body", Vector3.new(0.14, 0.14, 0.04), Vector3.new(0.18, 0.08, 0.31), C.pink, 0 },
	{ "wingL", Vector3.new(0.5, 0.1, 0.4), Vector3.new(-0.25, 0, 0), B, 0 },
	{ "wingL", Vector3.new(0.25, 0.1, 0.3), Vector3.new(-0.55, -0.1, 0), B, 0 },
	{ "wingR", Vector3.new(0.5, 0.1, 0.4), Vector3.new(0.25, 0, 0), B, 0 },
	{ "wingR", Vector3.new(0.25, 0.1, 0.3), Vector3.new(0.55, -0.1, 0), B, 0 },
}
for i = 0, 3 do
	table.insert(PARTS, { "body", Vector3.new(0.07, 0.12, 0.04), Vector3.new(-0.21 + i * 0.14, -0.16, 0.31), C.cream, 0 })
end
for _, sx in { -0.28, 0, 0.28 } do
	table.insert(PARTS, { "body", Vector3.new(0.1, 0.2, 0.1), Vector3.new(sx, -0.38, 0), B, 0 })
end

local Ghost = {}
Ghost.__index = Ghost

function Ghost.new(level, patrol, speed: number, parent: Instance)
	local self = setmetatable({}, Ghost)
	self.level = level
	self.ring = patrol.ring
	self.s0 = level:sOf(patrol.ring, patrol.from[1], patrol.from[2])
	local s1 = level:sOf(patrol.ring, patrol.to[1], patrol.to[2])
	self.length = (s1 - self.s0) % level:ringLength(patrol.ring)
	self.speed = speed
	self.progress = self.length / 2
	self.dir = 1
	self.t = math.random() * 10
	self.side = 0
	-- Centre of the body, used for hits.
	self.position = Vector3.zero

	self.model = Instance.new("Model")
	self.model.Name = "Ghost"
	self.parts = {}
	self.entries = {}
	for _, spec in PARTS do
		table.insert(self.parts, Voxel.part(self.model, spec[2], spec[4], spec[5]))
		table.insert(self.entries, { group = spec[1], offset = CFrame.new(spec[3] * STUD) })
	end
	self.cframes = table.create(#self.parts)
	self.frames = {}
	self:update(0)
	self.model.Parent = parent
	return self
end

function Ghost:destroy()
	self.model:Destroy()
end

function Ghost:update(dt: number)
	self.t += dt
	self.progress += self.dir * self.speed * dt
	if self.progress > self.length then
		self.progress = self.length
		self.dir = -1
	elseif self.progress < 0 then
		self.progress = 0
		self.dir = 1
	end
	local L = self.level
	local x, z, side = L:ringPoint(self.ring, (self.s0 + self.progress) % L:ringLength(self.ring))
	local y = L:tierTop(self.ring) + 0.75 + math.sin(self.t * 3) * 0.2
	self.position = Vector3.new(x, y, z)
	self.side = side
end

function Ghost:render()
	local flap = math.sin(self.t * 18) * 0.6
	local yaw = self.side * math.pi / 2 + (if self.dir > 0 then 0.5 else -0.5)
	local frames = self.frames
	frames.body = CFrame.new(self.position * STUD) * CFrame.Angles(0, yaw, 0)
	frames.wingL = frames.body * CFrame.new(WING_PIVOTS.wingL * STUD) * CFrame.Angles(0, 0, flap)
	frames.wingR = frames.body * CFrame.new(WING_PIVOTS.wingR * STUD) * CFrame.Angles(0, 0, -flap)
	for i, entry in self.entries do
		self.cframes[i] = frames[entry.group] * entry.offset
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Ghost
