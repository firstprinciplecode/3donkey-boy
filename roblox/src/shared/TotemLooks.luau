-- Totem looks, one per theme, ported from src/entities/totemLooks.ts. `leg` parts are relative to
-- each leg's hip and repeat on both legs; `body` and `pupil` parts sit in the body frame with the face
-- on the outward (+z) side, and pupils slide towards the walking direction. Boxes are centred on
-- `at`; cones stand on it (size = radius, height). Every look shares the same footprint so the
-- hitbox and hop stay fair.

local Config = require(script.Parent.Config)

local C = Config.COLORS
local hex = Config.hex

export type Part = { group: string, shape: string, size: Vector3, at: Vector3, color: Color3 }

local function box(group: string, sx: number, sy: number, sz: number, color: Color3, x: number, y: number, z: number): Part
	return { group = group, shape = "box", size = Vector3.new(sx, sy, sz), at = Vector3.new(x, y, z), color = color }
end

local function cone(group: string, radius: number, height: number, color: Color3, x: number, yBottom: number, z: number): Part
	return { group = group, shape = "cone", size = Vector3.new(radius, height, radius), at = Vector3.new(x, yBottom, z), color = color }
end

-- Appends `make(-1)` and `make(1)`, for left/right pairs.
local function pair(list: { Part }, make: (number) -> Part)
	table.insert(list, make(-1))
	table.insert(list, make(1))
end

local GUMMY_LIGHT = hex(0xffb3cf)

local LOOKS: { [string]: { Part } } = {}

do -- The poster's horned black monster.
	local p = {
		box("leg", 0.2, 0.55, 0.22, C.black, 0, 0, 0),
		box("leg", 0.28, 0.1, 0.34, C.cream, 0, -0.23, 0.04),
		box("body", 0.96, 1.1, 0.8, C.black, 0, 1.1, 0),
		box("body", 0.76, 0.3, 0.66, C.charcoal, 0, 1.78, 0),
		cone("body", 0.1, 0.3, C.pink, 0, 1.93, 0),
		box("body", 0.58, 0.2, 0.04, C.red, 0, 0.88, 0.41),
	}
	pair(p, function(s) return cone("body", 0.2, 0.62, C.cream, s * 0.26, 1.93, 0) end)
	pair(p, function(s) return box("body", 0.26, 0.26, 0.04, C.pink, s * 0.22, 1.32, 0.41) end)
	for i = 0, 3 do
		table.insert(p, cone("body", 0.06, 0.12, C.cream, -0.21 + i * 0.14, 0.9, 0.43))
	end
	pair(p, function(s) return box("pupil", 0.1, 0.12, 0.05, C.black, s * 0.22, 1.3, 0.43) end)
	LOOKS.spike = p
end

do -- Giant gummy bear with sprinkles.
	local p = {
		box("leg", 0.24, 0.55, 0.26, C.pink, 0, 0, 0),
		box("leg", 0.3, 0.1, 0.34, C.magenta, 0, -0.23, 0.04),
		box("body", 0.96, 1.0, 0.8, C.pink, 0, 1.05, 0),
		box("body", 0.6, 0.6, 0.04, GUMMY_LIGHT, 0, 1.0, 0.41),
		box("body", 0.06, 0.06, 0.06, C.cyan, -0.15, 1.1, 0.44),
		box("body", 0.06, 0.06, 0.06, C.yellow, 0.12, 0.9, 0.44),
		box("body", 0.06, 0.06, 0.06, C.purple, 0.05, 1.18, 0.44),
		box("body", 0.8, 0.5, 0.7, C.pink, 0, 1.8, 0),
		box("body", 0.3, 0.18, 0.06, C.cream, 0, 1.68, 0.37),
		box("body", 0.1, 0.06, 0.04, C.black, 0, 1.74, 0.41),
	}
	pair(p, function(s) return box("body", 0.2, 0.5, 0.26, C.pink, s * 0.56, 1.2, 0) end)
	pair(p, function(s) return box("body", 0.22, 0.22, 0.2, C.pink, s * 0.3, 2.12, 0) end)
	pair(p, function(s) return box("body", 0.12, 0.12, 0.04, GUMMY_LIGHT, s * 0.3, 2.12, 0.11) end)
	pair(p, function(s) return box("body", 0.2, 0.2, 0.04, C.cream, s * 0.2, 1.88, 0.36) end)
	pair(p, function(s) return box("pupil", 0.1, 0.12, 0.05, C.black, s * 0.2, 1.88, 0.38) end)
	LOOKS.gummy = p
