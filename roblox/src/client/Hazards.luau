-- Timed fire jets and drops that fall when you walk underneath, ported from src/hazards.ts.
-- Jets rumble, then erupt on a fixed beat. Drops hang from a bracket under the tier above, shake
-- loose when you come close, fall, shatter on the walkway and grow back a few seconds later.
--
-- Dangers are reported each step; they hurt even while you hold the hammer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local HAZARDS = Config.HAZARDS
local STUD = Config.STUD

-- `glow` pieces are Neon, standing in for the web's emissive materials.
type Box = { size: Vector3, at: Vector3, color: Color3, glow: boolean? }

local function box(sx, sy, sz, color, x, y, z, glow: boolean?): Box
	return { size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color, glow = glow }
end

local function makePart(parent: Instance, b: Box): Part
	local part = Voxel.part(parent, b.size, b.color)
	if b.glow then
		part.Material = Enum.Material.Neon
	end
	return part
end

-- The bracket's length and centre, sticking out from the lip of the tier above over the walkway.
local function bracket(depth: number): (number, number)
	local len = depth / 2 + 0.5
	return len, -depth / 2 + len / 2
end

-- How far each drop reaches below its hanging point, and what it breaks into. The ledge and drop
-- are laid out with local +z outward; the web's downward cones are stepped boxes here.
local LOOKS = {
	icicle = {
		reach = 0.9,
		shards = { C.ice, C.snow, C.iceDark },
		ledge = function(depth: number): { Box }
			local len, z = bracket(depth)
			return {
				box(1.2, 0.18, len, C.snow, 0, -0.09, z),
				box(1.3, 0.08, len + 0.1, C.snowShade, 0, -0.2, z),
			}
		end,
		drop = {
			box(0.36, 0.3, 0.36, C.ice, 0, -0.15, 0),
			box(0.24, 0.3, 0.24, C.ice, 0, -0.45, 0),
			box(0.12, 0.3, 0.12, C.ice, 0, -0.75, 0),
			box(0.2, 0.28, 0.2, C.iceDark, 0.24, -0.14, 0.08),
			box(0.1, 0.27, 0.1, C.iceDark, 0.24, -0.415, 0.08),
		},
	},
	acorn = {
		reach = 0.35,
		shards = { C.brown, C.tan, C.orange },
		ledge = function(depth: number): { Box }
			local len, z = bracket(depth)
			return {
				box(0.22, 0.2, len, C.brown, 0, -0.1, z),
				box(0.9, 0.3, 0.9, C.maple, 0, 0.05, 0.1),
				box(0.6, 0.25, 0.6, C.orange, 0.2, 0.2, -0.1),
			}
		end,
		drop = {
			box(0.34, 0.14, 0.34, C.brown, 0, 0.02, 0),
			box(0.28, 0.3, 0.28, C.tan, 0, -0.2, 0),
			box(0.06, 0.1, 0.06, C.brown, 0, 0.12, 0),
		},
	},
	spike = {
		reach = 0.8,
		shards = { C.stone, C.sandstone, C.stoneDark },
		ledge = function(depth: number): { Box }
			local len, z = bracket(depth)
			return {
				box(1.2, 0.22, len, C.sandstoneDark, 0, -0.11, z),
				box(0.3, 0.1, 0.3, C.gold, 0, 0.02, z),
			}
		end,
		drop = {
			box(0.4, 0.27, 0.4, C.stone, 0, -0.135, 0),
			box(0.26, 0.27, 0.26, C.stone, 0, -0.4, 0),
			box(0.12, 0.26, 0.12, C.stone, 0, -0.665, 0),
		},
	},
	lavarock = {
		reach = 0.35,
		shards = { C.lava, C.orange, C.basalt },
		ledge = function(depth: number): { Box }
			local len, z = bracket(depth)
			return {
				box(1.1, 0.24, len, C.basalt, 0, -0.12, z),
				box(0.4, 0.06, 0.4, C.lava, 0, -0.26, 0, true),
			}
		end,
		drop = {
			box(0.46, 0.4, 0.42, C.basalt, 0, -0.15, 0),
			box(0.22, 0.2, 0.44, C.lava, 0.1, -0.1, 0, true),
		},
	},
}

