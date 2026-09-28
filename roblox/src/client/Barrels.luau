-- Barrels, ported from src/entities/barrels.ts.
--
-- Barrels roll either way around a ring (re-rolling their direction on each landing), dropping off
-- each ring's chute onto the ring below until the drum on the ground ring. Rings are loops, so every
-- barrel reaches a chute whichever way it goes, unless it rolls into a pit or takes a ladder first.
-- Positions are in game units with `pos` at the barrel's bottom; `render` draws them once a frame.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Util = require(Shared.Util)

local Voxel = require(script.Parent.Voxel)

local BARREL = Config.BARREL
local STUD = Config.STUD
local R = BARREL.radius
local LENGTH = 0.8
local MAX_LIFETIME = 120
local SINK_TIME = 0.3
local STAVES = #Config.RAINBOW

-- Every piece is laid out in a frame whose Z axis is the barrel's axle. Roblox cylinders run along X.
local AXLE = CFrame.Angles(0, math.pi / 2, 0)
local PIECES = { AXLE }
for _, z in { -LENGTH / 2 + 0.05, LENGTH / 2 - 0.05 } do
	table.insert(PIECES, CFrame.new(0, 0, z * STUD) * AXLE)
end
for i = 1, STAVES do
	local angle = (i - 1) / STAVES * 2 * math.pi
	table.insert(PIECES, CFrame.Angles(0, 0, angle) * CFrame.new(0, (R - 0.03) * STUD, 0))
end

local Barrels = {}
Barrels.__index = Barrels

local function randomDir(): number
	return if math.random() < 0.5 then 1 else -1
end

function Barrels.new(level, parent: Instance)
	local self = setmetatable({}, Barrels)
	self.level = level
	self.list = {}
	self.pool = {}
	self.speedMul = 1
	self.ladderChance = BARREL.ladderChance
	self.onDrum = nil :: ((any) -> ())?
	self.onPit = nil :: ((any) -> ())?
	self.folder = Instance.new("Folder")
	self.folder.Name = "Barrels"
	self.folder.Parent = parent
	self.moveParts = {}
	self.moveFrames = {}
	return self
end

function Barrels:count(): number
	return #self.list
end

function Barrels:_acquire(): { Part }
	local parts = table.remove(self.pool)
	if parts then
		return parts
	end
	local C = Config.COLORS
	parts = {
		Voxel.part(self.folder, Vector3.new(LENGTH, R * 2 - 0.06, R * 2 - 0.06), C.charcoal, 0, Enum.PartType.Cylinder),
	}
	for _ = 1, 2 do
		table.insert(parts, Voxel.part(self.folder, Vector3.new(0.1, R * 2 + 0.04, R * 2 + 0.04), C.black, 0, Enum.PartType.Cylinder))
	end
	-- Rainbow staves around the barrel so the roll is readable.
	local width = 2 * math.pi * R / STAVES - 0.02
	for i = 1, STAVES do
		table.insert(parts, Voxel.part(self.folder, Vector3.new(width, 0.06, LENGTH * 0.86), Config.RAINBOW[i]))
	end
	return parts
end

function Barrels:_release(b)
	for _, part in b.parts do
		table.insert(self.moveParts, part)
		table.insert(self.moveFrames, Voxel.HIDDEN)
	end
	table.insert(self.pool, b.parts)
end

