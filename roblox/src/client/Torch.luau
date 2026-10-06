-- The serpent tomb's torch, ported from src/game.ts. It stands beside the ground ring's ladder; the
-- level goes dark and the wall lamps fade as the player nears it, and once taken its light follows the
-- player. Other levels have none. Positions are in game units.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local VoxelBuilder = require(Shared.VoxelBuilder)
local World = require(Shared.World)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local STUD = Config.STUD

local PICKUP_RADIUS = 1.15
-- How far before the ladder it stands, along the ring.
local STAND_BACK = 2.2
local FLAME_HEIGHT = 1.2
-- Share of the level's own light left once the torch is the only light.
local DARKEST = 0.06
-- Neon ignores the lighting, so the scenery's glowing windows, lanterns and ribs switch off once
-- the blackout passes this, and back on if the player walks away before taking the torch.
local GLOW_OFF_AT = 0.5
local GLOW_ON_AT = 0.4
local LAMP_COUNT = 8
local LAMP_FADE_RATE = 1.6
-- Studs and PointLight brightness, for the Realistic lighting style: its falloff is tighter than the
-- old Voxel lighting's, so these sit a little higher than they did, and colours still wash out well
-- above 1.
-- The standing torch is only a small glow, so walking up to it darkens the tomb; once carried it
-- lights the way.
local TORCH_RANGE = 14
local TORCH_BRIGHTNESS = 0.9
local STAND_RANGE = 10
local STAND_BRIGHTNESS = 0.5
local LAMP_RANGE = 10
local LAMP_BRIGHTNESS = 0.6
local TORCH_COLOR = Config.hex(0xffb24a)
local LAMP_COLOR = Config.hex(0xffc85a)

local Torch = {}
Torch.__index = Torch

-- { size, height of its centre above the foot, colour, glows }
Torch.LOOK = {
	{ Vector3.new(0.12, 0.85, 0.12), 0.42, C.brown, false },
	{ Vector3.new(0.28, 0.32, 0.28), 0.95, C.orange, true },
	{ Vector3.new(0.16, 0.2, 0.16), 1.16, C.yellow, true },
}

function Torch.lookPart(parent: Instance, spec, scale: number): Part
	local part = Voxel.part(parent, spec[1] * scale, spec[3])
	if spec[4] then
		part.Material = Enum.Material.Neon
		part.CastShadow = false
	end
	return part
end

local function lightPart(parent: Instance, color: Color3, range: number): (Part, PointLight)
	local part = Voxel.part(parent, Vector3.one * 0.1, color, 1)
	part.CFrame = Voxel.HIDDEN
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = range
	light.Shadows = false
	light.Enabled = false
	light.Parent = part
	return part, light
end

local function smoothstep(x: number, lo: number, hi: number): number
	local t = math.clamp((x - lo) / (hi - lo), 0, 1)
	return t * t * (3 - 2 * t)
end

local function scaled(c: Color3, k: number): Color3
	return Color3.new(c.R * k, c.G * k, c.B * k)
end

function Torch.new(parent: Instance)
	local self = setmetatable({}, Torch)
	self.folder = Instance.new("Folder")
	self.folder.Name = "Torch"
	self.folder.Parent = parent
	self.parts = {}
	for _, spec in Torch.LOOK do
		local part = Torch.lookPart(self.folder, spec, 1)
		part.CFrame = Voxel.HIDDEN
		table.insert(self.parts, part)
	end
	self.lightPart, self.light = lightPart(self.folder, TORCH_COLOR, TORCH_RANGE)
	self.lamps = {}
	for _ = 1, LAMP_COUNT do
		local part, light = lightPart(self.folder, LAMP_COLOR, LAMP_RANGE)
		table.insert(self.lamps, { part = part, light = light, spot = nil :: number?, fade = 0 })
	end
	self.lampSpots = {} :: { Vector3 }
	self.active = false
	self.held = false
	self.blackout = 0
	self.glowLists = {}
	self.glowOff = false
	self.darkNoted = false
	self.foot = Vector3.zero
	self.flame = Vector3.zero
	return self
end