-- Vent grate plus a full-height flame column that's squashed flat until it erupts.
local JET_H = HAZARDS.jetHeight
local VENT = box(1, 0.1, 1, C.charcoal, 0, 0.05, 0)
local GRILLE = {
	box(0.7, 0.02, 0.12, C.black, 0, 0.11, -0.2),
	box(0.7, 0.02, 0.12, C.black, 0, 0.11, 0.2),
}
local FLAME = {
	box(0.7, JET_H * 0.4, 0.7, C.red, 0, JET_H * 0.2, 0, true),
	box(0.52, JET_H * 0.35, 0.52, C.orange, 0, JET_H * 0.575, 0, true),
	box(0.32, JET_H * 0.25, 0.32, C.yellow, 0, JET_H * 0.875, 0, true),
}
local FLAT = 0.001

-- Drops scale in over this long after they (re)appear, and can't trigger until they're grown.
local GROW_TIME = 0.5
local SHAKE_RATE, SHAKE_SWAY = 70, 0.05

local Hazards = {}
Hazards.__index = Hazards

function Hazards.new(level, look: string, parent: Instance)
	local self = setmetatable({}, Hazards)
	self.level = level
	self.folder = Instance.new("Folder")
	self.folder.Name = "Hazards"
	self.clock = 0
	self.jets = {}
	self.drops = {}
	-- { at: Vector3, r: number, kind: "jet" | "drop" } in game units.
	self.dangers = {}
	for _, def in level.def.jets or {} do
		self:_addJet(def)
	end
	local defs = level.def.drops or {}
	if #defs > 0 then
		self.look = LOOKS[look]
		assert(self.look, `Drop "{look}" isn't ported yet`)
	end
	for _, def in defs do
		self:_addDrop(def)
	end
	self:reset()
	self.folder.Parent = parent
	return self
end

function Hazards:destroy()
	self.folder:Destroy()
end

local function holderFrame(x: number, y: number, z: number, side: number): CFrame
	return CFrame.new(x * STUD, y * STUD, z * STUD) * CFrame.Angles(0, side * math.pi / 2, 0)
end

