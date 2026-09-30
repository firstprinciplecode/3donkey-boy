-- Terrace props, ported from DECOR in src/world.ts. Each is authored facing +v (out of the pyramid)
-- in a side's Frame, resting on `y`.

local Config = require(script.Parent.Config)

local C = Config.COLORS

type Rand = () -> number

-- Voxel "sphere": three crossed slabs, the lime topiary look from the poster.
local function limeBall(vb, f, yCenter: number, r: number, u: number?)
	local uu = u or 0
	local d = r * 2
	f:box(vb, uu, yCenter, 0, d, d * 0.62, d * 0.62, C.lime)
	f:box(vb, uu, yCenter, 0, d * 0.62, d, d * 0.62, C.lime)
	f:box(vb, uu, yCenter, 0, d * 0.6, d * 0.6, d, C.limeDark)
	f:box(vb, uu - r * 0.25, yCenter + r * 0.3, r + 0.02, d * 0.2, d * 0.2, 0.04, C.cream)
end

local DECOR = {}

function DECOR.tree(vb, f, y: number, rand: Rand)
	local s = 0.85 + rand() * 0.35
	f:block(vb, 0, y, 0, 0.25 * s, 0.6 * s, 0.25 * s, C.brown)
	f:block(vb, 0, y + 0.5 * s, 0, 0.95 * s, 0.7 * s, 0.95 * s, C.leaf)
	f:block(vb, 0, y + 1.1 * s, 0, 0.7 * s, 0.55 * s, 0.7 * s, C.grass)
	f:block(vb, 0, y + 1.6 * s, 0, 0.35 * s, 0.35 * s, 0.35 * s, C.grassDark)
end

function DECOR.pine(vb, f, y: number, rand: Rand)
	local s = 0.9 + rand() * 0.35
	f:block(vb, 0, y, 0, 0.2 * s, 0.4 * s, 0.2 * s, C.brown)
	f:cone(vb, 0, y + 0.3 * s, 0, 0.42 * s, 1.5 * s, C.leafDark)
end

function DECOR.pot(vb, f, y: number)
	f:block(vb, 0, y, 0, 0.5, 0.4, 0.5, C.orange)
	f:block(vb, 0, y + 0.4, 0, 0.62, 0.45, 0.62, C.grass)
	f:block(vb, -0.15, y + 0.85, 0.12, 0.15, 0.15, 0.15, C.red)
	f:block(vb, 0.16, y + 0.85, -0.1, 0.15, 0.15, 0.15, C.yellow)
	f:block(vb, 0.05, y + 0.85, 0.2, 0.12, 0.12, 0.12, C.pink)
end

function DECOR.arcade(vb, f, y: number)
	f:block(vb, 0, y, 0, 0.8, 1.6, 0.7, C.teal)
	f:box(vb, 0, y + 1.1, 0.36, 0.6, 0.45, 0.02, C.black)
	f:box(vb, 0, y + 1.1, 0.37, 0.46, 0.3, 0.02, C.cyan)
	f:box(vb, 0, y + 0.75, 0.42, 0.84, 0.12, 0.2, C.pink)
	f:block(vb, 0, y + 1.6, 0, 0.86, 0.26, 0.76, C.yellow)
end

function DECOR.cart(vb, f, y: number)
	f:block(vb, 0, y + 0.2, 0, 1.6, 0.7, 0.8, C.pink)
	f:box(vb, 0, y + 0.55, 0.41, 1.6, 0.12, 0.02, C.cream)
	f:box(vb, -0.55, y + 0.2, 0.42, 0.3, 0.3, 0.1, C.black)
	f:box(vb, 0.55, y + 0.2, 0.42, 0.3, 0.3, 0.1, C.black)
	f:block(vb, -0.7, y + 0.9, 0, 0.08, 0.95, 0.08, C.cream)
	f:block(vb, 0.7, y + 0.9, 0, 0.08, 0.95, 0.08, C.cream)
	f:block(vb, 0, y + 1.85, 0, 1.4, 0.32, 0.5, C.tan)
	f:block(vb, 0, y + 2.0, 0, 1.65, 0.26, 0.3, C.red)
	f:block(vb, 0, y + 2.26, 0, 1.2, 0.06, 0.12, C.yellow)
end

function DECOR.cactus(vb, f, y: number, rand: Rand)
	local h = 1.2 + rand() * 0.8
	f:block(vb, 0, y, 0, 0.36, h, 0.36, C.leaf)
	f:block(vb, -0.3, y + h * 0.4, 0, 0.26, 0.18, 0.2, C.leaf)
	f:block(vb, -0.38, y + h * 0.4, 0, 0.18, 0.5, 0.18, C.leaf)
	f:block(vb, 0.3, y + h * 0.55, 0, 0.26, 0.18, 0.2, C.leaf)
	f:block(vb, 0.38, y + h * 0.55, 0, 0.18, 0.4, 0.18, C.leaf)
	f:block(vb, 0, y + h, 0, 0.14, 0.14, 0.14, C.pink)
