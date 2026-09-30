-- Scenery around the pyramid, ported from src/background.ts and src/posterScenery.ts: spiky
-- towers, clouds, floating islands, balloons, the castle monster, rainbow banners and far ghosts,
-- plus the page's sky gradient.
--
-- The web camera's near plane clips scenery on its own side of the pyramid. This camera sits
-- further back, so scenery is grouped into compass slices and the slices on the camera's side are
-- taken out of the world. Built on the client because it's only for show and changes per viewer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local PixelFont = require(Shared.PixelFont)
local Rand = require(Shared.Rand)
local VoxelBuilder = require(Shared.VoxelBuilder)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local RAINBOW = Config.RAINBOW
local STUD = Config.STUD
local Frame = VoxelBuilder.Frame

local NEAR_LIMIT = 40
local SECTORS = 8
-- Slices whose centre is within this of the camera's direction are hidden.
local HIDE_WITHIN = math.rad(90)
-- The sky panel sits this far behind the focus, beyond all scenery.
local SKY_BEHIND = 150
local STAR_COUNT = 70
local STAR_SEED = 7

type Rand = () -> number

local function angleOf(x: number, z: number): number
	return math.atan2(x, z)
end

local function angleDiff(a: number, b: number): number
	return math.abs((a - b + math.pi) % (2 * math.pi) - math.pi)
end

local function around(rand: Rand, min: number, max: number): (number, number)
	local angle = rand() * math.pi * 2
	local radius = min + rand() * (max - min)
	return math.sin(angle) * radius, math.cos(angle) * radius
end

-- Frame for a piece at (x, z) whose front faces the pyramid: author the front at negative v.
-- Seen from the centre, u runs right to left.
local function facingCentre(x: number, z: number)
	local side, offset, radius = Level.squareCoords(x, z)
	return Frame.new(side, radius, offset)
end

-- Towers and the castle checker their walls. A solid core of one colour with slightly proud cubes
-- of the other colour draws the same pattern with half the parts.
local PROUD = 1.02

local function spikeTower(vb, x: number, z: number, bottom: number, height: number, palette, windowColor: Color3, eyes: boolean)
	vb:block(x, bottom, z, 3, height, 3, palette[1])
	for y = 0, height - 1 do
		for ix = 0, 2 do
			for iz = 0, 2 do
				if not (ix == 1 and iz == 1) then
					local isWindow = (ix == 1 or iz == 1) and y % 3 == 1 and y < height - 3
					if isWindow then
						vb:glow(x - 1 + ix, bottom + y + 0.5, z - 1 + iz, PROUD, PROUD, PROUD, windowColor)
					elseif (ix + iz + y) % 2 == 1 then
						vb:box(x - 1 + ix, bottom + y + 0.5, z - 1 + iz, PROUD, PROUD, PROUD, palette[2])
					end
				end
			end
		end
	end
	local top = bottom + height
	vb:cone(x - 0.8, top, z, 0.45, 1.7, C.cream)
	vb:cone(x + 0.8, top, z, 0.45, 1.7, C.cream)
	if not eyes then
		return
	end
	for _, n in { { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 } } do
		local nx, nz = n[1], n[2]
		local ex = if nx == 0 then 0.6 else 0
		local ez = if nz == 0 then 0.6 else 0
		local sx = if nx ~= 0 then 0.05 else 0.5
		local sz = if nz ~= 0 then 0.05 else 0.5
		vb:box(x + nx * 1.52 - ex, top - 1.2, z + nz * 1.52 - ez, sx, 0.5, sz, C.pink)
		vb:box(x + nx * 1.52 + ex, top - 1.2, z + nz * 1.52 + ez, sx, 0.5, sz, C.pink)
	end
end

-- Isometric staircase cloud: stacked slabs that shrink and step back as they rise.
local function steppedCloud(vb, f, y: number, size: number, rand: Rand)
	for i = 0, 2 do
		local w = size * (1 - i * 0.26)
		local d = size * 0.6 * (1 - i * 0.2)
		local u = (rand() - 0.5) * size * 0.2 + i * size * 0.08
		f:block(vb, u, y + i * size * 0.22, i * 0.2, w, size * 0.22, d, if i % 2 == 1 then C.white else C.cream)
	end
	f:block(vb, -size * 0.45, y - 0.05, -0.1, size * 0.3, size * 0.15, size * 0.4, C.creamDark)
