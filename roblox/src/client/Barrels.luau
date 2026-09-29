-- Barrels, ported from src/entities/barrels.ts.
--
-- Barrels roll either way around a ring (re-rolling their direction on each landing), dropping off
-- each ring's chute onto the ring below until the drum on the ground ring. Rings are loops, so every
-- barrel reaches a chute whichever way it goes, unless it rolls into a pit or takes a ladder first.
-- Positions are in game units with `pos` at the barrel's bottom; `render` draws them once a frame.
-- Each skin throws its own look (see Projectiles), which can change the size, speed and bounce.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Projectiles = require(Shared.Projectiles)
local Util = require(Shared.Util)

local Voxel = require(script.Parent.Voxel)

local BARREL = Config.BARREL
local STUD = Config.STUD
local R = BARREL.radius
local MAX_LIFETIME = 120
local SINK_TIME = 0.3
local SCORCH_RADIUS = 0.45
local SCORCH_BASE = Vector3.new(0.9, 0.08, 0.9)
local SCORCH_CORE = Vector3.new(0.45, 0.14, 0.45)

-- Piece offsets and sizes per look, in studs, matching the order of the parts `_acquire` builds.
type Layout = { offsets: { CFrame }, sizes: { Vector3 } }
local layoutByLook: { [string]: Layout } = {}
local function layoutFor(look: string): Layout
	local layout = layoutByLook[look]
	if not layout then
		layout = { offsets = {}, sizes = {} }
		for i, p in Projectiles.pieces(look) do
			layout.offsets[i] = p.at.Rotation + p.at.Position * STUD
			layout.sizes[i] = p.size * STUD
		end
		layoutByLook[look] = layout
	end
	return layout
end

-- Split halves are drawn smaller; `scale` is their size relative to a whole one.
local function resize(parts: { Part }, look: string, scale: number)
	for i, size in layoutFor(look).sizes do
		parts[i].Size = size * scale
	end
end

local Barrels = {}
Barrels.__index = Barrels

local function randomDir(): number
	return if math.random() < 0.5 then 1 else -1
end

function Barrels.new(level, parent: Instance)
	local self = setmetatable({}, Barrels)
	self.level = level
	self.env = nil
	self.look = "barrel"
	self.list = {}
	self.pool = {}
	self.speedMul = 1
	self.ladderChance = BARREL.ladderChance
	self.onDrum = nil :: ((any) -> ())?
	self.onPit = nil :: ((any) -> ())?
	self.onSplit = nil :: ((any) -> ())?
	self.onScorch = nil :: ((Vector3) -> ())?
	-- Burning patches left by lava rocks, reported like hazard dangers: { at, r } in game units.
	self.scorches = {}
	self.dangers = {}
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

-- Switch to another level. `env` is its Obstacles (gaps, carriers and locked ladders); `look` is a
-- Config.PROJECTILES key.
function Barrels:setLevel(level, env, look: string)
	self:clear()
	self.level = level
	self.env = env
	if look ~= self.look then
		for _, parts in self.pool do
			for _, part in parts do
				part:Destroy()
			end
		end
		table.clear(self.pool)
		table.clear(self.moveParts)
		table.clear(self.moveFrames)
		self.look = look
	end
end

-- The smash burst colours for the current look.
function Barrels:burst(): { Color3 }
	return Config.PROJECTILES[self.look].burst
end

-- Centre of a barrel's hit sphere, including any hop.
function Barrels.centre(b): Vector3
	return b.pos + Vector3.yAxis * (b.lift + b.radius)
end

