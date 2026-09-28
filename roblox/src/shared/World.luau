-- Builds the static pyramid for a level out of anchored Parts, ported from src/world.ts.

local Config = require(script.Parent.Config)
local Level = require(script.Parent.Level)
local Skins = require(script.Parent.Skins)

local STUD = Config.STUD

local World = {}

local function box(parent: Instance, name: string, size: Vector3, center: Vector3, color: Color3): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Material = Enum.Material.SmoothPlastic
	part.Color = color
	part.Size = size * STUD
	part.CFrame = CFrame.new(center * STUD)
	part.Parent = parent
	return part
end

local function boxBetween(parent: Instance, name: string, lo: Vector3, hi: Vector3, color: Color3)
	local size = hi - lo
	if size.X <= 1e-3 or size.Y <= 1e-3 or size.Z <= 1e-3 then
		return
	end
	box(parent, name, size, (lo + hi) / 2, color)
end

-- World (x, z) rectangle for offsets o0..o1 along one side of the band between radius a and b.
-- Sides 0 and 2 own the corners, so sides 1 and 3 only span -a..a.
local function sideRect(side: number, a: number, b: number, o0: number, o1: number): (number, number, number, number)
	if side == 0 then
		return o0, a, o1, b
	elseif side == 1 then
		return a, -o1, b, -o0
	elseif side == 2 then
		return -o1, -b, -o0, -a
	end
	return -b, o0, -a, o1
end

local function subtract(from: number, to: number, holes: { { number } }): { { number } }
	local pieces = { { from, to } }
	for _, hole in holes do
		local nextPieces = {}
		for _, piece in pieces do
			if hole[2] <= piece[1] or hole[1] >= piece[2] then
				table.insert(nextPieces, piece)
			else
				if hole[1] > piece[1] then
					table.insert(nextPieces, { piece[1], hole[1] })
				end
				if hole[2] < piece[2] then
					table.insert(nextPieces, { hole[2], piece[2] })
				end
			end
		end
		pieces = nextPieces
	end
	return pieces
end

local function buildPit(parent: Instance, skin, side: number, a: number, b: number, o0: number, o1: number, y: number)
	local x0, z0, x1, z1 = sideRect(side, a, b, o0, o1)
	boxBetween(parent, "PitFloor", Vector3.new(x0, y, z0), Vector3.new(x1, y + 0.1, z1), skin.pitFloor)
	for x = x0 + 0.5, x1 - 0.25, 1 do
		for z = z0 + 0.5, z1 - 0.25, 1 do
			local spike = box(parent, "Spike", Vector3.new(0.22, 0.5, 0.22), Vector3.new(x, y + 0.35, z), skin.spike)
			spike.CFrame *= CFrame.Angles(0, math.pi / 4, 0)
		end
	end
end

local function buildLadder(parent: Instance, level, ladder, skin)
	local upper = ladder.ring + 1
	local y0 = level:tierTop(ladder.ring)
	local y1 = level:tierTop(upper)
	local height = y1 - y0
	local cx, cz = Level.squarePoint(level:tierHalf(upper) + 0.08, ladder.side, ladder.offset)
	local along = if ladder.side % 2 == 0 then Vector3.xAxis else Vector3.zAxis
	local across = if ladder.side % 2 == 0 then Vector3.zAxis else Vector3.xAxis
	local base = Vector3.new(cx, y0, cz)

	local model = Instance.new("Model")
	model.Name = `Ladder{ladder.ring}_{ladder.side}_{ladder.offset}`
	for _, sign in { -1, 1 } do
		local size = along * 0.1 + across * 0.1 + Vector3.yAxis * height
		box(model, "Rail", size, base + along * (0.32 * sign) + Vector3.yAxis * (height / 2), skin.ladderRail)
	end
	for y = 0.35, height - 0.2, 0.42 do
		local size = along * 0.6 + across * 0.08 + Vector3.yAxis * 0.08
		box(model, "Rung", size, base + Vector3.yAxis * y, skin.ladderRung)
	end
	model.Parent = parent
end

-- Box placed in a side's own frame: u along the side, v outward from the pyramid, y the bottom face.
local function frameBlock(parent: Instance, name: string, side: number, radius: number, offset: number, u: number, yBottom: number, v: number, su: number, sy: number, sv: number, color: Color3): Part
	local x, z = Level.squarePoint(radius + v, side, offset + u)
	local size = if side % 2 == 0 then Vector3.new(su, sy, sv) else Vector3.new(sv, sy, su)
	return box(parent, name, size, Vector3.new(x, yBottom + sy / 2, z), color)
end

-- Striped lip where barrels roll off the edge onto the ring below.
local function buildChute(parent: Instance, level, chute)
	local C = Config.COLORS
	local side, radius, offset = chute.side, level:tierHalf(chute.ring), chute.offset
	local y = level:tierTop(chute.ring)
	frameBlock(parent, "Chute", side, radius, offset, 0, y, -1.2, 1.2, 0.06, 0.9, C.yellow)
	frameBlock(parent, "Chute", side, radius, offset, 0, y, -0.4, 1.2, 0.06, 0.6, C.pink)
	frameBlock(parent, "Chute", side, radius, offset, 0, y - 0.35, 0.3, 1.2, 0.3, 0.6, C.yellow)
	frameBlock(parent, "Chute", side, radius, offset, 0, y - 0.95, 0.75, 1.2, 0.3, 0.5, C.pink)