end

-- Tiny coloured cubes floating round a cloud, like the poster's sprinkles.
local function sprinkles(vb, f, y: number, spread: number, rand: Rand)
	local n = 5 + math.floor(rand() * 5)
	for _ = 1, n do
		local s = 0.25 + rand() * 0.25
		local u = (rand() - 0.5) * spread * 2
		local yy = y + (rand() - 0.3) * spread
		local v = -rand() * 2
		f:glow(vb, u, yy, v, s, s, s, RAINBOW[math.floor(rand() * #RAINBOW) + 1])
	end
end

local function blockLetter(vb, f, ch: string, uCenter: number, yBottom: number, v: number, cell: number)
	local u0 = uCenter + ((PixelFont.W - 1) / 2) * cell
	for _, c in PixelFont.cells(ch) do
		local u = u0 - c[1] * cell
		local y = yBottom + c[2] * cell + cell / 2
		f:glow(vb, u, y, v - cell * 0.4, cell, cell, cell * 0.6, C.yellow)
		f:box(vb, u - cell * 0.2, y - cell * 0.2, v + cell * 0.1, cell, cell, cell * 0.6, C.orange)
	end
end

-- Cloud with a hanging rainbow ribbon and a big letter at its foot (the poster's "D" flag).
local function rainbowBanner(vb, f, y: number, ch: string, rand: Rand)
	local stripe = 0.6
	local length = 7 + rand() * 3
	for i, color in RAINBOW do
		local u = (i - 1 - (#RAINBOW - 1) / 2) * stripe
		local tip = if (i - 1) % 2 == 1 then 0.6 else 0
		f:glow(vb, u, y - (length - tip) / 2, 0, stripe, length - tip, 0.3, color)
	end
	steppedCloud(vb, f, y - 0.4, 6, rand)
	blockLetter(vb, f, ch, 0, y - length - 5.4, -0.6, 1)
end

-- Cloud trailing a rainbow down a staircase of steps.
local function rainbowTrail(vb, f, y: number, rand: Rand)
	local steps = 6 + math.floor(rand() * 4)
	local dir = if rand() < 0.5 then 1 else -1
	for s = 0, steps - 1 do
		for i, color in RAINBOW do
			f:glow(vb, dir * (s * 0.9), y - s * 0.9 - (i - 1) * 0.28, 0, 0.9, 0.28, 0.3, color)
		end
	end
	steppedCloud(vb, f, y - 0.2, 5, rand)
end

-- Giant mint tower monster with horns, a spiky crown and a toothy face, far behind the pyramid.
local function castleMonster(vb, f, bottom: number, height: number)
	local half = 2.5
	local top = bottom + height
	f:block(vb, 0, bottom, 0, half * 2, height, half * 2, C.mintDark)
	for y = 0, height - 1 do
		if y % 9 == 8 then
			f:box(vb, 0, bottom + y + 0.5, 0, half * 2 + 1, 1, half * 2 + 1, C.cream)
		else
			for iu = -half, half - 1 do
				for iv = -half, half - 1 do
					local edge = math.max(math.abs(iu + 0.5), math.abs(iv + 0.5)) > half - 1
					if edge and (iu + iv + y) % 2 ~= 0 then
						f:box(vb, iu + 0.5, bottom + y + 0.5, iv + 0.5, PROUD, PROUD, PROUD, C.mint)
					end
				end
			end
		end
	end
	local front = -half - 0.05
	local faceY = top - 4
	f:box(vb, -1.2, faceY, front, 1.2, 1.2, 0.1, C.cream)
	f:box(vb, 1.2, faceY, front, 1.2, 1.2, 0.1, C.cream)
	f:glow(vb, -1.1, faceY - 0.1, front - 0.06, 0.5, 0.6, 0.06, C.pink)
	f:glow(vb, 1.3, faceY - 0.1, front - 0.06, 0.5, 0.6, 0.06, C.pink)
	f:box(vb, 0, faceY - 2.2, front, 3.4, 1.4, 0.1, C.black)
	for i = 0, 4 do
		f:box(vb, -1.36 + i * 0.68, faceY - 1.72, front - 0.06, 0.4, 0.4, 0.06, C.cream)
		f:box(vb, -1.02 + i * 0.68, faceY - 2.68, front - 0.06, 0.4, 0.4, 0.06, C.cream)
	end
	f:cone(vb, -half + 0.6, top, 0, 0.8, 4, C.cream)
	f:cone(vb, half - 0.6, top, 0, 0.8, 4, C.cream)
	for i = -1, 1 do
		f:cone(vb, i * 1.1, top, -half + 0.5, 0.35, 1.6, C.mintDark)
	end
	f:cone(vb, 0, top, 0, 0.6, 2.4, C.pink)
end

local BANNER_LETTERS = { "D", "P", "O", "U" }

-- Far ghosts lazily circling behind the pyramid (SkyCritters in src/background.ts).
local CRITTER_PARTS = {
	{ "body", Vector3.new(0.8, 0.6, 0.6), Vector3.zero, C.black, 0 },
	{ "body", Vector3.new(0.72, 0.46, 0.58), Vector3.new(0, 0.5, 0), C.cyan, 0.45 },
	{ "body", Vector3.new(0.14, 0.14, 0.04), Vector3.new(-0.18, 0.08, 0.31), C.pink, 0 },
	{ "body", Vector3.new(0.14, 0.14, 0.04), Vector3.new(0.18, 0.08, 0.31), C.pink, 0 },
	{ "wingL", Vector3.new(0.6, 0.1, 0.4), Vector3.new(-0.3, 0, 0), C.black, 0 },
	{ "wingR", Vector3.new(0.6, 0.1, 0.4), Vector3.new(0.3, 0, 0), C.black, 0 },
}
local CRITTER_COUNT = 5

local Backdrop = {}
Backdrop.__index = Backdrop

function Backdrop.new(level, skin, parent: Instance)
	local self = setmetatable({}, Backdrop)
	self.model = Instance.new("Model")
	self.model.Name = "Backdrop"
	self.sectors = {}
	self.sectorShown = {}
	for i = 1, SECTORS do
		local sector = Instance.new("Folder")
		sector.Name = `Sector{i}`
		sector.Parent = self.model
		self.sectors[i] = sector
		self.sectorShown[i] = true
	end

	-- A separate seed from the pyramid's: the web build continues the pyramid's sequence here,
	-- so the scenery layout differs from the web while staying the same on every run.
	local rand = Rand.seeded(Rand.hashString(level.def.name .. ":backdrop"))
	local vb = VoxelBuilder.new(self.model):castShadows(false)
	local function at(x: number, z: number)
		local slice = math.floor((angleOf(x, z) % (2 * math.pi)) / (2 * math.pi) * SECTORS) + 1
		vb:into(self.sectors[math.clamp(slice, 1, SECTORS)])
	end

	for i = 0, 9 do
		local angle = (i / 10) * math.pi * 2 + rand() * 0.3
		local radius = 70 + rand() * 20
		local palette = skin.towers[i % #skin.towers + 1]
		local x, z = math.sin(angle) * radius, math.cos(angle) * radius
		at(x, z)
		spikeTower(vb, x, z, -24, 34 + math.floor(rand() * 20), palette, skin.towerWindow, i % 2 == 0)
	end

	for _ = 1, 18 do
		local x, z = around(rand, NEAR_LIMIT, 65)
		at(x, z)
		local cy = -10 + rand() * 42
		local puffs = 3 + math.floor(rand() * 4)
		for j = 0, puffs - 1 do
			local s = 0.9 + rand() * 1.6
			vb:box(x + (rand() - 0.5) * 3.5, cy + (rand() - 0.5), z + (rand() - 0.5) * 3.5, s, s * 0.8, s, skin.clouds[j % #skin.clouds + 1])
		end
	end

	-- Little floating islands like the pyramid's own base: grass cap, banded underside, maybe a tree.
	for _ = 1, 9 do
		local x, z = around(rand, NEAR_LIMIT + 2, 62)
		at(x, z)
		local y = -6 + rand() * 30
		local half = 1 + math.floor(rand() * 2)
		vb:box(x, y - 0.5, z, half * 2, 1, half * 2, skin.island.top)
		local underside, lastH = y - 1, half
		for layer, color in skin.island.bands do
			local h = half - math.floor((layer - 1) / 2)
			if h > 0 then
				vb:box(x, y - 1.5 - (layer - 1), z, h * 2, 1, h * 2, color)
				underside = y - 2 - (layer - 1)
				lastH = h
			end
		end
		for ix = -lastH, lastH - 1 do
			for iz = -lastH, lastH - 1 do
				vb:spike(x + ix + 0.5, underside, z + iz + 0.5, 1.35, 0.8 + rand() * 1.4, C.black)
			end
		end
		if rand() < 0.6 then
			vb:block(x, y, z, 0.3, 0.7, 0.3, C.brown)
			vb:block(x, y + 0.6, z, 1.1, 0.9, 1.1, C.leaf)
			vb:block(x, y + 1.4, z, 0.6, 0.5, 0.6, C.grass)
		else
			vb:cone(x, y, z, 0.4, 1.4, C.cream)
		end
	end

	for i = 0, 9 do
		local x, z = around(rand, NEAR_LIMIT, 58)
		at(x, z)
		local y = 4 + rand() * 26
		local color = skin.balloons[i % #skin.balloons + 1]
		vb:glow(x, y, z, 1.2, 1.4, 1.2, color)
		vb:glow(x, y + 0.1, z, 1.4, 0.9, 1.4, color)
		vb:box(x - 0.25, y + 0.35, z + 0.71, 0.3, 0.3, 0.02, C.white)
		vb:box(x, y - 0.8, z, 0.3, 0.2, 0.3, color)
		vb:box(x, y - 1.8, z, 0.04, 1.8, 0.04, C.charcoal)
	end

	do
		local a = rand() * math.pi * 2
		local r = 80 + rand() * 8
		local cx, cz = math.sin(a) * r, math.cos(a) * r
		at(cx, cz)
		castleMonster(vb, facingCentre(cx, cz), -22.5, 44 + math.floor(rand() * 8))
	end
	for _ = 1, 3 do
		local x, z = around(rand, 50, 62)
		at(x, z)
		local y = 20 + rand() * 12
		rainbowBanner(vb, facingCentre(x, z), y, BANNER_LETTERS[math.floor(rand() * #BANNER_LETTERS) + 1], rand)
	end
	for _ = 1, 3 do
		local x, z = around(rand, 48, 62)
		at(x, z)
		rainbowTrail(vb, facingCentre(x, z), 14 + rand() * 16, rand)
	end
	for _ = 1, 10 do
		local x, z = around(rand, 44, 64)
		at(x, z)
		local f = facingCentre(x, z)
		local y = -4 + rand() * 34
		steppedCloud(vb, f, y, 3 + rand() * 4, rand)
		sprinkles(vb, f, y, 3, rand)
	end
	self.partCount = vb.count
	self.glowParts = vb.glowParts

	self:_buildCritters()
	self:_buildSky(skin.sky)
	self.t = 0
	self.model.Parent = parent
	print(`[popscotch] backdrop built: {self.partCount} parts`)
	return self
end

function Backdrop:_buildCritters()
	self.critters = {}
	self.critterParts = {}
	self.critterFrames = {}
	local holder = Instance.new("Folder")
	holder.Name = "SkyCritters"
	holder.Parent = self.model
	for i = 0, CRITTER_COUNT - 1 do
		local scale = 2 + (i % 3) * 0.6
		local entries = {}
		for _, spec in CRITTER_PARTS do
			local part = Voxel.part(holder, spec[2] * scale, spec[4], spec[5])
			part.CastShadow = false
			table.insert(self.critterParts, part)
			table.insert(entries, { group = spec[1], offset = CFrame.new(spec[3] * scale * STUD) })
		end
		table.insert(self.critters, {
			entries = entries,
			scale = scale,
			radius = 44 + i * 4,
			height = 6 + ((i * 7) % 22),
			speed = (0.05 + (i % 3) * 0.02) * (if i % 2 == 1 then 1 else -1),
			angle = (i / CRITTER_COUNT) * math.pi * 2,
		})
	end
end

-- A camera-facing panel behind everything, painted with the page's gradient and unaffected by light.
function Backdrop:_buildSky(colors)
	local panel = Instance.new("Part")
	panel.Name = "Sky"
	panel.Anchored = true
	panel.CanCollide = false
	panel.CanQuery = false
	panel.CanTouch = false
	panel.CastShadow = false
	panel.Material = Enum.Material.SmoothPlastic
	panel.Color = colors[3]
	panel.Size = Vector3.new(260, 180, 1) * STUD
	panel.Parent = self.model

	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.LightInfluence = 0
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 0.5
	gui.MaxDistance = 100000
	gui.Parent = panel

	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(1, 1)
	fill.BorderSizePixel = 0
	fill.BackgroundColor3 = Color3.new(1, 1, 1)
	fill.Parent = gui

	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Parent = fill
	self.sky = panel
	self.skyGradient = gradient

	-- Stars over the upper sky, hidden in daylight (the web's CSS star layer). Seeded so they sit in
	-- the same place every run.
	local rand = Rand.seeded(STAR_SEED)
	self.stars = {}
	for _ = 1, STAR_COUNT do
		local star = Instance.new("Frame")
		local size = if rand() < 0.2 then 3 else 2
		star.Size = UDim2.fromOffset(size, size)
		star.Position = UDim2.fromScale(rand(), rand() * 0.6)
		star.BorderSizePixel = 0
		star.BackgroundColor3 = Color3.new(1, 1, 1)
		star.BackgroundTransparency = 1
		star.ZIndex = 2
		star.Parent = gui
		table.insert(self.stars, { frame = star, twinkle = rand() * math.pi * 2 })
	end
	self.starStrength = 0
	self:setSky(colors, 0)
end

-- Repaints the sky gradient and sets how strongly the stars show (0 in daylight, 1 at night).
function Backdrop:setSky(colors: { Color3 }, stars: number)
	-- The web gradient is radial, lightest a third of the way down; this is its vertical slice.
	self.skyGradient.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, colors[2]),
		ColorSequenceKeypoint.new(0.4, colors[1]),
		ColorSequenceKeypoint.new(0.75, colors[2]),
		ColorSequenceKeypoint.new(1, colors[3]),
	})
	self.sky.Color = colors[3]
	self.starStrength = stars
	if stars <= 0 then
		for _, s in self.stars do
			s.frame.BackgroundTransparency = 1
		end
	end
end

function Backdrop:destroy()
	-- Hidden sectors are unparented, so they wouldn't go with the model.
	for _, sector in self.sectors do
		sector:Destroy()
	end
	self.model:Destroy()
end

-- `azimuth` is the camera's direction from the focus (see CameraRig).
function Backdrop:update(dt: number, azimuth: number, focus: Vector3)
	self.t += dt

	for i, sector in self.sectors do
		local centre = (i - 0.5) / SECTORS * 2 * math.pi
		local show = angleDiff(centre, azimuth) >= HIDE_WITHIN
		if show ~= self.sectorShown[i] then
			self.sectorShown[i] = show
			sector.Parent = if show then self.model else nil
		end
	end

	local k = 1
	for _, f in self.critters do
		f.angle += f.speed * dt
		local x, z = math.sin(f.angle) * f.radius, math.cos(f.angle) * f.radius
		local shown = angleDiff(angleOf(x, z), azimuth) >= HIDE_WITHIN
		local y = f.height + math.sin(self.t * 1.3 + f.angle * 3) * 0.8
		local body = CFrame.new(Vector3.new(x, y, z) * STUD) * CFrame.Angles(0, f.angle + (if f.speed > 0 then math.pi / 2 else -math.pi / 2), 0)
		local flap = math.sin(self.t * 10 + f.radius) * 0.6
		local wingL = body * CFrame.new(Vector3.new(-0.4, 0.05, 0) * f.scale * STUD) * CFrame.Angles(0, 0, flap)
		local wingR = body * CFrame.new(Vector3.new(0.4, 0.05, 0) * f.scale * STUD) * CFrame.Angles(0, 0, -flap)
		for _, entry in f.entries do
			local frame = if entry.group == "wingL" then wingL elseif entry.group == "wingR" then wingR else body
			self.critterFrames[k] = if shown then frame * entry.offset else Voxel.HIDDEN
			k += 1
		end
	end
	workspace:BulkMoveTo(self.critterParts, self.critterFrames, Enum.BulkMoveMode.FireCFrameChanged)

	if self.starStrength > 0 then
		for _, s in self.stars do
			local shine = self.starStrength * (0.55 + 0.45 * math.sin(self.t * 1.7 + s.twinkle))
			s.frame.BackgroundTransparency = 1 - shine
		end
	end

	-- Keep the sky panel square-on to the camera, far behind the pyramid.
	local camera = workspace.CurrentCamera
	if camera then
		local eye = camera.CFrame.Position
		local centre = focus * STUD
		local away = (centre - eye).Unit
		local at = centre + away * SKY_BEHIND * STUD
		self.sky.CFrame = CFrame.lookAt(at, eye)
	end
end

return Backdrop
