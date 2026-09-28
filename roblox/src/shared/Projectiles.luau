-- What the boss throws, ported from src/entities/projectiles.ts. Each look is a list of pieces laid
-- out around the projectile's centre in game units, already at the look's size (Config.PROJECTILES
-- scale). Barrels draws them rolling; World stacks three beside the boss.

local Config = require(script.Parent.Config)

local C = Config.COLORS
local R = Config.BARREL.radius
local LENGTH = 0.8

-- `ellipsoid` pieces are drawn as a squashed sphere filling their size (Ball parts stay round).
export type Piece = { size: Vector3, at: CFrame, color: Color3, shape: Enum.PartType?, ellipsoid: boolean? }

local Projectiles = {}

Projectiles.LENGTH = LENGTH

-- Deterministic 0..1 noise (the web's hash), so every tumbleweed is the same scribble.
local function hash(n: number): number
	local x = math.sin(n * 127.1 + 311.7) * 43758.5453
	return x - math.floor(x)
end

-- Laid out with the barrel's axle along Z. Roblox cylinders run along X.
local function barrel(): { Piece }
	local axle = CFrame.Angles(0, math.pi / 2, 0)
	local pieces = {
		{ size = Vector3.new(LENGTH, R * 2 - 0.06, R * 2 - 0.06), at = axle, color = C.charcoal, shape = Enum.PartType.Cylinder },
	}
	for _, z in { -LENGTH / 2 + 0.05, LENGTH / 2 - 0.05 } do
		table.insert(pieces, { size = Vector3.new(0.1, R * 2 + 0.04, R * 2 + 0.04), at = CFrame.new(0, 0, z) * axle, color = C.black, shape = Enum.PartType.Cylinder })
	end
	-- Rainbow staves around the barrel so the roll is readable.
	local staves = #Config.RAINBOW
	local width = 2 * math.pi * R / staves - 0.02
	for i = 1, staves do
		local angle = (i - 1) / staves * 2 * math.pi
		table.insert(pieces, {
			size = Vector3.new(width, 0.06, LENGTH * 0.86),
			at = CFrame.Angles(0, 0, angle) * CFrame.new(0, R - 0.03, 0),
			color = Config.RAINBOW[i],
		})
	end
	return pieces
end

local function ball(color: Color3, scale: number): { Piece }
	return { { size = Vector3.one * R * 2 * scale, at = CFrame.identity, color = color, shape = Enum.PartType.Ball } }
end

-- A scribble of dry twigs crossing the centre at random angles.
local function tumbleweed(scale: number): { Piece }
	local shades = { C.tan, C.sand, C.brown, Config.hex(0xb08d57) }
	local pieces = {}
	for i = 0, 27 do
		local len = R * (1.6 + hash(i) * 0.4)
		local offset = Vector3.new(hash(i + 80) - 0.5, hash(i + 90) - 0.5, hash(i + 99) - 0.5) * 0.2
		local turn = CFrame.Angles(hash(i + 20) * math.pi, hash(i + 40) * math.pi * 2, hash(i + 60) * math.pi)
		table.insert(pieces, {
			size = Vector3.new(0.06, 0.06, len) * scale,
			at = CFrame.new(offset * scale) * turn,
			color = shades[i % #shades + 1],
		})
	end
	return pieces
end

-- A squat pumpkin with maple ribs running over the top, and a stem and leaf. The web's faceted
-- ball is squashed to 0.82 high; the ribs are thin slabs of the same shape poking out through it.
local function pumpkin(scale: number): { Piece }
	local r, squash = R * scale, 0.82
	local pieces = {
		{ size = Vector3.new(r * 2, r * 2 * squash, r * 2), at = CFrame.identity, color = C.orange, ellipsoid = true },
	}
	for i = 0, 2 do
		table.insert(pieces, {
			size = Vector3.new(0.07 * scale, r * 2 * squash + 0.02, r * 2 + 0.03),
			at = CFrame.Angles(0, i * math.pi / 3, 0),
			color = C.maple,
			ellipsoid = true,
		})
	end
	table.insert(pieces, { size = Vector3.new(0.1, 0.18, 0.1) * scale, at = CFrame.new(0, (R * squash + 0.06) * scale, 0), color = C.leaf })
	table.insert(pieces, { size = Vector3.new(0.16, 0.03, 0.08) * scale, at = CFrame.new(0.1 * scale, (R * squash + 0.02) * scale, 0), color = C.grassDark })
	return pieces
end

-- `variant` picks the colour for looks that come in several (1-based; ignored otherwise).
function Projectiles.pieces(look: string, variant: number?): { Piece }
	local spec = Config.PROJECTILES[look]
	if look == "barrel" then
		return barrel()
	elseif look == "gumball" then
		return ball(spec.colors[variant or 1], spec.scale)
	elseif look == "tumbleweed" then
		return tumbleweed(spec.scale)
	elseif look == "pumpkin" then
		return pumpkin(spec.scale)
	end
	error(`Projectile "{look}" isn't ported yet`)
end

-- Gives a freshly made part its piece's shape.
function Projectiles.dress(part: BasePart, piece: Piece)
	if piece.shape then
		(part :: Part).Shape = piece.shape
	end
	if piece.ellipsoid then
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = part
	end
end

-- Upright looks (barrels) stand on end in the pile; the rest are stacked like balls.
function Projectiles.upright(look: string): boolean
	return look == "barrel"
end

return Projectiles