end

-- Pink drum at the edge of the ground ring; barrels disappear into it.
local function buildDrum(parent: Instance, level)
	local C = Config.COLORS
	local drum = level.def.drum
	local side, radius, offset = drum.side, level:ringRadius(drum.ring) + 0.95, drum.offset
	local y = level:tierTop(drum.ring)
	local model = Instance.new("Model")
	model.Name = "Drum"
	frameBlock(model, "Body", side, radius, offset, 0, y, 0, 1.0, 1.2, 1.0, C.pink)
	frameBlock(model, "Band", side, radius, offset, 0, y + 0.25, 0, 1.04, 0.1, 1.04, C.black)
	frameBlock(model, "Band", side, radius, offset, 0, y + 0.85, 0, 1.04, 0.1, 1.04, C.black)
	for _, flame in { { -0.2, 0.1, 0.28, 0.4, C.orange }, { 0.18, -0.12, 0.22, 0.6, C.yellow }, { 0.04, 0.25, 0.18, 0.28, C.red } } do
		local part = frameBlock(model, "Flame", side, radius, offset, flame[1], y + 1.2, flame[2], flame[3], flame[4], flame[3], flame[5])
		part.Material = Enum.Material.Neon
		part.CanCollide = false
	end
	model.Parent = parent
end

-- Ammo stacked beside the boss: three upright barrels.
local function buildBarrelPile(parent: Instance, x: number, y: number, z: number)
	local R = Config.BARREL.radius
	local LENGTH = 0.8
	local model = Instance.new("Model")
	model.Name = "BarrelPile"
	for i, spot in { { -0.45, LENGTH / 2 }, { 0.45, LENGTH / 2 }, { 0, LENGTH * 1.5 } } do
		local center = Vector3.new(x + spot[1], y + spot[2], z)
		local barrel = box(model, "Barrel", Vector3.new(LENGTH, R * 2, R * 2), center, Config.RAINBOW[i * 2 - 1])
		barrel.Shape = Enum.PartType.Cylinder
		barrel.CFrame *= CFrame.Angles(0, 0, math.pi / 2)
		for _, dy in { -LENGTH / 2 + 0.05, LENGTH / 2 - 0.05 } do
			local rim = box(model, "Rim", Vector3.new(0.1, R * 2 + 0.04, R * 2 + 0.04), center + Vector3.yAxis * dy, Config.COLORS.black)
			rim.Shape = Enum.PartType.Cylinder
			rim.CFrame *= CFrame.Angles(0, 0, math.pi / 2)
		end
	end
	model.Parent = parent
end

function World.build(level, parent: Instance): Model
	local def = level.def
	local skin = Skins[def.skin]
	local model = Instance.new("Model")
	model.Name = "Popscotch"

	local tiers = Instance.new("Folder")
	tiers.Name = "Tiers"
	tiers.Parent = model

	for k = 0, level.summitTier do
		local style = skin.tiers[k % #skin.tiers + 1]
		local half = level:tierHalf(k)
		local top = level:tierTop(k)
		local bottom = if k == 0 then -Level.BASE_DEPTH else level:tierTop(k - 1) - 1
		boxBetween(tiers, `Tier{k}`, Vector3.new(-half, bottom, -half), Vector3.new(half, top - 1, half), style.side)

		if k == level.summitTier then
			boxBetween(tiers, "Summit", Vector3.new(-half, top - 1, -half), Vector3.new(half, top, half), style.top)
		else
			local inner = level:tierHalf(k + 1)
			for side = 0, 3 do
				local extent = if side % 2 == 0 then half else inner
				local holes = {}
				for _, pit in def.pits do
					if pit.ring == k and pit.side == side then
						table.insert(holes, { pit.offset - pit.width / 2, pit.offset + pit.width / 2 })
					end
				end
				for _, piece in subtract(-extent, extent, holes) do
					local x0, z0, x1, z1 = sideRect(side, inner, half, piece[1], piece[2])
					boxBetween(tiers, `Ring{k}`, Vector3.new(x0, top - 1, z0), Vector3.new(x1, top, z1), style.top)
				end
				for _, hole in holes do
					buildPit(tiers, skin, side, inner, half, hole[1], hole[2], top - Level.PIT_DEPTH)
				end
			end
		end
	end

	local ladders = Instance.new("Folder")
	ladders.Name = "Ladders"
	ladders.Parent = model
	for _, ladder in def.ladders do
		buildLadder(ladders, level, ladder, skin)
	end

	local props = Instance.new("Folder")
	props.Name = "Props"
	props.Parent = model
	for _, chute in def.chutes do
		buildChute(props, level, chute)
	end
	buildDrum(props, level)
	buildBarrelPile(props, Config.BOSS_POS.x - 0.4, level:tierTop(level.summitTier), 2.1)

	local groundTop = -Level.BASE_DEPTH
	boxBetween(
		model,
		"Ground",
		Vector3.new(-128, groundTop - 10, -128),
		Vector3.new(128, groundTop, 128),
		skin.ground
	)

	local goal = box(model, "Goal", Vector3.new(0.2, 1.3, 1.3), Vector3.new(0, level:tierTop(level.summitTier) + 1.1, 0), skin.goal)
	goal.Shape = Enum.PartType.Cylinder
	goal.Material = Enum.Material.Neon
	goal.CanCollide = false

	model.Parent = parent
	return model
end

return World