end

function DECOR.palm(vb, f, y: number, rand: Rand)
	local h = 1.8 + rand() * 0.6
	for i = 0, 4 do
		f:block(vb, i * 0.04, y + (i * h) / 5, 0, 0.22, h / 5, 0.22, if i % 2 == 1 then C.brown else C.tan)
	end
	f:box(vb, 0.2, y + h, 0, 1.4, 0.1, 0.3, C.leaf)
	f:box(vb, 0.2, y + h, 0, 0.32, 0.1, 1.2, C.leaf)
	f:box(vb, 0.2, y + h + 0.1, 0, 0.8, 0.1, 0.8, C.grass)
	f:block(vb, 0.1, y + h - 0.25, 0.1, 0.16, 0.16, 0.16, C.brown)
end

function DECOR.lollipop(vb, f, y: number, rand: Rand)
	local h = 1.15 + rand() * 0.4
	local colors = { C.pink, C.purple, C.cyan, C.yellow }
	local candy = colors[math.floor(rand() * #colors) + 1]
	local cell = 0.14
	local radius = 3
	local head = y + h + radius * cell
	local spin = rand() * math.pi * 2
	f:block(vb, 0, y, 0, 0.1, h, 0.1, C.cream)
	-- A round disc, coloured by a spiral so the swirl stays readable at this size.
	for iy = -radius, radius do
		for ix = -radius, radius do
			local r2 = ix * ix + iy * iy
			if r2 <= radius * radius + 1 then
				local swirl = math.atan2(iy, ix) + spin + math.sqrt(r2) * 1.4
				local cream = math.floor((swirl + math.pi) / math.pi) % 2 == 0
				f:box(vb, ix * cell, head + iy * cell, 0, cell * 0.98, cell * 0.98, 0.16, if cream then C.cream else candy)
			end
		end
	end
end

function DECOR.maple(vb, f, y: number, rand: Rand)
	local s = 0.9 + rand() * 0.3
	local crown = if rand() < 0.5 then C.maple else C.orange
	f:block(vb, 0, y, 0, 0.26 * s, 0.7 * s, 0.26 * s, C.brown)
	f:block(vb, 0, y + 0.6 * s, 0, 1.05 * s, 0.6 * s, 1.05 * s, crown)
	f:block(vb, 0, y + 1.15 * s, 0, 0.75 * s, 0.5 * s, 0.75 * s, C.yellow)
	f:block(vb, 0.3 * s, y + 1.6 * s, 0.1, 0.3 * s, 0.3 * s, 0.3 * s, crown)
end

function DECOR.pumpkin(vb, f, y: number, rand: Rand)
	local s = 0.8 + rand() * 0.4
	f:block(vb, 0, y, 0, 0.7 * s, 0.5 * s, 0.6 * s, C.orange)
	f:block(vb, 0, y + 0.04, 0, 0.5 * s, 0.44 * s, 0.7 * s, C.maple)
	f:block(vb, 0, y + 0.5 * s, 0, 0.1, 0.18, 0.1, C.leafDark)
end

function DECOR.haystack(vb, f, y: number)
	f:block(vb, 0, y, 0, 1.1, 0.5, 0.8, C.yellow)
	f:block(vb, 0, y + 0.5, 0, 0.8, 0.4, 0.6, C.tan)
	f:box(vb, 0, y + 0.25, 0.41, 1.12, 0.08, 0.02, C.brown)
end

function DECOR.mushroom(vb, f, y: number, rand: Rand)
	local h = 0.5 + rand() * 0.4
	f:block(vb, 0, y, 0, 0.22, h, 0.22, C.cream)
	f:block(vb, 0, y + h, 0, 0.8, 0.3, 0.8, C.red)
	f:box(vb, -0.18, y + h + 0.31, 0.12, 0.14, 0.02, 0.14, C.cream)
	f:box(vb, 0.2, y + h + 0.31, -0.1, 0.12, 0.02, 0.12, C.cream)
end

function DECOR.snowpine(vb, f, y: number, rand: Rand)
	local s = 0.9 + rand() * 0.35
	f:block(vb, 0, y, 0, 0.2 * s, 0.4 * s, 0.2 * s, C.brown)
	f:cone(vb, 0, y + 0.3 * s, 0, 0.46 * s, 1.1 * s, C.leafDark)
	f:cone(vb, 0, y + 0.9 * s, 0, 0.34 * s, 0.9 * s, C.snow)
end

function DECOR.snowman(vb, f, y: number)
	f:block(vb, 0, y, 0, 0.7, 0.6, 0.7, C.snow)
	f:block(vb, 0, y + 0.6, 0, 0.5, 0.45, 0.5, C.snow)
	f:block(vb, 0, y + 1.05, 0, 0.36, 0.34, 0.36, C.snowShade)
	f:box(vb, -0.08, y + 1.26, 0.19, 0.06, 0.06, 0.02, C.black)
	f:box(vb, 0.08, y + 1.26, 0.19, 0.06, 0.06, 0.02, C.black)
	f:box(vb, 0, y + 1.18, 0.26, 0.06, 0.06, 0.16, C.orange)
	f:box(vb, 0, y + 0.98, 0, 0.54, 0.08, 0.54, C.red)
	f:block(vb, 0, y + 1.39, 0, 0.44, 0.06, 0.44, C.black)
	f:block(vb, 0, y + 1.45, 0, 0.26, 0.26, 0.26, C.black)
end

function DECOR.iceblock(vb, f, y: number, rand: Rand)
	local s = 0.6 + rand() * 0.4
	f:block(vb, 0, y, 0, s, s, s, C.ice)
	f:block(vb, 0.12, y + s, -0.08, s * 0.6, s * 0.6, s * 0.6, C.iceDark)
end

function DECOR.obelisk(vb, f, y: number, rand: Rand)
	local h = 1.6 + rand() * 0.8
	f:block(vb, 0, y, 0, 0.6, 0.2, 0.6, C.sandstoneDark)
	f:block(vb, 0, y + 0.2, 0, 0.4, h, 0.4, C.sandstone)
	f:box(vb, 0, y + 0.2 + h * 0.6, 0.21, 0.18, 0.18, 0.02, C.teal)
	f:cone(vb, 0, y + 0.2 + h, 0, 0.28, 0.4, C.gold)
end

function DECOR.urn(vb, f, y: number)
	f:block(vb, 0, y, 0, 0.36, 0.14, 0.36, C.rust)
	f:block(vb, 0, y + 0.14, 0, 0.56, 0.5, 0.56, C.maple)
	f:box(vb, 0, y + 0.4, 0, 0.58, 0.08, 0.58, C.gold)
	f:block(vb, 0, y + 0.64, 0, 0.3, 0.2, 0.3, C.rust)
end

function DECOR.rock(vb, f, y: number, rand: Rand)
	local s = 0.7 + rand() * 0.5
	f:block(vb, 0, y, 0, 0.9 * s, 0.5 * s, 0.8 * s, C.stoneDark)
	f:block(vb, 0.1, y + 0.5 * s, 0, 0.6 * s, 0.35 * s, 0.5 * s, C.stone)
end

function DECOR.topiary(vb, f, y: number, rand: Rand)
	local h = 0.5 + rand() * 0.5
	f:block(vb, 0, y, 0, 0.5, 0.36, 0.5, C.terracotta)
	f:box(vb, 0, y + 0.36, 0, 0.58, 0.08, 0.58, C.creamDark)
	f:block(vb, 0, y + 0.4, 0, 0.08, h, 0.08, C.brown)
	limeBall(vb, f, y + 0.4 + h + 0.35, 0.36)
	if rand() < 0.5 then
		limeBall(vb, f, y + 0.4 + h + 0.95, 0.22)
	end
end

function DECOR.shrub(vb, f, y: number, rand: Rand)
	local r = 0.3 + rand() * 0.14
	limeBall(vb, f, y + r, r)
	limeBall(vb, f, y + r * 0.7, r * 0.7, 0.45)
end

function DECOR.pottree(vb, f, y: number, rand: Rand)
	local s = 0.8 + rand() * 0.3
	local pot = ({ C.pink, C.teal, C.yellow, C.terracotta })[math.floor(rand() * 4) + 1]
	f:block(vb, 0, y, 0, 0.44, 0.34, 0.44, pot)
	f:box(vb, 0, y + 0.31, 0, 0.5, 0.1, 0.5, C.cream)
	f:block(vb, 0, y + 0.34, 0, 0.08, 0.3 * s, 0.08, C.brown)
	f:cone(vb, 0, y + 0.5 * s, 0, 0.3 * s, 0.9 * s, C.grassDark)
	f:block(vb, 0, y + 1.35 * s, 0, 0.1, 0.1, 0.1, C.yellow)
end

function DECOR.tiki(vb, f, y: number)
	f:block(vb, 0, y, 0, 0.55, 1.5, 0.45, C.brown)
	f:box(vb, 0, y + 1.2, 0.23, 0.4, 0.1, 0.02, C.yellow)
	f:box(vb, -0.12, y + 1.02, 0.24, 0.1, 0.1, 0.02, C.lava)
	f:box(vb, 0.12, y + 1.02, 0.24, 0.1, 0.1, 0.02, C.lava)
	f:box(vb, 0, y + 0.66, 0.24, 0.3, 0.12, 0.02, C.cream)
	f:block(vb, 0, y + 1.5, 0, 0.7, 0.2, 0.55, C.grass)
end

local Decor = {}

Decor.build = DECOR

-- Weighted pick from a skin's { { kind, weight }, ... } list.
function Decor.pick(weights, rand: Rand): string
	local total = 0
	for _, entry in weights do
		total += entry[2]
	end
	local r = rand() * total
	for _, entry in weights do
		r -= entry[2]
		if r <= 0 then
			return entry[1]
		end
	end
	return weights[1][1]
end

return Decor