-- Puts the torch back beside its ladder (tomb only) and the level's own light back up.
-- `base` is the level's lighting from TimeOfDay.lighting; `glowLists` are the glow parts of the
-- world and backdrop, as lit by the time of day.
function Torch:reset(level, base, glowLists: { { { part: Part, casts: boolean } } })
	self.base = base
	self.held = false
	self.blackout = 0
	self.darkNoted = false
	self:_dim(1)
	self.active = level.def.skin == "tomb"
	self.glowLists = glowLists
	if self.active and self.glowOff then
		self:_setSceneryGlow(true)
	end
	self.glowOff = false
	self.light.Enabled = self.active
	for _, lamp in self.lamps do
		lamp.spot = nil
		lamp.fade = 0
		lamp.light.Enabled = false
		lamp.part.CFrame = Voxel.HIDDEN
	end
	if not self.active then
		self:_showStand(false)
		self.lampSpots = {}
		return
	end
	local ladders = level.def.ladders
	self.ladderIndex = 1
	for i, l in ladders do
		if l.ring == 0 then
			self.ladderIndex = i
			break
		end
	end
	local ladder = ladders[self.ladderIndex]
	local x, z = level:ringPoint(ladder.ring, level:sOf(ladder.ring, ladder.side, ladder.offset - STAND_BACK))
	self.foot = Vector3.new(x, level:tierTop(ladder.ring), z)
	self.flame = self.foot + Vector3.yAxis * FLAME_HEIGHT
	self:_showStand(true)
	self.lampSpots = World.lanternPoints(level)
	print(`[popscotch] torch placed by the ring {ladder.ring} ladder on side {ladder.side}, {#self.lampSpots} lamps`)
end

-- Returns whether the player picked the torch up this frame, and whether the lamps first went out
-- this attempt (before the torch is taken).
function Torch:update(dt: number, feet: Vector3, playing: boolean): (boolean, boolean)
	if not self.active then
		return false, false
	end
	local dist = (self.foot - feet).Magnitude
	local taken = false
	if not self.held and playing and dist < PICKUP_RADIUS then
		self.held = true
		self:_showStand(false)
		taken = true
	end
	local target = if self.held then 1 else 1 - smoothstep(dist, 4, 11)
	self.blackout += (target - self.blackout) * (1 - math.exp(-2.2 * dt))
	self:_dim(1 - self.blackout * (1 - DARKEST))
	self:_placeLamps(dt, feet, 1 - self.blackout)
	local darkened = false
	if not self.darkNoted and not self.held and playing and self.blackout > GLOW_OFF_AT then
		self.darkNoted = true
		darkened = true
	end
	if not self.glowOff and self.blackout > GLOW_OFF_AT then
		self.glowOff = true
		self:_setSceneryGlow(false)
	elseif self.glowOff and self.blackout < GLOW_ON_AT then
		self.glowOff = false
		self:_setSceneryGlow(true)
	end
	self.light.Brightness = if self.held then TORCH_BRIGHTNESS else STAND_BRIGHTNESS
	self.light.Range = if self.held then TORCH_RANGE else STAND_RANGE
	if self.held then
		local carried = feet + Vector3.yAxis * 1.5
		self.flame += (carried - self.flame) * (1 - math.exp(-10 * dt))
	end
	self.lightPart.CFrame = CFrame.new(self.flame * STUD)
	return taken, darkened
end

function Torch:_setSceneryGlow(on: boolean)
	local lit = on and self.base.glow
	for _, list in self.glowLists do
		VoxelBuilder.setGlow(list, lit)
	end
end

function Torch:_showStand(on: boolean)
	for i, part in self.parts do
		part.CFrame = if on then CFrame.new((self.foot + Vector3.yAxis * Torch.LOOK[i][2]) * STUD) else Voxel.HIDDEN
	end
end

-- Scales the level's own light. 1 is as the level is lit, 0 is dark.
function Torch:_dim(k: number)
	local base = self.base
	if not base then
		return
	end
	Lighting.Brightness = base.Brightness * k
	Lighting.Ambient = scaled(base.Ambient, k)
	Lighting.OutdoorAmbient = scaled(base.OutdoorAmbient, k)
end

-- Lamp pools follow the player along the nearest lanterns, and fade out as the blackout rises.
function Torch:_placeLamps(dt: number, at: Vector3, strength: number)
	local nearest = {}
	for index, spot in self.lampSpots do
		table.insert(nearest, { index = index, dist = (spot - at).Magnitude })
	end
	table.sort(nearest, function(a, b)
		return a.dist < b.dist
	end)
	local wanted = {}
	for i = 1, math.min(#self.lamps, #nearest) do
		wanted[nearest[i].index] = true
	end
	local claimed = {}
	for _, lamp in self.lamps do
		if lamp.spot and wanted[lamp.spot] then
			claimed[lamp.spot] = true
			lamp.fade = math.min(1, lamp.fade + dt * LAMP_FADE_RATE)
		else
			lamp.fade = math.max(0, lamp.fade - dt * LAMP_FADE_RATE)
			if lamp.fade == 0 then
				lamp.spot = nil
			end
		end
	end
	for index in wanted do
		if not claimed[index] then
			for _, lamp in self.lamps do
				if lamp.spot == nil then
					lamp.spot = index
					lamp.part.CFrame = CFrame.new(self.lampSpots[index] * STUD)
					break
				end
			end
		end
	end
	for _, lamp in self.lamps do
		local brightness = LAMP_BRIGHTNESS * lamp.fade * lamp.fade * strength
		lamp.light.Brightness = brightness
		lamp.light.Enabled = brightness > 0
	end
end

return Torch
