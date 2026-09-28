-- Level looks, ported from src/levels/skins.ts. Meadow, candy, desert and autumn so far; the others come with their levels.

local Config = require(script.Parent.Config)

local hex = Config.hex
local C = Config.COLORS

-- Alternating colours for a tier's terrace top (rainbow styles cycle through all of them) and wall.
local STYLE = {
	grass = { top = { C.grass, C.grassDark }, side = { C.stone, C.stoneDark } },
	tile = { top = { C.cream, C.creamDark }, side = { C.teal, C.cyan } },
	checker = { top = { C.charcoal, C.grey }, side = { C.pink, C.magenta } },
	rainbow = { top = Config.RAINBOW, side = { C.charcoal, C.grey } },
	candy = { top = { C.cream, C.pink }, side = { hex(0xffb3cf), C.cream } },
	mint = { top = { C.cyan, C.cream }, side = { C.purple, hex(0xb48ef0) } },
	sand = { top = { C.sand, hex(0xcbb788) }, side = { C.tan, C.orange } },
	brick = { top = { C.creamDark, C.sand }, side = { hex(0xc4553a), hex(0xa8432c) } },
	leaves = { top = { C.orange, C.maple }, side = { C.brown, hex(0x5e3920) } },
	harvest = { top = { C.yellow, C.tan }, side = { C.rust, C.maple } },
	moss = { top = { C.grassDark, C.leaf }, side = { C.stone, C.stoneDark } },
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
		-- What the boss throws; only the look changes, the physics and hitbox stay the same.
		projectile = "barrel",
		-- The ground monster, what drops from the ledges, and what the relic seal wants.
		crawler = "hedgehog",
		drop = "acorn",
		relic = { look = "idol", name = "idol" },
	},
	candy = {
		tiers = { STYLE.candy, STYLE.mint, STYLE.checker, STYLE.candy, STYLE.mint, STYLE.rainbow },
		baseBands = { C.pink, C.cream, C.purple, C.cream },
		windowColor = C.yellow,
		decor = {
			{ "lollipop", 4 },
			{ "pot", 2 },
			{ "arcade", 2 },
			{ "cart", 1 },
			{ "tree", 1 },
			{ "topiary", 2 },
			{ "pottree", 1 },
		},
		clouds = { hex(0xffe3f0), C.white },
		towers = {
			{ C.pink, hex(0xffb3cf) },
			{ C.purple, hex(0xb48ef0) },
			{ C.cream, C.cyan },
		},
		towerWindow = C.yellow,
		island = { top = C.cream, bands = { C.pink, C.cream, C.purple } },
		balloons = { C.pink, C.purple, C.cyan },
		sky = { hex(0xfde8f3), hex(0xf3cfe6), hex(0xd9b6e3) },
		goal = C.grass,
		projectile = "gumball",
		crawler = "hedgehog",
		drop = "acorn",
		relic = { look = "present", name = "present" },
	},
	desert = {
		tiers = { STYLE.sand, STYLE.brick, STYLE.tile, STYLE.sand, STYLE.brick, STYLE.checker, STYLE.rainbow },
		baseBands = { C.orange, C.tan, C.sand, hex(0xc4553a) },
		windowColor = C.teal,
		decor = {
			{ "cactus", 4 },
			{ "palm", 2 },
			{ "pot", 1 },
			{ "arcade", 1 },
			{ "cart", 1 },
			{ "pottree", 2 },
		},
		clouds = { hex(0xfff1dc), C.white },
		towers = {
			{ C.creamDark, C.sand },
			{ C.black, C.charcoal },
			{ C.tan, C.orange },
		},
		towerWindow = C.teal,
		island = { top = C.sand, bands = { C.orange, C.tan, hex(0xc4553a) } },
		balloons = { C.red, C.orange, C.blue },
		sky = { hex(0xfff1d6), hex(0xfbd9a8), hex(0xf0b88a) },
		goal = C.grass,
		projectile = "tumbleweed",
		crawler = "snake",
		drop = "spike",
		relic = { look = "idol", name = "idol" },
	},
	autumn = {
		tiers = { STYLE.moss, STYLE.leaves, STYLE.harvest, STYLE.leaves, STYLE.checker, STYLE.rainbow },
		baseBands = { C.maple, C.orange, C.yellow, C.brown },
		windowColor = C.yellow,
		decor = {
			{ "maple", 4 },
			{ "pumpkin", 3 },
			{ "haystack", 2 },
			{ "mushroom", 2 },
			{ "pine", 1 },
			{ "cart", 1 },
			{ "shrub", 1 },
		},
		clouds = { hex(0xfff0dc), C.white },
		towers = {
			{ C.cream, C.creamDark },
			{ C.rust, C.maple },
			{ C.black, C.charcoal },
		},
		towerWindow = C.yellow,
		island = { top = C.orange, bands = { C.brown, C.maple, C.yellow } },
		balloons = { C.maple, C.yellow, C.teal },
		sky = { hex(0xfff0d8), hex(0xf8d3a4), hex(0xe9a878) },
		goal = C.grass,
		projectile = "pumpkin",
		crawler = "hedgehog",
		drop = "acorn",
		relic = { look = "pumpkin", name = "pumpkin" },
	},
}