end

do -- Saguaro in cowboy boots and arcade shades.
	local p = {
		box("leg", 0.2, 0.55, 0.22, C.leafDark, 0, 0, 0),
		box("leg", 0.3, 0.12, 0.36, C.brown, 0, -0.22, 0.05),
		box("body", 0.8, 1.5, 0.7, C.leaf, 0, 1.3, 0),
		box("body", 0.6, 0.2, 0.5, C.leaf, 0, 2.15, 0),
		box("body", 0.3, 0.2, 0.26, C.leaf, -0.55, 1.3, 0),
		box("body", 0.22, 0.6, 0.24, C.leaf, -0.72, 1.6, 0),
		box("body", 0.3, 0.2, 0.26, C.leaf, 0.55, 1.5, 0),
		box("body", 0.22, 0.5, 0.24, C.leaf, 0.72, 1.75, 0),
		box("body", 0.22, 0.12, 0.22, C.pink, 0, 2.31, 0),
		box("body", 0.08, 0.06, 0.08, C.yellow, 0, 2.39, 0),
		box("body", 0.6, 0.14, 0.04, C.black, 0, 1.75, 0.37),
		box("body", 0.3, 0.08, 0.04, C.red, 0, 1.45, 0.37),
	}
	pair(p, function(s) return box("body", 0.06, 1.4, 0.04, C.leafDark, s * 0.2, 1.25, 0.36) end)
	for _, at in { { -0.3, 1.0 }, { 0.3, 1.2 }, { -0.08, 0.8 }, { 0.1, 1.98 } } do
		table.insert(p, box("body", 0.04, 0.04, 0.08, C.cream, at[1], at[2], 0.37))
	end
	pair(p, function(s) return box("pupil", 0.1, 0.05, 0.03, C.cyan, s * 0.16, 1.77, 0.4) end)
	LOOKS.cactus = p
end

do -- Pumpkin-headed scarecrow in a straw hat.
	local p = {
		box("leg", 0.22, 0.55, 0.24, C.blue, 0, 0, 0),
		box("leg", 0.28, 0.12, 0.36, C.brown, 0, -0.22, 0.05),
		box("body", 0.9, 1.0, 0.74, C.maple, 0, 1.05, 0),
		box("body", 0.52, 0.42, 0.04, C.blue, 0, 0.8, 0.38),
		box("body", 0.9, 0.62, 0.8, C.orange, 0, 1.86, 0),
		box("body", 0.5, 0.1, 0.04, C.black, 0, 1.7, 0.42),
		box("body", 1.04, 0.06, 0.94, C.tan, 0, 2.2, 0),
		box("body", 0.56, 0.3, 0.5, C.tan, 0, 2.38, 0),
		box("body", 0.58, 0.08, 0.52, C.red, 0, 2.28, 0),
	}
	pair(p, function(s) return box("body", 0.06, 0.06, 0.03, C.yellow, s * 0.18, 0.98, 0.405) end)
	pair(p, function(s) return box("body", 0.2, 0.45, 0.26, C.maple, s * 0.55, 1.25, 0) end)
	pair(p, function(s) return box("body", 0.16, 0.14, 0.18, C.yellow, s * 0.55, 0.96, 0) end)
	pair(p, function(s) return box("body", 0.1, 0.64, 0.82, C.maple, s * 0.22, 1.86, 0) end)
	pair(p, function(s) return box("body", 0.18, 0.16, 0.04, C.black, s * 0.2, 1.94, 0.42) end)
	pair(p, function(s) return box("pupil", 0.08, 0.08, 0.04, C.yellow, s * 0.2, 1.92, 0.44) end)
	LOOKS.scarecrow = p
end