function Barrels:_acquire(): { Part }
	local parts = table.remove(self.pool)
	if not parts then
		parts = {}
		for i, p in Projectiles.pieces(self.look) do
			parts[i] = Voxel.part(self.folder, p.size, p.color)
			Projectiles.dress(parts[i], p)
		end
	end
	-- Gumballs come out a different colour each throw.
	local colors = Config.PROJECTILES[self.look].colors
	if colors then
		parts[1].Color = colors[math.random(#colors)]
	end
	return parts
end

function Barrels:_release(b)
	if b.shownScale ~= 1 then
		resize(b.parts, self.look, 1)
	end
	for _, part in b.parts do
		table.insert(self.moveParts, part)
		table.insert(self.moveFrames, Voxel.HIDDEN)
	end
	table.insert(self.pool, b.parts)
end

function Barrels:_create(from: Vector3, ring: number, s: number, dir: number, yaw: number)
	local b = {
		parts = self:_acquire(),
		radius = R * Config.PROJECTILES[self.look].scale,
		-- Drawn size relative to a whole one, and whether it has split already (halves don't split again).
		scale = 1,
		shownScale = 1,
		split = false,
		-- Height above the walkway while hopping, and how far through the current hop it is.
		lift = 0,
		hop = 0,
		pos = from,
		state = "roll",
		ring = ring,
		s = s,
		dir = dir,
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
		yaw = yaw,
		scored = false,
		done = false,
	}
	table.insert(self.list, b)
	return b
end

-- Launch a barrel from `from` (the boss's hand) onto the top ring.
function Barrels:spawn(from: Vector3)
	local L = self.level
	local spawn = L.def.barrelSpawn
	local b = self:_create(from, spawn.ring, L:spotS(spawn), randomDir(), spawn.side * math.pi / 2)
	self:_startTransfer(b, from, spawn.ring, L:spotS(spawn), 0.8, 1.8)
end

-- A landing off a chute: pumpkins split into two smaller halves rolling opposite ways.
function Barrels:_land(b)
	local splits = Config.PROJECTILES[self.look].splits
	if splits and not b.split then
		b.split = true
		b.scale *= splits.scale
		b.radius *= splits.scale
		local twin = self:_create(b.pos, b.ring, b.s, -b.dir, b.yaw)
		twin.split = true
		twin.scale = b.scale
		twin.radius = b.radius
		twin.spin = b.spin + math.pi
		twin.age = b.age
		if self.onSplit then
			self.onSplit(b)
		end
	end
	local scorch = Config.PROJECTILES[self.look].scorch
	if scorch then
		self:_addScorch(b.pos, scorch.life)
		if self.onScorch then
			self.onScorch(b.pos)
		end
	end
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
	for _, s in self.scorches do
		s.base:Destroy()
		s.core:Destroy()
	end
	table.clear(self.scorches)
	table.clear(self.dangers)
end

function Barrels:_addScorch(at: Vector3, life: number)
	local base = Voxel.part(self.folder, SCORCH_BASE, Config.COLORS.lava)
	local core = Voxel.part(self.folder, SCORCH_CORE, Config.COLORS.yellow)
	base.Material = Enum.Material.Neon
	core.Material = Enum.Material.Neon
	base.CFrame = CFrame.new((at + Vector3.yAxis * 0.04) * STUD)
	core.CFrame = CFrame.new((at + Vector3.yAxis * 0.08) * STUD)
	table.insert(self.scorches, { base = base, core = core, at = at, life = life, fade = 1, flicker = 1 })
end

function Barrels:_updateScorches(dt: number)
	table.clear(self.dangers)
	for i = #self.scorches, 1, -1 do
		local s = self.scorches[i]
		s.life -= dt
		if s.life <= 0 then
			s.base:Destroy()
			s.core:Destroy()
			table.remove(self.scorches, i)
			continue
		end
		-- Flicker, then shrink away over the last half second so the end is readable.
		s.fade = math.min(1, s.life / 0.5)
		s.flicker = 1 + math.sin(s.life * 23) * 0.08
		table.insert(self.dangers, { at = s.at + Vector3.yAxis * 0.1, r = SCORCH_RADIUS * s.fade })
	end
end

function Barrels:update(dt: number)
	local speed = BARREL.baseSpeed * self.speedMul * Config.PROJECTILES[self.look].speed
	-- Splits add barrels mid-loop; they start moving next step.
	for i = 1, #self.list do
		local b = self.list[i]
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
	self:_updateScorches(dt)
end

function Barrels:_stepRoll(b, dt: number, speed: number)
	local L = self.level
	local delta = speed * dt
	local prev = b.s
	b.s = (b.s + b.dir * delta) % L:ringLength(b.ring)
	local spec = Config.PROJECTILES[self.look]
	local grow = spec.grow
	if grow then
		local base, max = R * spec.scale, R * grow.maxScale
		b.radius = math.min(max, b.radius + delta * (max - base) / grow.distance)
		b.scale = b.radius / base
	end
	local hop = spec.hop
	if hop then
		b.hop += delta / hop.every
		b.lift = hop.height * math.abs(math.sin(math.pi * b.hop))
	end
	b.spin -= b.dir * delta / b.radius

	local env = self.env
	for _, path in L.ladderPaths do
		if env and not env:isLadderOpen(path.index) then
			continue
		end
		if path.topS ~= nil and path.ladder.ring + 1 == b.ring and L:crossed(b.ring, prev, path.topS, delta, b.dir) and math.random() < self.ladderChance then
			b.state = "ladder"
			b.path = path
			b.d = path.length
			b.lift = 0
			return
		end
	end

	local chute = L.chuteByRing[b.ring]
	if chute and L:crossed(b.ring, prev, L:spotS(chute), delta, b.dir) then
		local below = b.ring - 1
		b.lift = 0
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

	-- Obstacles know about crumbled tiles and moving platforms too, not just pits.
	local overGap = if env then env:carry(b.ring, b.s) == nil else L:overGap(b.ring, b.s)
	if overGap then
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
		-- Only drops off a chute count as landings; the boss's lob onto the top ring doesn't.
		if b.arc == 0 then
			self:_land(b)
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
	local pieces = layoutFor(self.look).offsets
	for _, b in self.list do
		-- Growing snowballs only get resized once they've grown visibly.
		if math.abs(b.shownScale - b.scale) > 0.005 then
			b.shownScale = b.scale
			resize(b.parts, self.look, b.scale)
		end
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
		local center = Barrels.centre(b) * STUD
		local root = CFrame.new(center) * CFrame.Angles(0, b.yaw, 0) * CFrame.Angles(0, 0, b.spin)
		local scale = b.shownScale
		for i, part in b.parts do
			table.insert(parts, part)
			local offset = pieces[i]
			table.insert(frames, root * (if scale == 1 then offset else offset.Rotation + offset.Position * scale))
		end
	end
	for _, s in self.scorches do
		local k = s.fade * s.flicker
		s.base.Size = Vector3.new(SCORCH_BASE.X * k, SCORCH_BASE.Y, SCORCH_BASE.Z * k) * STUD
		s.core.Size = Vector3.new(SCORCH_CORE.X * k, SCORCH_CORE.Y, SCORCH_CORE.Z * k) * STUD
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(parts)
		table.clear(frames)
	end
end

return Barrels
