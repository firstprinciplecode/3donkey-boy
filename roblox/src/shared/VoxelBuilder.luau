-- Builds static scenery out of anchored Parts, with the same calls as the web build's VoxelBuilder
-- (src/voxel.ts) and Frame (src/frame.ts), so world code ports line for line. Coordinates are game
-- units; Config.STUD scales them into studs.
--
-- Roblox has no cone primitive, so cones and spikes are stepped block pyramids, in keeping with the
-- voxel look.

local Config = require(script.Parent.Config)
local Level = require(script.Parent.Level)

local STUD = Config.STUD
local CONE_STEPS = 3

local VoxelBuilder = {}
VoxelBuilder.__index = VoxelBuilder

export type Options = {
	-- Windows, lanterns and balloons light up (Neon) at dusk and night; in daylight they're plain.
	glowing: boolean?,
}

function VoxelBuilder.new(parent: Instance, options: Options?)
	local self = setmetatable({}, VoxelBuilder)
	self.parent = parent
	self.glowing = options and options.glowing or false
	self.casting = true
	self.count = 0
	return self
end

-- Following parts go into `parent`, e.g. to group scenery by where it sits.
function VoxelBuilder:into(parent: Instance)
	self.parent = parent
	return self
end

-- Following parts skip shadows. Used for distant scenery.
function VoxelBuilder:castShadows(on: boolean)
	self.casting = on
	return self
end

-- Centred box.
function VoxelBuilder:box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color3): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = self.casting
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Color = color
	part.Size = Vector3.new(sx, sy, sz) * STUD
	part.CFrame = CFrame.new(x * STUD, y * STUD, z * STUD)
	part.Parent = self.parent
	self.count += 1
	return part
end

-- Box that lights up when built with `glowing`; a plain box otherwise.
function VoxelBuilder:glow(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color3): Part
	local part = self:box(x, y, z, sx, sy, sz, color)
	if self.glowing then
		part.Material = Enum.Material.Neon
		part.CastShadow = false
	end
	return part
end

-- Box resting on `yBottom`.
function VoxelBuilder:block(x: number, yBottom: number, z: number, sx: number, sy: number, sz: number, color: Color3): Part
	return self:box(x, yBottom + sy / 2, z, sx, sy, sz, color)
end

-- Stepped pyramid standing on `yBottom`, as wide as a cone of `radius`.
function VoxelBuilder:cone(x: number, yBottom: number, z: number, radius: number, height: number, color: Color3)
	local step = height / CONE_STEPS
	for i = 0, CONE_STEPS - 1 do
		local w = 2 * radius * (1 - i / CONE_STEPS)
		self:block(x, yBottom + i * step, z, w, step, w, color)
	end
end

-- Stepped spike hanging point-down from `yTop`. Always scenery (no shadows).
function VoxelBuilder:spike(x: number, yTop: number, z: number, width: number, height: number, color: Color3)
	local casting = self.casting
	self.casting = false
	local step = height / CONE_STEPS
	for i = 0, CONE_STEPS - 1 do
		local w = width * (1 - i / CONE_STEPS)
		self:box(x, yTop - (i + 0.5) * step, z, w, step, w, color)
	end
	self.casting = casting
end

-- A side's own frame: u runs along the side (like `offset`), v points out of the pyramid.
local TANGENTS = { [0] = Vector2.new(1, 0), Vector2.new(0, -1), Vector2.new(-1, 0), Vector2.new(0, 1) }
local NORMALS = { [0] = Vector2.new(0, 1), Vector2.new(1, 0), Vector2.new(0, -1), Vector2.new(-1, 0) }

local Frame = {}
Frame.__index = Frame

function Frame.new(side: number, radius: number, offset: number)
	local self = setmetatable({}, Frame)
	self.side = side
	self.bx, self.bz = Level.squarePoint(radius, side, offset)
	return self
end

function Frame:at(u: number, v: number): (number, number)
	local t, n = TANGENTS[self.side], NORMALS[self.side]
	return self.bx + t.X * u + n.X * v, self.bz + t.Y * u + n.Y * v
end

function Frame:box(vb, u: number, y: number, v: number, su: number, sy: number, sv: number, color: Color3): Part
	local x, z = self:at(u, v)
	if self.side % 2 == 0 then
		return vb:box(x, y, z, su, sy, sv, color)
	end
	return vb:box(x, y, z, sv, sy, su, color)
end

function Frame:block(vb, u: number, yBottom: number, v: number, su: number, sy: number, sv: number, color: Color3): Part
	return self:box(vb, u, yBottom + sy / 2, v, su, sy, sv, color)
end

function Frame:glow(vb, u: number, y: number, v: number, su: number, sy: number, sv: number, color: Color3): Part
	local x, z = self:at(u, v)
	if self.side % 2 == 0 then
		return vb:glow(x, y, z, su, sy, sv, color)
	end
	return vb:glow(x, y, z, sv, sy, su, color)
end

function Frame:cone(vb, u: number, yBottom: number, v: number, radius: number, height: number, color: Color3)
	local x, z = self:at(u, v)
	vb:cone(x, yBottom, z, radius, height, color)
end

VoxelBuilder.Frame = Frame

return VoxelBuilder