-- Launch a barrel from `from` (the boss's hand) onto the top ring.
function Barrels:spawn(from: Vector3)
	local L = self.level
	local spawn = L.def.barrelSpawn
	local b = {
		parts = self:_acquire(),
		radius = R,
		pos = from,
		state = "roll",
		ring = spawn.ring,
		s = L:spotS(spawn),
		dir = randomDir(),
		path = nil,
		d = 0,
		from = from,
		toRing = 0,
		toS = 0,
		t = 0,
		duration = 1,
		arc = 0,
		age = 0,
		spin = 0,
		yaw = spawn.side * math.pi / 2,
		scored = false,
		done = false,
	}
	self:_startTransfer(b, from, spawn.ring, L:spotS(spawn), 0.8, 1.8)
	table.insert(self.list, b)
end

-- Knocked out by the hammer; it's put back in the pool on the next update.
function Barrels:smash(b)
	b.done = true
end

function Barrels:clear()
	for _, b in self.list do
		self:_release(b)
	end
	table.clear(self.list)
end

function Barrels:update(dt: number)
	local speed = BARREL.baseSpeed * self.speedMul
	for _, b in self.list do
		if not b.done then
			b.age += dt
			if b.state == "roll" then
				self:_stepRoll(b, dt, speed)
			elseif b.state == "transfer" then
				self:_stepTransfer(b, dt)
			elseif b.state == "ladder" then
				self:_stepLadder(b, dt, speed)
			else
				self:_stepSink(b, dt)
			end
			if b.age > MAX_LIFETIME then
				b.done = true
			end
		end
	end
	for i = #self.list, 1, -1 do
		local b = self.list[i]
		if b.done then
			self:_release(b)
			table.remove(self.list, i)
		end
	end
end

function Barrels:_stepRoll(b, dt: number, speed: number)
	local L = self.level
	local delta = speed * dt
	local prev = b.s
	b.s = (b.s + b.dir * delta) % L:ringLength(b.ring)
	b.spin -= b.dir * delta / b.radius

	for _, path in L.ladderPaths do
		if path.topS ~= nil and path.ladder.ring + 1 == b.ring and L:crossed(b.ring, prev, path.topS, delta, b.dir) and math.random() < self.ladderChance then
			b.state = "ladder"
			b.path = path
			b.d = path.length
			return
		end
	end

	local chute = L.chuteByRing[b.ring]
	if chute and L:crossed(b.ring, prev, L:spotS(chute), delta, b.dir) then
		local below = b.ring - 1
		self:_startTransfer(b, b.pos, below, L:sOf(below, chute.side, chute.offset), 0.55, 0)
		return
	end

	local drum = L.def.drum
	if b.ring == drum.ring and L:crossed(b.ring, prev, L:spotS(drum), delta, b.dir) then
		b.done = true
		if self.onDrum then
			self.onDrum(b)
		end
		return
	end

	local x, z = L:ringPoint(b.ring, b.s)
	b.pos = Vector3.new(x, L:tierTop(b.ring), z)

	if L:overGap(b.ring, b.s) then
		b.state = "sink"
		b.t = 0
	end
end

function Barrels:_stepSink(b, dt: number)
	b.t += dt
	b.pos -= Vector3.yAxis * (Level.PIT_DEPTH / SINK_TIME) * dt
	if b.t >= SINK_TIME then
		b.done = true
		if self.onPit then
			self.onPit(b)
		end
	end
end

function Barrels:_startTransfer(b, from: Vector3, ring: number, s: number, duration: number, arc: number)
	b.state = "transfer"
	b.from = from
	b.toRing = ring
	b.toS = s
	b.t = 0
	b.duration = duration
	b.arc = arc
end

function Barrels:_stepTransfer(b, dt: number)
	local L = self.level
	b.t = math.min(1, b.t + dt / b.duration)
	local tx, tz = L:ringPoint(b.toRing, b.toS)
	local ty = L:tierTop(b.toRing)
	local t = b.t
	local f = b.from
	-- Lobbed barrels arc; barrels rolling off an edge accelerate downward.
	local y = if b.arc > 0 then f.Y + (ty - f.Y) * t + math.sin(math.pi * t) * b.arc else f.Y + (ty - f.Y) * t ^ 3
	b.pos = Vector3.new(f.X + (tx - f.X) * t, y, f.Z + (tz - f.Z) * t)
	b.spin += dt * 8
	if b.t >= 1 then
		b.state = "roll"
		b.ring = b.toRing
		b.s = b.toS
		if math.random() < BARREL.flipChance then
			b.dir = -b.dir
		end
	end
end

function Barrels:_stepLadder(b, dt: number, speed: number)
	local path = b.path
	if not path then
		b.state = "roll"
		return
	end
	b.d -= speed * 0.7 * dt
	b.spin += speed * dt / b.radius
	if b.d <= 0 then
		b.state = "roll"
		b.ring = path.ladder.ring
		b.s = path.bottomS
		b.path = nil
		if math.random() < BARREL.flipChance then
			b.dir = -b.dir
		end
		return
	end
	local x, y, z = path.point(b.d)
	b.pos = Vector3.new(x, y, z)
end

function Barrels:render(dt: number)
	local L = self.level
	local parts, frames = self.moveParts, self.moveFrames
	for _, b in self.list do
		local side
		if b.state == "ladder" and b.path then
			side = b.path.ladder.side
		elseif b.state == "transfer" then
			side = select(3, L:ringPoint(b.toRing, b.toS))
		else
			side = select(3, L:ringPoint(b.ring, b.s))
		end
		-- Axle along the outward normal so it rolls along the ring; along the wall when on a ladder.
		local yaw = side * math.pi / 2 + (if b.state == "ladder" then math.pi / 2 else 0)
		b.yaw = Util.dampAngle(b.yaw, yaw, 20, dt)
		local center = (b.pos + Vector3.yAxis * b.radius) * STUD
		local root = CFrame.new(center) * CFrame.Angles(0, b.yaw, 0) * CFrame.Angles(0, 0, b.spin)
		for i, part in b.parts do
			table.insert(parts, part)
			table.insert(frames, root * PIECES[i])
		end
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(parts)
		table.clear(frames)
	end
end

return Barrels