do -- Shaggy yeti with ice horns.
	local p = {
		box("leg", 0.24, 0.55, 0.26, C.snowShade, 0, 0, 0),
		box("leg", 0.32, 0.1, 0.38, C.iceDark, 0, -0.23, 0.05),
		box("body", 1.0, 1.1, 0.82, C.snow, 0, 1.1, 0),
		box("body", 0.6, 0.5, 0.04, C.ice, 0, 1.5, 0.42),
		box("body", 0.34, 0.1, 0.04, C.black, 0, 1.34, 0.45),
		box("body", 0.8, 0.34, 0.7, C.snowShade, 0, 1.82, 0),
		cone("body", 0.12, 0.26, C.snow, 0, 1.99, 0),
	}
	pair(p, function(s) return box("body", 0.06, 0.08, 0.03, C.cream, s * 0.1, 1.36, 0.475) end)
	pair(p, function(s) return cone("body", 0.14, 0.5, C.iceDark, s * 0.3, 1.99, 0) end)
	pair(p, function(s) return box("body", 0.34, 0.3, 0.5, C.snowShade, s * 0.5, 1.52, 0) end)
	pair(p, function(s) return box("body", 0.26, 0.9, 0.3, C.snow, s * 0.62, 1.0, 0) end)
	pair(p, function(s) return box("body", 0.3, 0.16, 0.34, C.iceDark, s * 0.62, 0.5, 0) end)
	pair(p, function(s) return box("pupil", 0.1, 0.12, 0.05, C.black, s * 0.16, 1.6, 0.45) end)
	LOOKS.yeti = p
end

do -- Bandaged mummy with a gold collar, arms out front.
	local p = {
		box("leg", 0.2, 0.55, 0.22, C.cream, 0, 0, 0),
		box("leg", 0.26, 0.1, 0.32, C.creamDark, 0, -0.23, 0.04),
		box("body", 0.9, 1.1, 0.76, C.cream, 0, 1.1, 0),
		box("body", 0.96, 0.12, 0.8, C.gold, 0, 1.6, 0),
		box("body", 0.16, 0.16, 0.04, C.teal, 0, 1.42, 0.39),
		box("body", 0.72, 0.5, 0.66, C.cream, 0, 1.9, 0),
		box("body", 0.74, 0.08, 0.68, C.creamDark, 0, 2.02, 0),
		box("body", 0.3, 0.08, 0.3, C.gold, 0, 2.19, 0),
		box("body", 0.5, 0.14, 0.04, C.black, 0, 1.88, 0.34),
	}
	for _, y in { 0.78, 1.02, 1.28 } do
		table.insert(p, box("body", 0.92, 0.08, 0.78, C.creamDark, 0, y, 0))
	end
	pair(p, function(s) return box("body", 0.2, 0.2, 0.5, C.cream, s * 0.35, 1.4, 0.55) end)
	pair(p, function(s) return box("pupil", 0.1, 0.1, 0.05, C.lava, s * 0.14, 1.88, 0.36) end)
	LOOKS.mummy = p
end

do -- Basalt golem with lava cracks and a burning crown.
	local p = {
		box("leg", 0.24, 0.55, 0.26, C.basaltDark, 0, 0, 0),
		box("leg", 0.32, 0.12, 0.38, C.basalt, 0, -0.22, 0.05),
		box("body", 1.0, 1.1, 0.82, C.basalt, 0, 1.1, 0),
		box("body", 0.08, 0.44, 0.04, C.lava, -0.2, 1.05, 0.42),
		box("body", 0.3, 0.07, 0.04, C.lava, -0.06, 0.86, 0.42),
		box("body", 0.08, 0.3, 0.04, C.orange, 0.24, 1.3, 0.42),
		box("body", 0.7, 0.44, 0.64, C.basaltDark, 0, 1.87, 0),
		box("body", 0.4, 0.08, 0.04, C.lava, 0, 1.74, 0.33),
		cone("body", 0.12, 0.42, C.orange, 0, 2.09, 0),
	}
	pair(p, function(s) return box("body", 0.2, 0.12, 0.04, C.yellow, s * 0.16, 1.92, 0.33) end)
	pair(p, function(s) return cone("body", 0.1, 0.3, C.lava, s * 0.2, 2.09, 0) end)
	pair(p, function(s) return box("body", 0.34, 0.34, 0.5, C.basaltDark, s * 0.55, 1.45, 0) end)
	pair(p, function(s) return box("body", 0.2, 0.3, 0.26, C.basaltDark, s * 0.6, 1.15, 0) end)
	pair(p, function(s) return box("body", 0.3, 0.3, 0.36, C.basalt, s * 0.6, 0.9, 0) end)
	pair(p, function(s) return box("pupil", 0.08, 0.1, 0.05, C.black, s * 0.16, 1.92, 0.36) end)
	LOOKS.golem = p
end

return LOOKS