function Hazards:_addJet(def)
	local L = self.level
	local x, z = Level.squarePoint(L:ringRadius(def.ring), def.side, def.offset)
	local y = L:tierTop(def.ring)
	local frame = holderFrame(x, y, z, def.side)
	for _, b in GRILLE do
		makePart(self.folder, b).CFrame = frame * CFrame.new(b.at * STUD)
	end
	local flame = {}
	for _, b in FLAME do
		table.insert(flame, makePart(self.folder, b))
	end
	table.insert(self.jets, {
		def = def,
		s = L:spotS(def),
		base = Vector3.new(x, y, z),
		frame = frame,
		vent = makePart(self.folder, VENT),
		flame = flame,
		cframes = table.create(#flame),
		active = false,
		warning = false,
		-- The flame's height (0..1) and sideways flicker.
		sy = FLAT,
		sxz = 1,
		shownY = -1,
		shownXZ = -1,
	})
end

function Hazards:_addDrop(def)
	local L = self.level
	local x, z = Level.squarePoint(L:ringRadius(def.ring), def.side, def.offset)
	local ledgeY = L:tierTop(def.ring + 1)
	local holder = holderFrame(x, ledgeY, z, def.side)
	for _, b in self.look.ledge(L.def.terraceDepth) do
		makePart(self.folder, b).CFrame = holder * CFrame.new(b.at * STUD)
	end
	local parts = {}
	for _, b in self.look.drop do
		table.insert(parts, makePart(self.folder, b))
	end
	table.insert(self.drops, {
		ring = def.ring,
		s = L:spotS(def),
		holder = holder,
		holderY = ledgeY,
		floorY = L:tierTop(def.ring),
		parts = parts,
		cframes = table.create(#parts),
		state = "hang",
		t = 0,
		vy = 0,
		-- The drop group's offset from the holder, and its scale.
		x = 0,
		y = 0,
		scale = 1,
		shownScale = -1,
	})
end

function Hazards:_hang(d)
	d.state = "hang"
	d.t = 0
	d.vy = 0
	d.x = 0
	d.y = -0.35
	d.scale = 0.001
end

function Hazards:reset()
	self.clock = 0
	for _, j in self.jets do
		j.active = false
		j.warning = false
		j.sy = FLAT
		j.sxz = 1
	end
	for _, d in self.drops do
		self:_hang(d)
	end
	table.clear(self.dangers)
end

-- `player` is { ring, s }. Returns { cracked = a drop started shaking, shattered = { { at, colors } }
-- for drops that hit the floor this step, erupted = { base } for jets that went off this step }.
function Hazards:update(dt: number, player)
	self.clock += dt
	local events = { cracked = false, shattered = {}, erupted = {} }
	table.clear(self.dangers)
	self:_updateJets(dt, events)
	self:_updateDrops(dt, player, events)
	return events
end

function Hazards:_updateJets(dt: number, events)
	for _, j in self.jets do
		local period = j.def.period
		local c = (self.clock + (j.def.phase or 0)) % period
		local burstAt = period - HAZARDS.jetBurst
		local warning = c > burstAt - HAZARDS.jetWarn and c <= burstAt
		local active = c > burstAt
		if active and not j.active then
			table.insert(events.erupted, j.base)
		end
		j.active = active
		j.warning = warning

		local target = if active then 1 elseif warning then 0.12 else FLAT
		local k = 1 - math.exp(-(if active then 26 else 12) * dt)
		j.sy += (target - j.sy) * k
		j.sxz = if active then 1 + math.sin(self.clock * 40 + j.s) * 0.08 else 1

		if active and j.sy > 0.5 then
			local h = 0.5
			while h < HAZARDS.jetHeight * j.sy do
				table.insert(self.dangers, { at = j.base + Vector3.yAxis * h, r = 0.42, kind = "jet" })
				h += 0.8
			end
		end
	end
end

function Hazards:_updateDrops(dt: number, player, events)
	local L = self.level
	for _, d in self.drops do
		d.t += dt
		if d.state == "hang" then
			d.scale = math.min(1, d.t / GROW_TIME)
			if player.ring == d.ring and L:ringDistance(d.ring, player.s, d.s) < HAZARDS.dropTrigger and d.t > GROW_TIME then
				d.state = "shake"
				d.t = 0
				events.cracked = true
			end
		elseif d.state == "shake" then
			d.x = math.sin(d.t * SHAKE_RATE) * SHAKE_SWAY
			if d.t >= HAZARDS.dropShake then
				d.state = "fall"
				d.t = 0
				d.vy = 0
				d.x = 0
			end
		elseif d.state == "fall" then
			d.vy += HAZARDS.dropGravity * dt
			d.y += d.vy * dt
			local reach = self.look.reach
			local p = d.holder.Position / STUD
			local at = Vector3.new(p.X, d.holderY + d.y - reach / 2, p.Z)
			table.insert(self.dangers, { at = at, r = HAZARDS.dropRadius, kind = "drop" })
			if d.holderY + d.y - reach <= d.floorY then
				table.insert(events.shattered, { at = at, colors = self.look.shards })
				d.state = "gone"
				d.t = 0
			end
		elseif d.t >= HAZARDS.dropRespawn then
			self:_hang(d)
		end
	end
end

function Hazards:render()
	for _, j in self.jets do
		local wobble = if j.warning then math.sin(self.clock * 60) * 0.02 else 0
		j.vent.CFrame = j.frame * CFrame.new(0, (VENT.at.Y + wobble) * STUD, 0)
		-- Resizing is slow; skip it while the flame sits flat or holds still.
		local sy, sxz = j.sy, j.sxz
		if math.abs(sy - j.shownY) > 0.002 or sxz ~= j.shownXZ then
			j.shownY, j.shownXZ = sy, sxz
			for i, b in FLAME do
				local part = j.flame[i]
				part.Size = Vector3.new(b.size.X * sxz, b.size.Y * sy, b.size.Z * sxz) * STUD
				part.Transparency = if sy < 0.01 then 1 else 0
				j.cframes[i] = j.frame * CFrame.new(0, b.at.Y * sy * STUD, 0)
			end
			workspace:BulkMoveTo(j.flame, j.cframes, Enum.BulkMoveMode.FireCFrameChanged)
		end
	end
	for _, d in self.drops do
		local hidden = d.state == "gone"
		local scale = if hidden then 0 else d.scale
		if scale ~= d.shownScale then
			d.shownScale = scale
			for i, b in self.look.drop do
				d.parts[i].Size = b.size * math.max(scale, 0.001) * STUD
				d.parts[i].Transparency = if hidden then 1 else 0
			end
		end
		if not hidden then
			local origin = d.holder * CFrame.new(d.x * STUD, d.y * STUD, 0)
			for i, b in self.look.drop do
				d.cframes[i] = origin * CFrame.new(b.at * scale * STUD)
			end
			workspace:BulkMoveTo(d.parts, d.cframes, Enum.BulkMoveMode.FireCFrameChanged)
		end
	end
end

return Hazards
