-- Drops that hang under the tier above and fall when you walk underneath, ported from src/hazards.ts.
-- Each hangs from a bracket, shakes loose when you come close, falls, shatters on the walkway and
-- grows back a few seconds later. Timed fire jets join with the levels that use them.
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

type Box = { size: Vector3, at: Vector3, color: Color3 }

local function box(sx, sy, sz, color, x, y, z): Box
	return { size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color }
end

-- How far each drop reaches below its hanging point, and what it breaks into.
local LOOKS = {
	acorn = {
		reach = 0.35,
		shards = { C.brown, C.tan, C.orange },
		-- Bracket sticking out from the lip of the tier above, over the walkway. Local +z is outward.
		ledge = function(depth: number): { Box }
			local len = depth / 2 + 0.5
			local z = -depth / 2 + len / 2
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
}

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
	self.drops = {}
	-- { at: Vector3, r: number } in game units.
	self.dangers = {}
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

function Hazards:_addDrop(def)
	local L = self.level
	local x, z = Level.squarePoint(L:ringRadius(def.ring), def.side, def.offset)
	local ledgeY = L:tierTop(def.ring + 1)
	local holder = CFrame.new(x * STUD, ledgeY * STUD, z * STUD) * CFrame.Angles(0, def.side * math.pi / 2, 0)
	for _, b in self.look.ledge(L.def.terraceDepth) do
		Voxel.part(self.folder, b.size, b.color).CFrame = holder * CFrame.new(b.at * STUD)
	end
	local parts = {}
	for _, b in self.look.drop do
		table.insert(parts, Voxel.part(self.folder, b.size, b.color))
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
	for _, d in self.drops do
		self:_hang(d)
	end
	table.clear(self.dangers)
end

-- `player` is { ring, s }. Returns { cracked = a drop started shaking,
-- shattered = { { at, colors } } for drops that hit the floor this step }.
function Hazards:update(dt: number, player)
	local L = self.level
	local events = { cracked = false, shattered = {} }
	table.clear(self.dangers)
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
			table.insert(self.dangers, { at = at, r = HAZARDS.dropRadius })
			if d.holderY + d.y - reach <= d.floorY then
				table.insert(events.shattered, { at = at, colors = self.look.shards })
				d.state = "gone"
				d.t = 0
			end
		elseif d.t >= HAZARDS.dropRespawn then
			self:_hang(d)
		end
	end
	return events
end

function Hazards:render()
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
