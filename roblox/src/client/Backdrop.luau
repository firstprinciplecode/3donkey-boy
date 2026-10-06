-- Scenery around the pyramid, ported from src/background.ts: a few themed towers,
-- clouds and floating islands, plus the page's sky gradient.
--
-- The web camera's near plane clips scenery on its own side of the pyramid. This camera sits
-- further back, so scenery is grouped into compass slices and the slices on the camera's side are
-- taken out of the world. Built on the client because it's only for show and changes per viewer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Rand = require(Shared.Rand)
local VoxelBuilder = require(Shared.VoxelBuilder)

local C = Config.COLORS
local STUD = Config.STUD

local NEAR_LIMIT = 40
-- The widest base half-width these radii were laid out for; bigger pyramids push scenery out.
local SIZED_FOR = 21
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

-- Towers checker their walls. A solid core of one colour with slightly proud cubes
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
	vb:cone(x - 0.8, top, z, 0.45, 1.7, palette[2])
	vb:cone(x + 0.8, top, z, 0.45, 1.7, palette[2])
	if not eyes then
		return
	end
	for _, n in { { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 } } do
		local nx, nz = n[1], n[2]
		local ex = if nx == 0 then 0.6 else 0
		local ez = if nz == 0 then 0.6 else 0
		local sx = if nx ~= 0 then 0.05 else 0.5
		local sz = if nz ~= 0 then 0.05 else 0.5
		vb:box(x + nx * 1.52 - ex, top - 1.2, z + nz * 1.52 - ez, sx, 0.5, sz, windowColor)
		vb:box(x + nx * 1.52 + ex, top - 1.2, z + nz * 1.52 + ez, sx, 0.5, sz, windowColor)
	end
end

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
	local push = math.max(0, level:tierHalf(0) - SIZED_FOR)
	local vb = VoxelBuilder.new(self.model):castShadows(false)
	local function at(x: number, z: number)
		local slice = math.floor((angleOf(x, z) % (2 * math.pi)) / (2 * math.pi) * SECTORS) + 1
		vb:into(self.sectors[math.clamp(slice, 1, SECTORS)])
	end

	for i = 0, 2 do
		local angle = (i / 3) * math.pi * 2 + rand() * 0.4
		local radius = 78 + push + rand() * 14
		local palette = skin.towers[i % #skin.towers + 1]
		local x, z = math.sin(angle) * radius, math.cos(angle) * radius
		at(x, z)
		spikeTower(vb, x, z, -24, 28 + math.floor(rand() * 10), palette, skin.towerWindow, i == 0)
	end

	for _ = 1, 8 do
		local x, z = around(rand, NEAR_LIMIT + push, 65 + push)
		at(x, z)
		local cy = -6 + rand() * 34
		local puffs = 3 + math.floor(rand() * 4)
		for j = 0, puffs - 1 do
			local s = 0.9 + rand() * 1.6
			vb:box(x + (rand() - 0.5) * 3.5, cy + (rand() - 0.5), z + (rand() - 0.5) * 3.5, s, s * 0.8, s, skin.clouds[j % #skin.clouds + 1])
		end
	end

	-- Little floating islands like the pyramid's own base: grass cap, banded underside, maybe a tree.
	for _ = 1, 5 do
		local x, z = around(rand, NEAR_LIMIT + 2 + push, 62 + push)
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
		local trunk = skin.towers[1][2]
		vb:block(x, y, z, 0.22, 0.55, 0.22, trunk)
		vb:cone(x, y + 0.45, z, 0.42, 1.05, skin.island.top)
	end
	self.partCount = vb.count
	self.glowParts = vb.glowParts

	self:_buildSky(skin.sky)
	self.t = 0
	self.model.Parent = parent
	print(`[popscotch] backdrop built: {self.partCount} parts`)
	return self
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
