-- Level looks, ported from src/levels/skins.ts. Only meadow so far; the other skins come with their levels.

local Config = require(script.Parent.Config)

local hex = Config.hex
local C = Config.COLORS

-- Alternating colours for a tier's terrace top (rainbow styles cycle through all of them) and wall.
local STYLE = {
	grass = { top = { C.grass, C.grassDark }, side = { C.stone, C.stoneDark } },
	tile = { top = { C.cream, C.creamDark }, side = { C.teal, C.cyan } },
	checker = { top = { C.charcoal, C.grey }, side = { C.pink, C.magenta } },
	rainbow = { top = Config.RAINBOW, side = { C.charcoal, C.grey } },
}

return {
	meadow = {
		-- One style per tier from the ground up; repeats if the pyramid is taller.
		tiers = { STYLE.grass, STYLE.tile, STYLE.checker, STYLE.grass, STYLE.rainbow },
		-- Horizontal bands on the ground tier's wall, like the poster's floating island.
		baseBands = Config.RAINBOW,
		windowColor = C.cyan,
		-- Weighted props, in the web build's order so seeded picks match.
		decor = {
			{ "tree", 3 },
			{ "pine", 2 },
			{ "pot", 2 },
			{ "arcade", 1 },
			{ "cart", 1 },
			{ "topiary", 2 },
			{ "shrub", 2 },
			{ "pottree", 2 },
		},
		clouds = { C.cream, C.white },
		towers = {
			{ C.cream, C.creamDark },
			{ C.black, C.charcoal },
			{ C.cream, C.cyan },
		},
		towerWindow = C.pink,
		island = { top = C.grass, bands = Config.RAINBOW },
		balloons = { C.red, C.yellow, C.teal },
		-- The page background's radial gradient, centre to edge.
		sky = { hex(0xe6f5da), hex(0xd0e8c2), hex(0xb7d8ae) },
		goal = C.grass,
	},
}
